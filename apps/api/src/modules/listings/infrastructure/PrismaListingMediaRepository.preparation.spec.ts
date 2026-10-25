import { describe, expect, it } from "vitest";
import { ClaimDatabase, type Row } from "../application/testing/UploadClaimsDatabase";
import { PrismaListingMediaRepository } from "./PrismaListingMediaRepository";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { ListingMedia } from "../domain/ListingMedia";

const now = new Date("2026-10-25T12:00:00Z");
const media = (id = "photo", uploadId: string | null = "upload-1") => ListingMedia.create({ id, listingId: "listing", kind: "image", key: "pending/upload-1/original.webp", sortOrder: 0, createdAt: now, ...(uploadId ? { uploadId } : {}) });
function setup(retirementInstant = now) {
  const db = new ClaimDatabase();
  db.tables["listings"] = [{ id: "listing", sellerId: "owner", businessId: null, status: "active" }];
  const query = db.tx.$queryRaw;
  db.tx.$queryRaw = async (sql, ...args) => {
    const text = "strings" in sql ? sql.strings.join("?") : sql.join("?");
    if (text.includes("SELECT id FROM listings") && text.includes("FOR UPDATE")) {
      if (!db.receipt) throw new Error("media_lock_before_preparation");
      return [];
    }
    return query(sql, ...args);
  };
  const delegate = {
    findUnique: async ({ where }: { where: Row }) => db.tables["listing_media"]?.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    findMany: async ({ where }: { where: Row }) => (db.tables["listing_media"] ?? []).filter(row => row["listingId"] === where["listingId"] && row["kind"] === where["kind"]),
    count: async ({ where }: { where: { listingId: string; kind: string; id: { not: string } } }) => (db.tables["listing_media"] ?? []).filter(row => row["listingId"] === where.listingId && row["kind"] === where.kind && row["id"] !== where.id.not).length,
    deleteMany: async ({ where }: { where: Row }) => {
      if (!db.receipt) throw new Error("media_write_before_preparation");
      const rows = db.tables["listing_media"] ?? [];
      db.tables["listing_media"] = rows.filter(row => row["id"] !== where["id"]);
      return { count: rows.length - db.tables["listing_media"].length };
    },
    create: async ({ data }: { data: Row }) => {
      if (!db.receipt) throw new Error("media_write_before_preparation");
      db.tables["listing_media"]?.push(data); return data;
    },
    delete: async ({ where }: { where: Row }) => {
      if (!db.receipt) throw new Error("media_write_before_preparation");
      const row = db.tables["listing_media"]?.find(row => row["id"] === where["id"]);
      if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
      db.tables["listing_media"] = db.tables["listing_media"]!.filter(item => item !== row); return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      if (!db.receipt) throw new Error("media_write_before_preparation");
      const row = db.tables["listing_media"]?.find(row => Object.entries(where).every(([key, value]) => row[key] === value));
      if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
      Object.assign(row, data); return row;
    },
  };
  Object.assign(db.tx, { listingMedia: delegate, listing: { findUnique: async ({ where }: { where: Row }) => db.tables["listings"]?.find(row => row["id"] === where["id"]) ?? null },
    mediaUpload: { findUnique: async ({ where }: { where: Row }) => db.tables["media_uploads"]?.find(row => row["id"] === where["id"]) ?? null } });
  Object.assign(db.prisma, { listingMedia: delegate });
  const claims = new PrismaUploadClaims(db.prisma, { now: () => retirementInstant });
  return { db, repository: new PrismaListingMediaRepository(db.prisma, claims) };
}
const reserve = { state: "PREPARING", claimToken: "token", claimTargetType: "listing", claimTargetId: "listing" };

describe("media caller preparation", () => {
  it("attaches a reserved upload and media atomically under one preparation", async () => {
    const { db, repository } = setup(); db.upload("upload-1", reserve);
    expect((await repository.save(media(), { token: "token" })).id).toBe("photo");
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "ADOPTED", claimToken: null });
    expect(db.tables["listing_media"]?.[0]).toMatchObject({ id: "photo", uploadId: "upload-1", listingId: "listing" });
    expect(db.finished).toBe(1);
  });
  it("prepares a media insert without provenance", async () => {
    const { db, repository } = setup();
    expect((await repository.save(media("legacy", null))).id).toBe("legacy");
    expect(db.finished).toBe(1);
  });
  it("returns the committed adopter for a joined retry", async () => {
    const { db, repository } = setup(); db.upload("upload-1", reserve);
    await repository.save(media(), { token: "token" });
    expect((await repository.save(media("retry"), { token: "token" })).id).toBe("photo");
    expect(db.tables["listing_media"]).toHaveLength(1);
  });
  it.each(["foreign token", "retired"])("refuses %s and leaves no adopter", async reason => {
    const { db, repository } = setup(); db.upload("upload-1", { ...reserve, ...(reason === "retired" ? { state: "RETIRED" } : {}) });
    await expect(repository.save(media(), { token: reason === "foreign token" ? "other" : "token" }))
      .rejects.toMatchObject({ code: reason === "retired" ? "UPLOAD_NOT_AVAILABLE" : "UPLOAD_ALREADY_ATTACHED" });
    expect(db.tables["listing_media"]).toEqual([]);
  });
  it("deletes media through its campaign prefix without retiring its upload", async () => {
    const { db, repository } = setup(); db.upload();
    db.tables["listing_media"] = [{ id: "photo", listingId: "listing", uploadId: "upload-1" }];
    await repository.delete("photo");
    expect(db.tables["listing_media"]).toEqual([]);
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "AVAILABLE" });
    expect(db.finished).toBe(1);
  });
  it("rolls back the full reorder when an ID belongs to another Listing", async () => {
    const { db, repository } = setup();
    db.tables["listing_media"] = [{ id: "photo", listingId: "listing", sortOrder: 1 }, { id: "foreign", listingId: "other", sortOrder: 2 }];
    await expect(repository.updateSortOrder("listing", [{ mediaId: "photo", sortOrder: 4 }, { mediaId: "foreign", sortOrder: 5 }])).rejects.toMatchObject({ code: "P2025" });
    expect(db.tables["listing_media"]?.map(row => row["sortOrder"])).toEqual([1, 2]);
  });

  it("releases media and records exact cleanup with the unchanged helper's later instant", async () => {
    const actual = new Date("2026-10-25T12:00:03.789Z");
    const { db, repository } = setup(actual); db.upload("upload-1", { ...reserve, state: "ADOPTED" });
    db.tables["listing_media"] = [{ id: "photo", listingId: "listing", kind: "image", key: "pending/upload-1/original.webp", uploadId: "upload-1" }];
    expect(await repository.deleteReleasingUpload("photo", 0)).toEqual({ removed: true });
    expect(db.tables["listing_media"]).toEqual([]);
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "RETIRED", retiredAt: actual, claimToken: null });
    expect(db.tables["media_upload_cleanups"]).toEqual([{ uploadId: "upload-1", key: "pending/upload-1/original.webp", objectKeys: ["pending/upload-1/original.webp"], writeProtocol: "conditional-v1", status: "PENDING" }]);
    expect(db.prepared).toContainEqual({ table: "media_uploads", key: { id: "upload-1" }, verb: "update", next: { state: "RETIRED", claimToken: null, claimDeadline: null } });
  });

  it("rolls back media deletion and retirement when cleanup fails after a distinct clock instant", async () => {
    const { db, repository } = setup(new Date("2026-10-25T12:00:05.123Z")); db.upload("upload-1", { ...reserve, state: "ADOPTED" });
    db.tables["listing_media"] = [{ id: "photo", listingId: "listing", kind: "image", key: "pending/upload-1/original.webp", uploadId: "upload-1" }];
    const before = structuredClone(db.tables); db.failWrite = 2;
    await expect(repository.deleteReleasingUpload("photo", 0)).rejects.toThrow("claim_write_sentinel");
    expect(db.tables).toEqual(before);
  });

  it("preserves the photo floor before deleting or retiring anything", async () => {
    const { db, repository } = setup(); db.upload("upload-1", { ...reserve, state: "ADOPTED" });
    db.tables["listing_media"] = [{ id: "photo", listingId: "listing", kind: "image", key: "pending/upload-1/original.webp", uploadId: "upload-1" }];
    const before = structuredClone(db.tables);
    await expect(repository.deleteReleasingUpload("photo", 1)).rejects.toMatchObject({ code: "PHOTO_MINIMUM_REQUIRED" });
    expect(db.tables).toEqual(before);
  });

  it.each([null, "mismatched-key"])("removes %s legacy provenance without retirement", async key => {
    const { db, repository } = setup(); db.upload("upload-1", { ...reserve, state: "ADOPTED" });
    db.tables["listing_media"] = [{ id: "photo", listingId: "listing", kind: "image", key: key ?? "legacy.webp", uploadId: key ? "upload-1" : null }];
    expect(await repository.deleteReleasingUpload("photo", 0)).toEqual({ removed: true });
    expect(db.tables["media_upload_cleanups"]).toEqual([]);
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "ADOPTED" });
  });
});
