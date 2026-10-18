import { randomUUID } from "node:crypto";

import type { S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaRetiredUploadLedger } from "../PrismaRetiredUploadLedger";

import { CleanVideo } from "./CleanVideo";
import { S3VideoCleanupObjects } from "./S3VideoCleanupObjects";
import { InMemoryS3VideoCleanup } from "./testing/InMemoryS3VideoCleanup";
import { PrismaVideoCleanupLedger } from "./PrismaVideoCleanupLedger";
const databaseUrl = process.env["DATABASE_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\//.test(databaseUrl);
const now = new Date("1990-01-02T00:00:00Z");
describe.skipIf(!hosted)("durable video cleanup authority on disposable PostgreSQL", () => {
  let db: PrismaService, ledger: PrismaVideoCleanupLedger;
  const userId = randomUUID(), ids: string[] = [], uploads: string[] = [];
  beforeAll(async () => { db = new PrismaService(); ledger = new PrismaVideoCleanupLedger(db); await db.user.create({ data: { id: userId } }); });
  async function clear() {
    await db.videoCleanupWork.deleteMany({ where: { id: { in: ids.map(id => `session:${id}`) } } });
    await db.videoProcessWork.deleteMany({ where: { generationId: { in: ids } } });
    await db.videoUploadSession.deleteMany({ where: { id: { in: ids } } });
    await db.videoGeneration.deleteMany({ where: { id: { in: ids } } });
    await db.mediaUploadCleanup.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.mediaUpload.deleteMany({ where: { id: { in: uploads } } });
  }
  beforeEach(clear);
  afterAll(async () => { if (!db) return; await clear(); await db.user.deleteMany({ where: { id: userId } }); await db.onModuleDestroy(); });
  async function retired() {
    const id = randomUUID(), uploadId = randomUUID(); ids.push(id); uploads.push(uploadId);
    const sourceKey = `video/v1/${uploadId}/${id}/source.mp4`, key = `video/v1/${uploadId}/${id}/poster.jpg`;
    await db.mediaUpload.create({ data: { id: uploadId, userId, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1000, writeProtocol: "video-v1", objectKeys: [sourceKey], state: "RETIRED", retiredAt: now } });
    await db.videoGeneration.create({ data: { id, uploadId, listingId: randomUUID(), state: "RETIRED", retiredAt: now } });
    await db.videoCleanupWork.create({ data: { id: `session:${id}`, uploadId, sessionId: id, generationId: id, sourceKey, objectKeys: [key], nextAttemptAt: now } });
    return { id, uploadId, cleanupId: `session:${id}`, key };
  }
  it("leases exclusively and requires a later second absence before declaring deletion", async () => {
    const row = await retired();
    const claims = await Promise.all([ledger.claim(now, randomUUID()), ledger.claim(now, randomUUID())]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const lease = claims.find(Boolean); if (!lease) return;
    expect(lease.verifying).toBe(false);
    await ledger.recordAbsence(lease, now);
    expect((await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).state).toBe("RETIRED");
    expect(await ledger.claim(now, randomUUID())).toBeNull();
    const later = new Date("1990-01-02T00:01:00Z"), proof = await ledger.claim(later, randomUUID());
    expect(proof).not.toBeNull(); if (!proof) return;
    expect(proof.verifying).toBe(true);
    await ledger.recordAbsence(proof, later);
    expect(await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).toMatchObject({ state: "DONE", completedAt: later });
    expect((await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).state).toBe("DELETED");
  });
  it("retries storage failures and completes two full sweeps through the actual deletion adapter", async () => {
    const row = await retired(), transport = new InMemoryS3VideoCleanup();
    transport.objects.add(row.key); transport.holdDeletes = true;
    let time = now;
    const cleanup = new CleanVideo(ledger, new S3VideoCleanupObjects(transport as unknown as S3Client, "private-video"), () => time, randomUUID);
    expect(await cleanup.execute()).toBe("retry");
    expect(transport.objects.has(row.key)).toBe(true);
    expect((await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).state).toBe("PENDING");
    transport.holdDeletes = false; time = new Date("1990-01-02T00:01:00Z");
    expect(await cleanup.execute()).toBe("absent");
    expect(transport.objects.size).toBe(0);
    expect((await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).state).toBe("VERIFYING");
    time = new Date("1990-01-02T00:02:00Z");
    expect(await cleanup.execute()).toBe("absent");
    expect((await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).state).toBe("DONE");
  });
  it("never leases live uploads, HELD inventory or a still-active processing lease", async () => {
    const row = await retired();
    await db.mediaUpload.update({ where: { id: row.uploadId }, data: { state: "AVAILABLE", retiredAt: null } });
    expect(await ledger.claim(now, randomUUID())).toBeNull();
    await db.mediaUpload.update({ where: { id: row.uploadId }, data: { state: "RETIRED", retiredAt: now } });
    await db.videoCleanupWork.update({ where: { id: row.cleanupId }, data: { state: "HELD" } });
    expect(await ledger.claim(now, randomUUID())).toBeNull();
    await db.videoCleanupWork.update({ where: { id: row.cleanupId }, data: { state: "PENDING" } });
    await db.videoProcessWork.create({ data: { generationId: row.id, uploadId: row.uploadId, sessionId: row.id, completionFence: randomUUID(), targetRevision: 1, processingVersion: "ffmpeg-debian-5.1.9-v1", state: "CANCELLED", leaseExpiresAt: new Date("1990-01-02T00:20:00Z") } });
    expect(await ledger.claim(now, randomUUID())).toBeNull();
  });
  it("leaves video expiry to its dedicated lifecycle rather than image cleanup", async () => {
    const row = await retired();
    await db.mediaUpload.update({ where: { id: row.uploadId }, data: { state: "PREPARING", retiredAt: null, claimToken: row.id, claimTargetType: "video_session", claimTargetId: row.id, claimDeadline: new Date("1990-01-01T00:00:00Z") } });
    await new PrismaRetiredUploadLedger(db).retireExpiredPreparations(now, 100);
    expect((await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).state).toBe("PREPARING");
    expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: row.uploadId } })).toBeNull();
  });
  it.each(["UPLOADING", "READY", "PROCESSING"])("retires expired private %s sessions with exact inventory and credential grace", async state => {
    const row = await retired(), sourceKey = `video/v1/${row.uploadId}/${row.id}/source.mp4`;
    await db.videoCleanupWork.delete({ where: { id: row.cleanupId } });
    await db.mediaUpload.update({ where: { id: row.uploadId }, data: { state: "PREPARING", retiredAt: null, claimToken: row.id, claimTargetType: "video_session", claimTargetId: row.id, claimDeadline: new Date("1990-01-01T00:00:00Z") } });
    await db.videoUploadSession.create({ data: { id: row.id, uploadId: row.uploadId, userId, protocolVersion: 1, targetKind: "draft", targetId: randomUUID(), targetRevision: 1, state, sourceKey, sizeBytes: 1000, sha256: "a".repeat(64), posterMs: 0, expiresAt: new Date("1990-01-01T00:00:00Z") } });
    const assets = [{ path: "poster.jpg", key: row.key, sizeBytes: 100, sha256: "b".repeat(64), purpose: "poster", contentType: "image/jpeg" }];
    await db.videoGeneration.update({ where: { id: row.id }, data: { sessionId: row.id, state, retiredAt: null, manifest: { assets } } });
    expect(await ledger.claim(now, randomUUID())).toBeNull();
    expect(await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).toMatchObject({ state: "RETIRED", claimToken: null, claimDeadline: null });
    expect(await db.videoGeneration.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ state: "RETIRED", retiredAt: now });
    expect(await db.videoUploadSession.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ state: "CLEANUP_PENDING" });
    expect(await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).toMatchObject({ state: "PENDING", sourceKey, objectKeys: [row.key], nextAttemptAt: new Date("1990-01-02T00:17:00Z") });
  });
  it("keeps exact durable authority when source records disappear and ignores stale workers", async () => {
    const row = await retired();
    await db.mediaUpload.delete({ where: { id: row.uploadId } }); await db.videoGeneration.delete({ where: { id: row.id } });
    const lease = await ledger.claim(now, randomUUID()); expect(lease).not.toBeNull(); if (!lease) return;
    await ledger.recordAbsence({ ...lease, token: randomUUID() }, now);
    expect((await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).state).not.toBe("DONE");
    await ledger.fail(lease, now, "VIDEO_CLEANUP_OBJECT_PRESENT");
    expect(await db.videoCleanupWork.findUniqueOrThrow({ where: { id: row.cleanupId } })).toMatchObject({ state: "PENDING", objectKeys: [row.key], lastError: "VIDEO_CLEANUP_OBJECT_PRESENT" });
  });
});
