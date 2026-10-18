import { randomUUID } from "node:crypto";

import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PurgeExpiredAccounts } from "../PurgeExpiredAccounts";

const url = process.env["DATABASE_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\//.test(url);
describe.skipIf(!hosted)("video personal-account purge authority", () => {
 let db: PrismaService;
 const userId = randomUUID(), draftId = randomUUID(), id = randomUUID(), uploadId = randomUUID();
 const now = new Date("1980-01-02T00:00:00Z"), sourceKey = `video/v1/${uploadId}/${id}/source.mp4`, posterKey = `video/v1/${uploadId}/${id}/poster.jpg`;
 beforeAll(async () => { db = new PrismaService(); await db.user.create({ data: { id: userId, deletionScheduledAt: new Date("1980-01-01T00:00:00Z") } }); });
 afterAll(async () => {
  if (!db) return;
  await db.videoCleanupWork.deleteMany({ where: { uploadId } });
  await db.videoProcessWork.deleteMany({ where: { generationId: id } });
  await db.videoGeneration.deleteMany({ where: { id } });
  await db.videoUploadSession.deleteMany({ where: { id } });
  await db.user.deleteMany({ where: { id: userId } }); await db.onModuleDestroy();
 });
 it("retains exact private deletion authority before pruning an expired account's draft", async () => {
  await db.listingDraft.create({ data: { id: draftId, userId, payload: {} } });
  await db.mediaUpload.create({ data: { id: uploadId, userId, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1000, writeProtocol: "video-v1", objectKeys: [sourceKey], state: "PREPARING", claimToken: id, claimTargetType: "video_session", claimTargetId: id, claimDeadline: new Date("1980-01-09T00:00:00Z") } });
  await db.videoUploadSession.create({ data: { id, uploadId, userId, protocolVersion: 1, targetKind: "draft", targetId: draftId, targetRevision: 1, state: "PROCESSING", sourceKey, expiresAt: new Date("1980-01-09T00:00:00Z") } });
  const assets = [{ path: "poster.jpg", key: posterKey, sizeBytes: 100, sha256: "a".repeat(64), purpose: "poster", contentType: "image/jpeg" }];
  await db.videoGeneration.create({ data: { id, sessionId: id, uploadId, listingId: draftId, state: "PROCESSING", manifest: { assets } } });
  await db.videoProcessWork.create({ data: { generationId: id, sessionId: id, uploadId, completionFence: randomUUID(), targetRevision: 1, processingVersion: "ffmpeg-debian-5.1.9-v1", state: "PROCESSING", leaseToken: randomUUID(), leaseExpiresAt: new Date("1980-01-02T00:20:00Z") } });
  await new PurgeExpiredAccounts(db).execute({ now });
  expect(await db.listingDraft.findUnique({ where: { id: draftId } })).toBeNull();
  expect(await db.mediaUpload.findUniqueOrThrow({ where: { id: uploadId } })).toMatchObject({ state: "RETIRED", claimToken: null });
  expect(await db.videoGeneration.findUniqueOrThrow({ where: { id } })).toMatchObject({ state: "RETIRED", retiredAt: now });
  expect(await db.videoProcessWork.findUniqueOrThrow({ where: { generationId: id } })).toMatchObject({ state: "CANCELLED", leaseExpiresAt: new Date("1980-01-02T00:20:00Z") });
  expect(await db.videoCleanupWork.findUniqueOrThrow({ where: { id: `session:${id}` } })).toMatchObject({ uploadId, sessionId: id, generationId: id, sourceKey, objectKeys: [posterKey], nextAttemptAt: new Date("1980-01-02T00:22:00Z") });
 });
});
