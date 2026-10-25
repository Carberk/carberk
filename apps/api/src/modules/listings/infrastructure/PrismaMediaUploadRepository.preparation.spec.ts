import { describe, expect, it } from "vitest";
import { PrismaMediaUploadRepository } from "./PrismaMediaUploadRepository";
import { ClaimDatabase, type Row } from "../application/testing/UploadClaimsDatabase";
import type { NewMediaUpload } from "../domain/MediaUpload";
import { CheckBusinessAuthority } from "../../identity/application/CheckBusinessAuthority";
import { PrismaBusinessAuthority } from "../../identity/infrastructure/PrismaBusinessAuthority";
import { ListingOwnership } from "../application/ListingOwnership";

const upload: NewMediaUpload = { id: "registered", userId: "owner", key: "pending/registered/original.webp",
  kind: "image", contentType: "image/webp", sizeBytes: 42, createdAt: new Date("2026-10-25T12:00:00Z"),
  writeProtocol: "conditional-v1", objectKeys: ["pending/registered/original.webp"] };

// Extend the accepted offline database boundary only with this owned entry's
// Prisma insert/read delegates. This does not simulate PostgreSQL constraints.
function setup() {
  const db = new ClaimDatabase();
  let rejectFinish = false;
  const query = db.tx.$queryRaw;
  db.tx.$queryRaw = async (sql, ...args) => {
    const text = "strings" in sql ? sql.strings.join("?") : sql.join("?");
    if (text.includes("campaign_finish(") && rejectFinish) throw new Error("registration_finish_fault");
    if (text.includes('SELECT "id"') && text.includes("FOR UPDATE")) {
      if (!db.receipt) throw new Error("authority_before_registration_preparation");
      return [];
    }
    return query(sql, ...args);
  };
  Object.assign(db.tx, { mediaUpload: {
    create: async ({ data }: { data: Row }) => {
      if (!db.receipt) throw new Error("registration_without_preparation");
      db.tables["media_uploads"]?.push({ ...data, state: "AVAILABLE", media: null });
      return data;
    },
  }, dealershipMember: { findUnique: async () => db.tables["dealership_members"]?.find(row => row["userId"] === "owner") ?? null },
  session: { findUnique: async () => {
    const session = db.tables["sessions"]?.[0];
    if (!session) return null;
    const user = db.tables["users"]?.find(row => row["id"] === session["userId"]);
    const memberships = (db.tables["dealership_members"] ?? []).filter(row => row["userId"] === user?.["id"])
      .map(row => ({ ...row, dealership: db.tables["dealerships"]?.find(business => business["id"] === row["dealershipId"]) }));
    return { ...session, user: { ...user, dealershipMemberships: memberships } };
  } } });
  const authority = new CheckBusinessAuthority(new PrismaBusinessAuthority(db.prisma), { now: () => new Date("2026-10-25T12:00:00Z") });
  return { db, repository: new PrismaMediaUploadRepository(db.prisma, new ListingOwnership(authority)), failFinish: () => { rejectFinish = true; } };
}

describe("upload registration preparation", () => {
  it("records the exact provenance and manifest under one finished preparation", async () => {
    const { db, repository } = setup();
    await repository.record(upload);
    expect(db.tables["media_uploads"]).toEqual([{ ...upload, businessId: null, state: "AVAILABLE", media: null }]);
    expect(db.finished).toBe(1);
    expect(db.prepared).toContainEqual({ table: "media_uploads", key: { id: "registered" }, verb: "insert",
      next: { ...upload, createdAt: "2026-10-25T12:00:00.000Z", businessId: null } });
  });

  it("covers the retained owner's recursive avatar and suspender endpoints", async () => {
    const { db, repository } = setup();
    db.tables["users"] = [{ id: "owner", avatarUploadId: "avatar", suspendedById: "moderator" }, { id: "moderator", avatarUploadId: null }];
    db.upload("avatar");
    await repository.record(upload);
    expect(db.prepared).toContainEqual({ table: "users", key: { id: "moderator" }, verb: "update", next: {} });
    expect(db.prepared).toContainEqual({ table: "media_uploads", key: { id: "avatar" }, verb: "update", next: {} });
  });

  it("refuses an owner graph that changes while waiting before inserting provenance", async () => {
    const { db, repository } = setup();
    db.afterWait = () => { db.tables["users"] = [{ id: "owner", avatarUploadId: "new-avatar" }]; };
    await expect(repository.record(upload)).rejects.toThrow("media_registration_scope_changed");
    expect(db.tables["media_uploads"]).toEqual([]);
  });

  it("rolls the provenance back on an injected campaign finish failure", async () => {
    const { db, repository, failFinish } = setup(); failFinish();
    await expect(repository.record(upload)).rejects.toThrow("registration_finish_fault");
    expect(db.tables["media_uploads"]).toEqual([]);
  });

  it("keeps Business registration closed without a current actor", async () => {
    const { db, repository } = setup();
    await expect(repository.record({ ...upload, businessId: "business" })).rejects.toThrow("Business upload requires current actor");
    expect(db.tables["media_uploads"]).toEqual([]);
  });

  it("records Business provenance only with current Session and membership authority", async () => {
    const { db, repository } = setup();
    db.tables["sessions"] = [{ id: "session", userId: "owner", expiresAt: new Date("2026-10-26T12:00:00Z") }];
    db.tables["dealerships"] = [{ id: "business", status: "active" }];
    db.tables["dealership_members"] = [{ id: "member", userId: "owner", dealershipId: "business", role: "owner", status: "active" }];
    await repository.record({ ...upload, businessId: "business" }, { userId: "owner", sessionId: "session", businessId: "business" });
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ id: "registered", businessId: "business", userId: "owner" });
    expect(db.prepared).toContainEqual({ table: "sessions", key: { id: "session" }, verb: "update", next: {} });
    expect(db.prepared).toContainEqual({ table: "dealership_members", key: { id: "member" }, verb: "update", next: {} });
  });

  it.each(["revoked", "expired", "suspended"])("refuses a %s Business actor without provenance", async reason => {
    const { db, repository } = setup();
    db.tables["sessions"] = [{ id: "session", userId: "owner", expiresAt: new Date(reason === "expired" ? "2026-10-24T12:00:00Z" : "2026-10-26T12:00:00Z") }];
    db.tables["dealerships"] = [{ id: "business", status: reason === "suspended" ? "suspended" : "active" }];
    db.tables["dealership_members"] = reason === "revoked" ? [] : [{ id: "member", userId: "owner", dealershipId: "business", role: "owner", status: "active" }];
    await expect(repository.record({ ...upload, businessId: "business" }, { userId: "owner", sessionId: "session", businessId: "business" }))
      .rejects.toMatchObject({ response: { code: "FORBIDDEN", details: { reason: reason === "revoked" ? "MEMBERSHIP_REQUIRED" : reason === "expired" ? "SESSION_REQUIRED" : "BUSINESS_INACTIVE" } } });
    expect(db.tables["media_uploads"]).toEqual([]);
  });
});
