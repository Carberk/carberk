import { randomUUID } from "node:crypto";

import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaVideoProcessingLedger } from "./PrismaVideoProcessingLedger";
import type { VideoProcessingFacts, VideoPublishedAsset } from "./VideoProcessingPorts";

const databaseUrl = process.env["DATABASE_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\//.test(databaseUrl);
const now = new Date("2000-01-02T00:00:00Z");
describe.skipIf(!hosted)("video processing durable fences on disposable PostgreSQL", () => {
  let db: PrismaService, ledger: PrismaVideoProcessingLedger;
  const userId = randomUUID(), listingId = randomUUID();
  const catalog = { brandId: randomUUID(), modelId: randomUUID(), regionId: randomUUID(), cityId: randomUUID() };
  const sessions: string[] = [], uploads: string[] = [];
  let eligible = true;
  beforeAll(async () => {
    db = new PrismaService(); ledger = new PrismaVideoProcessingLedger(db, { isEligible: () => eligible });
    const slug = `video-ledger-${randomUUID()}`, names = { nameRu: "Synthetic", nameTk: "Synthetic", nameEn: "Synthetic" };
    await db.brand.create({ data: { id: catalog.brandId, slug: `${slug}-brand`, ...names } });
    await db.model.create({ data: { id: catalog.modelId, brandId: catalog.brandId, slug: `${slug}-model`, ...names } });
    await db.region.create({ data: { id: catalog.regionId, slug: `${slug}-region`, ...names } });
    await db.city.create({ data: { id: catalog.cityId, regionId: catalog.regionId, slug: `${slug}-city`, ...names } });
    await db.user.create({ data: { id: userId } });
    await db.listing.create({ data: { id: listingId, sellerId: userId, status: "active", brandId: catalog.brandId, modelId: catalog.modelId, cityId: catalog.cityId, priceAmount: 100000, priceCurrency: "TMT" } });
  });
  beforeEach(async () => {
    eligible = true;
    await db.listing.update({ where: { id: listingId }, data: { activeVideoGenerationId: null, pendingVideoGenerationId: null, activeVideoRevision: 0 } });
    await db.videoProcessWork.deleteMany({ where: { generationId: { in: sessions } } });
    await db.videoCleanupWork.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.videoGeneration.deleteMany({ where: { id: { in: sessions } } });
    await db.videoUploadSession.deleteMany({ where: { id: { in: sessions } } });
    await db.mediaUpload.deleteMany({ where: { id: { in: uploads } } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.listing.deleteMany({ where: { id: listingId } });
    await db.videoProcessWork.deleteMany({ where: { generationId: { in: sessions } } });
    await db.videoCleanupWork.deleteMany({ where: { uploadId: { in: uploads } } });
    await db.videoGeneration.deleteMany({ where: { id: { in: sessions } } });
    await db.videoUploadSession.deleteMany({ where: { id: { in: sessions } } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.city.deleteMany({ where: { id: catalog.cityId } }); await db.region.deleteMany({ where: { id: catalog.regionId } });
    await db.model.deleteMany({ where: { id: catalog.modelId } }); await db.brand.deleteMany({ where: { id: catalog.brandId } });
    await db.onModuleDestroy();
  });
  async function prepared() {
    const id = randomUUID(), uploadId = randomUUID(), completionFence = randomUUID(); sessions.push(id); uploads.push(uploadId);
    const sourceKey = `video/v1/${uploadId}/${id}/source.mp4`;
    await db.mediaUpload.create({ data: { id: uploadId, userId, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: 1000, state: "PREPARING", writeProtocol: "video-v1", objectKeys: [sourceKey], claimTargetType: "video_session", claimTargetId: id, claimToken: id, claimDeadline: new Date("2000-01-09T00:00:00Z") } });
    await db.videoUploadSession.create({ data: { id, uploadId, userId, listingId, protocolVersion: 1, targetKind: "listing", targetId: listingId, targetRevision: 1, state: "PROCESSING", completionFence, completedAt: now, sourceKey, sizeBytes: 1000, sha256: "a".repeat(64), posterMs: 0, expiresAt: new Date("2000-01-09T00:00:00Z") } });
    await db.videoGeneration.create({ data: { id, sessionId: id, uploadId, listingId, state: "PROCESSING", targetRevision: 1, completionFence, processingVersion: "ffmpeg-debian-5.1.9-v1" } });
    await db.videoProcessWork.create({ data: { generationId: id, sessionId: id, uploadId, completionFence, targetRevision: 1, processingVersion: "ffmpeg-debian-5.1.9-v1", nextAttemptAt: now } });
    await db.listing.update({ where: { id: listingId }, data: { pendingVideoGenerationId: id, activeVideoRevision: 1 } });
    const assets: VideoPublishedAsset[] = [
      { path: "master.m3u8", key: `video/v1/${uploadId}/${id}/master.m3u8`, sizeBytes: 100, sha256: "b".repeat(64), purpose: "playback", contentType: "application/vnd.apple.mpegurl" },
      { path: "poster.jpg", key: `video/v1/${uploadId}/${id}/poster.jpg`, sizeBytes: 100, sha256: "c".repeat(64), purpose: "poster", contentType: "image/jpeg" },
    ];
    const facts: VideoProcessingFacts = { durationMs: 5055, width: 960, height: 540, sourceSha256: "a".repeat(64), assets };
    return { id, uploadId, assets, facts };
  }
  it("allows only one concurrent processing lease and leaves playback private before adoption", async () => {
    const row = await prepared();
    const attempts = await Promise.all([ledger.claim(row.id, now, randomUUID()), ledger.claim(row.id, now, randomUUID())]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).activeVideoGenerationId).toBeNull();
  });
  it("requires the exact durable output plan then atomically adopts a listing claim", async () => {
    const row = await prepared(), lease = await ledger.claim(row.id, now, randomUUID()); expect(lease).not.toBeNull();
    if (!lease) return;
    expect(await ledger.adopt(lease, row.facts, now)).toBe(false);
    expect(await ledger.plan(lease, row.assets, now)).toBe(true);
    expect(await ledger.adopt(lease, { ...row.facts, sourceSha256: "d".repeat(64) }, now)).toBe(false);
    expect(await ledger.adopt(lease, row.facts, now)).toBe(true);
    expect(await db.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ activeVideoGenerationId: row.id, pendingVideoGenerationId: null });
    expect(await db.mediaUpload.findUniqueOrThrow({ where: { id: row.uploadId } })).toMatchObject({ state: "ADOPTED", claimTargetType: "listing", claimTargetId: listingId, claimToken: null, claimDeadline: null });
    expect(await db.videoGeneration.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ state: "READY", durationMs: 5055, sourceWidth: 960, sourceHeight: 540 });
    expect(await ledger.claim(row.id, now, randomUUID())).toBeNull();
  });
  it("cannot revive cancellation after the output plan and preserves exact cleanup authority", async () => {
    const row = await prepared(), lease = await ledger.claim(row.id, now, randomUUID()); expect(lease).not.toBeNull(); if (!lease) return;
    expect(await ledger.plan(lease, row.assets, now)).toBe(true);
    await db.videoUploadSession.update({ where: { id: row.id }, data: { cancelledAt: now, state: "CLEANUP_PENDING" } });
    expect(await ledger.adopt(lease, row.facts, now)).toBe(false);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).activeVideoGenerationId).toBeNull();
    const cleanup = await db.videoCleanupWork.findUniqueOrThrow({ where: { id: `session:${row.id}` } });
    expect(cleanup.objectKeys.sort()).toEqual(row.assets.map(asset => asset.key).sort());
  });
  it("rechecks tester and current account authority before planning and readiness", async () => {
    const row = await prepared(), lease = await ledger.claim(row.id, now, randomUUID()); expect(lease).not.toBeNull(); if (!lease) return;
    eligible = false; expect(await ledger.plan(lease, row.assets, now)).toBe(false);
    eligible = true; await db.user.update({ where: { id: userId }, data: { suspendedAt: now } });
    expect(await ledger.adopt(lease, row.facts, now)).toBe(false);
    await db.user.update({ where: { id: userId }, data: { suspendedAt: null } });
  });
});
