import { describe, expect, it } from "vitest";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { ClaimDatabase } from "./PrismaUploadClaims.preparation.fixture";

const now = new Date("2026-10-25T12:00:00Z");
const target = { type: "listing" as const, id: "new-listing" };
const held = { state: "PREPARING", claimToken: "token", claimTargetType: "listing", claimTargetId: "new-listing", claimDeadline: "2026-10-25T12:10:00Z" };
function setup() { const db = new ClaimDatabase(); return { db, claims: new PrismaUploadClaims(db.prisma, { now: () => now }) }; }

describe("upload claim transaction preparation", () => {
  it("reserves the complete batch before any managed lock and keeps the clock deadline", async () => {
    const { db, claims } = setup(); db.upload(); db.upload("upload-2");
    const result = await claims.reserve({ userId: "owner", uploadIds: ["upload-2", "upload-1"], target });
    expect(result).toMatchObject({ joined: false });
    expect(db.tables["media_uploads"]!.map(r => [r["state"], r["claimDeadline"]])).toEqual([["PREPARING", new Date("2026-10-25T12:10:00Z")], ["PREPARING", new Date("2026-10-25T12:10:00Z")]]);
    expect(db.finished).toBe(1);
  });
  it("abandons all token rows with their exact independent manifests", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("upload-2", { ...held, writeProtocol: "legacy", objectKeys: ["legacy/exact"] }); db.upload("foreign", { ...held, claimToken: "foreign" });
    await claims.abandon("token");
    expect(db.tables["media_upload_cleanups"]).toEqual([
      { uploadId: "upload-1", key: "pending/upload-1/original.webp", objectKeys: ["pending/upload-1/original.webp"], writeProtocol: "conditional-v1", status: "PENDING" },
      { uploadId: "upload-2", key: "pending/upload-2/original.webp", objectKeys: ["legacy/exact"], writeProtocol: "legacy", status: "LEGACY_PENDING" },
    ]);
    expect(db.tables["media_uploads"]![2]).toMatchObject({ id: "foreign", state: "PREPARING", claimToken: "foreign" });
  });
  it("refuses changed stored owners after a preparation wait without replay", async () => {
    const { db, claims } = setup(); db.upload(); db.afterWait = () => { db.tables["media_uploads"]![0]!["userId"] = "foreign"; };
    await expect(claims.reserve({ userId: "owner", uploadIds: ["upload-1"], target })).rejects.toThrow("upload_claim_scope_changed");
    expect(db.tables["media_uploads"]![0]).toMatchObject({ state: "AVAILABLE", claimToken: null });
  });
  it.each(["finalize", "retire"] as const)("refuses an unprepared supplied %s before locks", async method => {
    const { db, claims } = setup(); db.upload("upload-1", held);
    const action = method === "retire" ? claims.retire(db.tx, "upload-1") : claims.finalize(db.tx, { token: "token", uploadIds: ["upload-1"], target });
    await expect(action).rejects.toThrow("upload_claim_preparation_missing");
    expect(db.tables["media_uploads"]![0]!["state"]).toBe("PREPARING");
  });
});
