import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PrismaOwnedVideoSessionLedger } from "./PrismaOwnedVideoSessionLedger";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { VideoDatabase } from "./testing/VideoDatabase";
import { videoAuthority } from "./testing/VideoAuthority";

const now = new Date("2026-10-25T12:00:00Z");
const actor = { userId: "viewer", sessionId: "session" };
const input = { protocolVersion: 1 as const, target: { kind: "listing" as const, id: "listing" }, prepared: { sizeBytes: 1000, sha256: "a".repeat(64) }, posterMs: 0, idempotencyKey: "first-video" };
function fixture(business = false, draft = false) {
  const db = new VideoDatabase();
  const member = { id: "member", userId: "viewer", dealershipId: "business", role: "owner", status: "active", dealership: { id: "business", status: "active" } };
  db.put("users", { id: "viewer", suspendedAt: null, deletionScheduledAt: null });
  db.put("sessions", { id: "session", userId: "viewer", expiresAt: new Date("2026-10-26"), user: { id: "viewer", suspendedAt: null, deletionScheduledAt: null, dealershipMemberships: business ? [member] : [] } });
  if (business) { db.put("dealership_members", member); db.put("dealerships", { id: "business", status: "active" }); }
  db.put(draft ? "listing_drafts" : "listings", { id: "listing", userId: "viewer", sellerId: "viewer", businessId: business ? "business" : null, status: "active", activeVideoRevision: 0, activeVideoGenerationId: null, pendingVideoGenerationId: null });
  const clock = { now: () => now };
  const { authority, ownership, eligibility } = videoAuthority(db.prisma, clock);
  let next = 0;
  const ledger = new PrismaOwnedVideoSessionLedger(db.prisma, authority, ownership, clock, eligibility, new PrismaUploadClaims(db.prisma, clock, ownership), () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`);
  const subject = business ? { ...actor, businessId: "business" } : actor;
  const request = draft ? { ...input, target: { kind: "draft" as const, id: "listing" } } : input;
  return { db, ledger, subject, request };
}
describe("owned video outer transaction preparation", () => {
  it.each([[false, false], [false, true], [true, false], [true, true]])("reserves and completes personal/business=%s draft=%s through persisted authority", async (business, draft) => {
    const f = fixture(business, draft);
    const reserved = await f.ledger.reserve(f.subject, f.request);
    expect(reserved).toMatchObject({ initialize: true, session: { id: "00000000-0000-4000-8000-000000000001", uploadId: "00000000-0000-4000-8000-000000000002", state: "INITIALIZING", expiresAt: new Date("2026-11-01T12:00:00Z") } });
    const id = reserved.session.id;
    expect(await f.ledger.reserve(f.subject, f.request)).toMatchObject({ initialize: false, session: { id } });
    expect(await f.ledger.bindInitialization(f.subject, id, "multipart")).toMatchObject({ state: "UPLOADING", storageUploadId: "multipart" });
    expect(await f.ledger.change(f.subject, id, "pause")).toMatchObject({ state: "PAUSED" });
    expect(await f.ledger.change(f.subject, id, "resume")).toMatchObject({ state: "UPLOADING" });
    expect(await f.ledger.read(f.subject, id)).toMatchObject({ id, state: "UPLOADING" });
    expect(await f.ledger.targetState(f.subject, draft ? "draft" : "listing", "listing")).toMatchObject({ active: null, pending: { sessionId: id, state: "UPLOADING" } });
    const completion = await f.ledger.beginCompletion(f.subject, id);
    expect(completion).toMatchObject({ state: "COMPLETING" });
    await expect(f.ledger.commitCompletion(f.subject, id, "wrong-fence")).rejects.toThrow("VIDEO_SESSION_UNAVAILABLE");
    expect(f.db.rows["video_process_work"] ?? []).toHaveLength(0);
    expect(await f.ledger.commitCompletion(f.subject, id, completion.completionFence!)).toMatchObject({ state: "PROCESSING" });
    expect(await f.ledger.commitCompletion(f.subject, id, completion.completionFence!)).toMatchObject({ state: "PROCESSING" });
    expect(f.db.rows["video_process_work"]).toHaveLength(1);
  });
  it("retires a pending session through the exact supplied helper without nested preparation", async () => {
    const f = fixture(); const { session } = await f.ledger.reserve(f.subject, f.request);
    await f.ledger.cancelPending(f.subject, "listing");
    expect(f.db.rows["media_uploads"]?.[0]).toMatchObject({ state: "RETIRED", claimToken: null, claimDeadline: null });
    expect(f.db.rows["video_upload_sessions"]?.[0]).toMatchObject({ state: "CLEANUP_PENDING", cancelledAt: now });
    expect(f.db.rows["video_cleanup_work"]?.[0]).toMatchObject({ id: `session:${session.id}`, objectKeys: [], nextAttemptAt: new Date("2026-10-25T12:17:00Z") });
    expect(f.db.rows["media_upload_cleanups"]?.[0]).toMatchObject({ uploadId: session.uploadId, status: "LEGACY_PENDING" });
    expect(f.db.rows["listings"]?.[0]).toMatchObject({ pendingVideoGenerationId: null, activeVideoRevision: 2 });
  });
  it("rolls back all persisted rows when a later reserve write fails", async () => {
    const f = fixture(); f.db.failAfterWrite = true;
    await expect(f.ledger.reserve(f.subject, f.request)).rejects.toThrow("FAKE_POSTWRITE_FAILURE");
    expect(f.db.reachedWrite).toBe(true);
    expect(f.db.rows["media_uploads"] ?? []).toEqual([]);
    expect(f.db.rows["video_upload_sessions"] ?? []).toEqual([]);
    expect(f.db.rows["video_generations"] ?? []).toEqual([]);
    expect(f.db.rows["listings"]?.[0]).toMatchObject({ activeVideoRevision: 0, pendingVideoGenerationId: null });
  });
  it.each(["session", "user", "target", "protocol", "revision", "foreign-upload"])("refuses changed %s before completion writes", async fault => {
    const f = fixture(); const { session } = await f.ledger.reserve(f.subject, f.request);
    await f.ledger.bindInitialization(f.subject, session.id, "multipart");
    // Explicit persisted fault injection at the DB boundary, not a production opponent.
    if (fault === "session") f.db.rows["sessions"] = [];
    if (fault === "user") f.db.rows["sessions"]![0]!["userId"] = "foreign";
    if (fault === "target") f.db.rows["listings"]![0]!["sellerId"] = "foreign";
    if (fault === "protocol") f.db.rows["video_upload_sessions"]![0]!["protocolVersion"] = 2;
    if (fault === "revision") f.db.rows["listings"]![0]!["activeVideoRevision"] = 2;
    if (fault === "foreign-upload") f.db.rows["media_uploads"]![0]!["userId"] = "foreign";
    const saved = structuredClone(f.db.rows); f.db.reachedWrite = false;
    await expect(f.ledger.beginCompletion(f.subject, session.id)).rejects.toThrow("VIDEO_SESSION_UNAVAILABLE");
    expect(f.db.reachedWrite).toBe(false); expect(f.db.rows).toEqual(saved);
  });
});
