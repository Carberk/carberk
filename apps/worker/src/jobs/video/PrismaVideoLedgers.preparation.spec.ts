import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProcessPreparedVideo } from "./ProcessPreparedVideo";
import { CleanVideo } from "./CleanVideo";
import { PrismaVideoProcessingLedger } from "./PrismaVideoProcessingLedger";
import { PrismaVideoCleanupLedger } from "./PrismaVideoCleanupLedger";
import type { VideoProcessingLease, VideoPublishedAsset } from "./VideoProcessingPorts";
import { VideoDatabase } from "./testing/VideoDatabase";

const now = new Date("2026-10-25T12:00:00Z");
const id = "00000000-0000-4000-8000-000000000001", uploadId = "00000000-0000-4000-8000-000000000002", token = "00000000-0000-4000-8000-000000000003";
const sourceKey = `video/v1/${uploadId}/${id}/source.mp4`;
const assets: VideoPublishedAsset[] = [
  { path: "master.m3u8", key: `video/v1/${uploadId}/${id}/master.m3u8`, sizeBytes: 100, sha256: "b".repeat(64), purpose: "playback", contentType: "application/vnd.apple.mpegurl" },
  { path: "poster.jpg", key: `video/v1/${uploadId}/${id}/poster.jpg`, sizeBytes: 100, sha256: "c".repeat(64), purpose: "poster", contentType: "image/jpeg" },
];
const lease: VideoProcessingLease = { generationId: id, uploadId, sessionId: id, completionFence: "fence", targetRevision: 1, leaseToken: token, sourceKey, sizeBytes: 1000, sha256: "a".repeat(64), posterMs: 0 };
function fixture(business = false, draft = false) {
  const db = new VideoDatabase();
  db.put("users", { id: "user", suspendedAt: null, deletionScheduledAt: null });
  if (business) { db.put("dealerships", { id: "business", status: "active" }); db.put("dealership_members", { id: "member", userId: "user", dealershipId: "business", status: "active", role: "owner" }); }
  db.put(draft ? "listing_drafts" : "listings", { id: "target", sellerId: "user", userId: "user", businessId: business ? "business" : null, status: "active", activeVideoGenerationId: null, pendingVideoGenerationId: id, activeVideoRevision: 1 });
  db.put("media_uploads", { id: uploadId, userId: "user", businessId: business ? "business" : null, kind: "video", key: sourceKey, sizeBytes: 1000, writeProtocol: "video-v1", state: "PREPARING", claimToken: id, claimTargetType: "video_session", claimTargetId: id, objectKeys: [sourceKey] });
  db.put("video_upload_sessions", { id, userId: "user", uploadId, listingId: draft ? null : "target", targetKind: draft ? "draft" : "listing", targetId: "target", targetRevision: 1, protocolVersion: 1, state: "PROCESSING", cancelledAt: null, completedAt: now, sha256: lease.sha256, sizeBytes: 1000, posterMs: 0, completionFence: "fence", sourceKey, storageUploadId: "multipart", expiresAt: new Date("2026-11-01") });
  db.put("video_generations", { id, sessionId: id, uploadId, listingId: "target", targetRevision: 1, completionFence: "fence", processingVersion: "ffmpeg-debian-5.1.9-v1", state: "PROCESSING", manifest: null, retiredAt: null });
  db.put("video_process_work", { generationId: id, uploadId, sessionId: id, targetRevision: 1, completionFence: "fence", processingVersion: "ffmpeg-debian-5.1.9-v1", state: "PENDING", attempts: 0, nextAttemptAt: now, leaseToken: null, leaseExpiresAt: null });
  return { db, ledger: new PrismaVideoProcessingLedger(db.prisma, { isEligible: () => true }), cleanup: new PrismaVideoCleanupLedger(db.prisma) };
}
describe("video worker prepared outer transactions", () => {
  it.each([[false, false], [false, true], [true, false], [true, true]])("claims, plans and adopts business=%s draft=%s with exact lease and inventory", async (business, draft) => {
    const f = fixture(business, draft);
    const claimed = await f.ledger.claim(id, now, token);
    expect(claimed).toEqual(lease);
    expect(await f.ledger.claim(id, now, "00000000-0000-4000-8000-000000000004")).toBeNull();
    expect(await f.ledger.plan(lease, assets, now)).toBe(true);
    expect(f.db.rows["video_cleanup_work"]?.[0]).toMatchObject({ state: "HELD", objectKeys: assets.map(a => a.key) });
    expect(await f.ledger.adopt(lease, { assets, sourceSha256: lease.sha256, durationMs: 1000, width: 960, height: 540 }, now)).toBe(true);
    expect(f.db.rows["video_generations"]?.[0]).toMatchObject({ state: "READY", durationMs: 1000, posterKey: `video/v1/${uploadId}/${id}/poster.jpg` });
    expect(f.db.rows["video_process_work"]?.[0]).toMatchObject({ state: "COMPLETED", leaseToken: null, leaseExpiresAt: null });
    expect(f.db.rows["media_uploads"]?.[0]).toMatchObject({ state: draft ? "PREPARING" : "ADOPTED", claimTargetType: draft ? "video_session" : "listing" });
  });
  it("rolls back READY, upload and pointer changes after a reached adoption write fails", async () => {
    const f = fixture(); await f.ledger.claim(id, now, token); await f.ledger.plan(lease, assets, now);
    const saved = structuredClone(f.db.rows); f.db.failAfterWrite = true; f.db.reachedWrite = false;
    await expect(f.ledger.adopt(lease, { assets, sourceSha256: lease.sha256, durationMs: 1000, width: 960, height: 540 }, now)).rejects.toThrow("FAKE_POSTWRITE_FAILURE");
    expect(f.db.reachedWrite).toBe(true); expect(f.db.rows).toEqual(saved);
  });
  it("refuses changed discovery after a wait without granting a worker lease", async () => {
    const f = fixture(); f.db.changeAfterLocks = () => { f.db.row("video_process_work")["completionFence"] = "other"; };
    await expect(f.ledger.claim(id, now, token)).rejects.toThrow("VIDEO_PREPARATION_CHANGED");
    expect(f.db.reachedWrite).toBe(false);
    expect(f.db.rows["video_process_work"]?.[0]).toMatchObject({ attempts: 0, leaseToken: null });
  });
  it("persists bounded retry and refuses stale fail tokens", async () => {
    const f = fixture(); await f.ledger.claim(id, now, token);
    await f.ledger.fail({ ...lease, leaseToken: "stale" }, "VIDEO_PROCESSING_TIMEOUT", now);
    expect(f.db.rows["video_process_work"]?.[0]).toMatchObject({ state: "PROCESSING", leaseToken: token });
    await f.ledger.fail(lease, "VIDEO_PROCESSING_TIMEOUT", now);
    expect(f.db.rows["video_process_work"]?.[0]).toMatchObject({ state: "PENDING", leaseToken: null, nextAttemptAt: new Date("2026-10-25T12:01:00Z"), lastError: "VIDEO_PROCESSING_TIMEOUT" });
  });
  it("retires an expired session and retains exact cleanup grace", async () => {
    const f = fixture();
    Object.assign(f.db.row("video_upload_sessions"), { state: "UPLOADING", expiresAt: new Date("2026-10-24") });
    expect(await f.cleanup.claim(now, token)).toBeNull();
    expect(f.db.rows["video_upload_sessions"]?.[0]).toMatchObject({ state: "CLEANUP_PENDING", cancelledAt: now });
    expect(f.db.rows["video_cleanup_work"]?.[0]).toMatchObject({ state: "PENDING", nextAttemptAt: new Date("2026-10-25T12:17:00Z"), objectKeys: [] });
  });
  it("requires a later independent absence before marking the retired source deleted", async () => {
    const f = fixture();
    Object.assign(f.db.row("media_uploads"), { state: "RETIRED" });
    Object.assign(f.db.row("video_generations"), { state: "RETIRED", retiredAt: now });
    Object.assign(f.db.row("video_upload_sessions"), { state: "CLEANUP_PENDING" });
    Object.assign(f.db.row("listings"), { pendingVideoGenerationId: null });
    f.db.put("video_cleanup_work", { id: `session:${id}`, uploadId, sessionId: id, generationId: id, sourceKey, objectKeys: assets.map(a => a.key), writeProtocol: "video-v1", state: "PENDING", nextAttemptAt: now, attempts: 0, leaseToken: null, leaseExpiresAt: null });
    const first = await f.cleanup.claim(now, token); expect(first).not.toBeNull();
    if (!first) throw new Error("Expected first cleanup lease");
    await f.cleanup.recordAbsence(first, now);
    expect(f.db.rows["video_cleanup_work"]?.[0]).toMatchObject({ state: "VERIFYING", nextAttemptAt: new Date("2026-10-25T12:01:00Z") });
    expect(f.db.rows["media_uploads"]?.[0]?.["state"]).toBe("RETIRED");
    const later = new Date("2026-10-25T12:01:00Z");
    const second = await f.cleanup.claim(later, token); expect(second?.verifying).toBe(true);
    if (!second) throw new Error("Expected second cleanup lease");
    await f.cleanup.recordAbsence(second, later);
    expect(f.db.rows["video_cleanup_work"]?.[0]).toMatchObject({ state: "DONE", completedAt: later });
    expect(f.db.rows["media_uploads"]?.[0]?.["state"]).toBe("DELETED");
    expect(f.db.rows["video_upload_sessions"]?.[0]?.["state"]).toBe("DELETED");
  });
});

describe("video external phases with production ledgers", () => {
  it("disposes the downloaded source even when output disposal rejects after adoption", async () => {
    const f = fixture();
    const directory = await mkdtemp(join(tmpdir(), "r6b-dispose-"));
    let sourceDisposed = false;
    try {
      await writeFile(join(directory, "master.m3u8"), "#EXTM3U\n");
      const process = new ProcessPreparedVideo(f.ledger, {
        download: async () => ({ path: join(directory, "source.mp4"), dispose: async () => { sourceDisposed = true; } }),
        publish: async () => {}, verify: async () => true,
      }, { process: async () => ({ directory, durationMs: 1000, width: 960, height: 540, sourceSha256: lease.sha256, renditions: [], assets, dispose: async () => { throw new Error("OUTPUT_DISPOSAL_FAILED"); } }) }, () => now, () => token);
      expect(await process.execute(id)).toBe("adopted");
      expect(f.db.row("video_generations")).toMatchObject({ state: "READY" });
      expect(sourceDisposed).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("keeps exact output cleanup authority after storage readback fails", async () => {
    const f = fixture();
    const directory = await mkdtemp(join(tmpdir(), "r6b-readback-"));
    let outputDisposed = false, sourceDisposed = false;
    try {
      await writeFile(join(directory, "master.m3u8"), "#EXTM3U\n");
      const process = new ProcessPreparedVideo(f.ledger, {
        download: async () => ({ path: join(directory, "source.mp4"), dispose: async () => { sourceDisposed = true; } }),
        publish: async () => {}, verify: async () => false,
      }, { process: async () => ({ directory, durationMs: 1000, width: 960, height: 540, sourceSha256: lease.sha256, renditions: [], assets, dispose: async () => { outputDisposed = true; } }) }, () => now, () => token);
      expect(await process.execute(id)).toBe("failed");
      expect(f.db.row("listings")["activeVideoGenerationId"]).toBeNull();
      expect(f.db.row("video_cleanup_work")).toMatchObject({ state: "HELD", objectKeys: assets.map(a => a.key) });
      expect(f.db.row("video_process_work")).toMatchObject({ state: "PENDING", lastError: "VIDEO_READBACK_FAILED" });
      expect(outputDisposed && sourceDisposed).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("persists cleanup retry without declaring deleted bytes restored by SQL", async () => {
    const f = fixture();
    Object.assign(f.db.row("media_uploads"), { state: "RETIRED" });
    Object.assign(f.db.row("video_generations"), { state: "RETIRED", retiredAt: now });
    Object.assign(f.db.row("video_upload_sessions"), { state: "CLEANUP_PENDING" });
    Object.assign(f.db.row("listings"), { pendingVideoGenerationId: null });
    f.db.put("video_cleanup_work", { id: `session:${id}`, uploadId, sessionId: id, generationId: id, sourceKey, objectKeys: [], writeProtocol: "video-v1", state: "PENDING", nextAttemptAt: now, attempts: 0, leaseToken: null, leaseExpiresAt: null });
    const clean = new CleanVideo(f.cleanup, { removeAndVerify: async () => { throw new Error("VIDEO_CLEANUP_UNAVAILABLE"); } }, () => now, () => token);
    expect(await clean.execute()).toBe("retry");
    expect(f.db.row("video_cleanup_work")).toMatchObject({ state: "PENDING", leaseToken: null, lastError: "VIDEO_CLEANUP_UNAVAILABLE", nextAttemptAt: new Date("2026-10-25T12:01:00Z") });
    expect(f.db.row("media_uploads")["state"]).toBe("RETIRED");
  });
});
