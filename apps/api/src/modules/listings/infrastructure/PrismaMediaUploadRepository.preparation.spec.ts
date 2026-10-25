import { describe, expect, it } from "vitest";
import { PrismaMediaUploadRepository } from "./PrismaMediaUploadRepository";
import { ClaimDatabase, type Row } from "../application/testing/UploadClaimsDatabase";
import type { NewMediaUpload } from "../domain/MediaUpload";

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
    return query(sql, ...args);
  };
  Object.assign(db.tx, { mediaUpload: {
    create: async ({ data }: { data: Row }) => {
      if (!db.receipt) throw new Error("registration_without_preparation");
      db.tables["media_uploads"]?.push({ ...data, state: "AVAILABLE", media: null });
      return data;
    },
  } });
  return { db, repository: new PrismaMediaUploadRepository(db.prisma), failFinish: () => { rejectFinish = true; } };
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
});
