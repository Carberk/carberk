import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { z } from "zod";

import { BUSINESS_AUTHORITY_PORT, IDENTITY_CLOCK_PORT, type BusinessAuthorityPort, type ClockPort } from "../../identity/identity.public";
import { ListingOwnership, type ListingActor } from "../application/ListingOwnership";
import type { OwnedVideoSession, OwnedVideoSessionLedger, VideoSessionCreate } from "../application/OwnedVideoUploadProtocol";
import { VideoEligibility } from "../application/VideoEligibility";
import { PrismaUploadClaims } from "./PrismaUploadClaims";

export const VIDEO_ID_FACTORY = Symbol("VideoIdFactory");
const unavailable = () => new Error("VIDEO_SESSION_UNAVAILABLE");
const lifetime = 7 * 24 * 60 * 60 * 1000;
type Session = Prisma.VideoUploadSessionGetPayload<Record<string, never>>;
const snapshot = (row: Session): OwnedVideoSession => {
  if (!row.sizeBytes) throw unavailable();
  return { id: row.id, generationId: row.id, uploadId: row.uploadId, state: row.state, expiresAt: row.expiresAt, storageUploadId: row.storageUploadId, sizeBytes: row.sizeBytes, completionFence: row.completionFence };
};

/** Transaction-only authority and state. Storage never runs inside these locks. */
@Injectable()
export class PrismaOwnedVideoSessionLedger implements OwnedVideoSessionLedger {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly authority: BusinessAuthorityPort,
    @Inject(ListingOwnership) private readonly ownership: ListingOwnership,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(VideoEligibility) private readonly eligibility: VideoEligibility,
    @Inject(PrismaUploadClaims) private readonly claims: PrismaUploadClaims,
    @Inject(VIDEO_ID_FACTORY) private readonly id: () => string,
  ) {}
  async reserve(actor: ListingActor, input: VideoSessionCreate) {
    return this.transaction(async tx => {
      await this.actor(tx, actor, true);
      const target = await this.target(tx, actor, input.target.kind, input.target.id);
      const inputHash = createHash("sha256").update(JSON.stringify({ actor: actor.userId, businessId: actor.businessId ?? null, target: input.target, sizeBytes: input.prepared.sizeBytes, sha256: input.prepared.sha256, posterMs: input.posterMs, protocolVersion: input.protocolVersion })).digest("hex");
      const existing = await tx.videoUploadSession.findUnique({ where: { userId_idempotencyKey: { userId: actor.userId, idempotencyKey: input.idempotencyKey } } });
      if (existing) {
        if (existing.idempotencyHash !== inputHash || existing.protocolVersion !== 1) throw new Error("VIDEO_IDEMPOTENCY_CONFLICT");
        return { session: snapshot(existing), initialize: false };
      }
      const now = this.clock.now(), sessionId = this.id(), uploadId = this.id();
      const sourceKey = `video/v1/${uploadId}/${sessionId}/source.mp4`;
      let revision: number;
      if (target.kind === "listing") {
        if (target.row.pendingVideoGenerationId) await this.retire(tx, target.row.pendingVideoGenerationId, now);
        revision = target.row.activeVideoRevision + 1;
      } else {
        const previous = await tx.videoUploadSession.findFirst({ where: { targetKind: "draft", targetId: target.row.id, protocolVersion: 1, targetRevision: { not: null } }, orderBy: { targetRevision: "desc" } });
        if (previous) await this.retire(tx, previous.id, now);
        revision = (previous?.targetRevision ?? 0) + 1;
      }
      const expiresAt = new Date(now.getTime() + lifetime);
      await tx.mediaUpload.create({ data: { id: uploadId, userId: actor.userId, businessId: actor.businessId ?? null, key: sourceKey, kind: "video", contentType: "video/mp4", sizeBytes: input.prepared.sizeBytes, writeProtocol: "video-v1", objectKeys: [sourceKey], state: "PREPARING", claimToken: sessionId, claimTargetType: "video_session", claimTargetId: sessionId, claimDeadline: expiresAt } });
      const session = await tx.videoUploadSession.create({ data: { id: sessionId, uploadId, userId: actor.userId, listingId: target.kind === "listing" ? target.row.id : null, sourceKey, sizeBytes: input.prepared.sizeBytes, sha256: input.prepared.sha256, posterMs: input.posterMs, state: "INITIALIZING", expiresAt, protocolVersion: 1, targetKind: target.kind, targetId: target.row.id, targetRevision: revision, idempotencyKey: input.idempotencyKey, idempotencyHash: inputHash } });
      await tx.videoGeneration.create({ data: { id: sessionId, sessionId, listingId: target.row.id, uploadId, state: "UPLOADING", targetRevision: revision, processingVersion: "ffmpeg-debian-5.1.9-v1" } });
      if (target.kind === "listing") await tx.listing.update({ where: { id: target.row.id }, data: { pendingVideoGenerationId: sessionId, activeVideoRevision: revision } });
      return { session: snapshot(session), initialize: true };
    });
  }
  async read(actor: ListingActor, id: string) { return this.transaction(async tx => snapshot(await this.current(tx, actor, id))); }
  async bindInitialization(actor: ListingActor, id: string, storageUploadId: string) {
    if (!storageUploadId || storageUploadId.length > 2048) throw unavailable();
    return this.transaction(async tx => {
      const row = await this.current(tx, actor, id, true);
      if (row.storageUploadId && row.storageUploadId !== storageUploadId) throw unavailable();
      if (!["INITIALIZING", "UPLOADING"].includes(row.state)) throw unavailable();
      return snapshot(await tx.videoUploadSession.update({ where: { id }, data: { storageUploadId, state: "UPLOADING" } }));
    });
  }
  async beginCompletion(actor: ListingActor, id: string) {
    return this.transaction(async tx => {
      const row = await this.current(tx, actor, id, true);
      if (row.state === "PROCESSING") return snapshot(row);
      if (!["UPLOADING", "COMPLETING"].includes(row.state) || !row.storageUploadId) throw unavailable();
      const fence = row.completionFence ?? this.id();
      await tx.videoGeneration.update({ where: { id }, data: { completionFence: fence } });
      return snapshot(await tx.videoUploadSession.update({ where: { id }, data: { state: "COMPLETING", completionFence: fence } }));
    });
  }
  async commitCompletion(actor: ListingActor, id: string, fence: string) {
    return this.transaction(async tx => {
      const row = await this.current(tx, actor, id, true);
      if (row.completionFence !== fence || !row.targetRevision || !["COMPLETING", "PROCESSING"].includes(row.state)) throw unavailable();
      if (row.state === "PROCESSING") return snapshot(row);
      const now = this.clock.now();
      await tx.videoGeneration.update({ where: { id }, data: { state: "PROCESSING", completionFence: fence } });
      await tx.videoProcessWork.create({ data: { generationId: id, uploadId: row.uploadId, sessionId: id, completionFence: fence, targetRevision: row.targetRevision, processingVersion: "ffmpeg-debian-5.1.9-v1" } });
      return snapshot(await tx.videoUploadSession.update({ where: { id }, data: { state: "PROCESSING", completedAt: now } }));
    });
  }
  async change(actor: ListingActor, id: string, action: "pause" | "resume" | "cancel") {
    return this.transaction(async tx => {
      const row = await this.current(tx, actor, id, action === "resume", action === "cancel");
      if (action === "cancel") {
        if (row.state === "CLEANUP_PENDING") return snapshot(row);
        const generation = await tx.videoGeneration.findUnique({ where: { id } });
        if (!generation || await tx.listing.count({ where: { activeVideoGenerationId: id } })) throw unavailable();
        await this.retire(tx, id, this.clock.now());
        return snapshot(await tx.videoUploadSession.findUniqueOrThrow({ where: { id } }));
      }
      const expected = action === "pause" ? "UPLOADING" : "PAUSED", state = action === "pause" ? "PAUSED" : "UPLOADING";
      if (row.state === state) return snapshot(row);
      if (row.state !== expected) throw unavailable();
      return snapshot(await tx.videoUploadSession.update({ where: { id }, data: { state } }));
    });
  }
  private transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async tx => { await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`; return run(tx); }, { timeout: 5000, maxWait: 1500 });
  }
  private async actor(tx: Prisma.TransactionClient, actor: ListingActor, uploading = false) {
    if (!actor.sessionId) throw unavailable();
    if (uploading) this.eligibility.assertUploadEligible(actor.userId); else this.eligibility.assertEligible(actor.userId);
    try {
      if (actor.businessId) await this.authority.authorize({ userId: actor.userId, sessionId: actor.sessionId, businessId: actor.businessId }, tx);
      else await this.authority.resolve({ userId: actor.userId, sessionId: actor.sessionId }, tx);
    } catch { throw unavailable(); }
  }
  private async target(tx: Prisma.TransactionClient, actor: ListingActor, kind: string, id: string) {
    if (kind === "listing") {
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.listing.findUnique({ where: { id } });
      if (!row || row.deletedAt || row.status === "banned") throw unavailable();
      try { await this.ownership.authorize(actor, { sellerId: row.sellerId, ...(row.businessId ? { businessId: row.businessId } : {}) }, tx); } catch { throw unavailable(); }
      return { kind: "listing" as const, row };
    }
    if (kind !== "draft") throw unavailable();
    await tx.$queryRaw`SELECT "id" FROM "listing_drafts" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.listingDraft.findUnique({ where: { id } });
    if (!row) throw unavailable();
    try { await this.ownership.authorize(actor, { userId: row.userId, ...(row.businessId ? { businessId: row.businessId } : {}) }, tx); } catch { throw unavailable(); }
    return { kind: "draft" as const, row };
  }
  private async current(tx: Prisma.TransactionClient, actor: ListingActor, id: string, uploading = false, cancelling = false) {
    await this.actor(tx, actor, uploading);
    const candidate = await tx.videoUploadSession.findUnique({ where: { id } });
    if (!candidate || candidate.userId !== actor.userId || candidate.protocolVersion !== 1 || !candidate.targetKind || !candidate.targetId) throw unavailable();
    const target = await this.target(tx, actor, candidate.targetKind, candidate.targetId);
    await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${candidate.uploadId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_upload_sessions" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.videoUploadSession.findUniqueOrThrow({ where: { id } });
    const upload = await tx.mediaUpload.findUnique({ where: { id: row.uploadId } });
    if (cancelling && row.state === "CLEANUP_PENDING") return row;
    if (!upload || upload.writeProtocol !== "video-v1" || upload.userId !== actor.userId || upload.businessId !== (actor.businessId ?? null) || upload.state !== "PREPARING" || upload.claimToken !== id || row.cancelledAt || ["FAILED", "CLEANUP_PENDING", "DELETED", "CANCELLED"].includes(row.state) || (row.state !== "PROCESSING" && row.expiresAt <= this.clock.now())) throw unavailable();
    if (target.kind === "listing" && (target.row.pendingVideoGenerationId !== id || target.row.activeVideoRevision !== row.targetRevision)) throw unavailable();
    if (target.kind === "draft") {
      const newer = await tx.videoUploadSession.count({ where: { targetKind: "draft", targetId: target.row.id, targetRevision: { gt: row.targetRevision ?? 0 } } });
      if (newer) throw unavailable();
    }
    return row;
  }
  private async retire(tx: Prisma.TransactionClient, sessionId: string, now: Date) {
    const row = await tx.videoUploadSession.findUnique({ where: { id: sessionId } });
    if (!row || row.protocolVersion !== 1) throw unavailable();
    await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${row.uploadId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_upload_sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "generationId" FROM "video_process_work" WHERE "generationId" = ${sessionId} FOR UPDATE`;
    const generation = await tx.videoGeneration.findUnique({ where: { id: sessionId } });
    const processing = await tx.videoProcessWork.findUnique({ where: { generationId: sessionId } });
    const cleanup = await tx.videoCleanupWork.findUnique({ where: { id: `session:${sessionId}` } });
    if (cleanup && (cleanup.uploadId !== row.uploadId || cleanup.sessionId !== sessionId || cleanup.generationId !== sessionId || cleanup.sourceKey !== row.sourceKey || cleanup.writeProtocol !== "video-v1")) throw unavailable();
    if (await tx.listing.count({ where: { activeVideoGenerationId: sessionId } })) throw unavailable();
    const prefix = `video/v1/${row.uploadId}/${sessionId}/`;
    const manifest = z.object({ assets: z.array(z.object({ key: z.string() }).passthrough()).max(1024) }).strict().safeParse(generation?.manifest);
    if (generation?.manifest !== null && generation?.manifest !== undefined && !manifest.success) throw unavailable();
    const objectKeys = [...new Set([...(manifest.success ? manifest.data.assets.map(asset => asset.key) : []), ...(cleanup?.objectKeys ?? [])])].sort();
    if (row.sourceKey !== `${prefix}source.mp4` || objectKeys.length > 1024 || objectKeys.some(key => !key.startsWith(prefix) || !/^(?:master\.m3u8|poster\.jpg|(?:240|360|720)\/(?:index\.m3u8|seg-[0-9]+\.ts))$/.test(key.slice(prefix.length)))) throw unavailable();
    const nextAttemptAt = new Date(Math.max(now.getTime() + 15 * 60_000, processing?.leaseExpiresAt?.getTime() ?? 0) + 120_000);
    await this.claims.retire(tx, row.uploadId);
    await tx.videoUploadSession.update({ where: { id: sessionId }, data: { state: "CLEANUP_PENDING", cancelledAt: now } });
    await tx.videoGeneration.updateMany({ where: { id: sessionId }, data: { state: "RETIRED", retiredAt: now } });
    await tx.videoProcessWork.updateMany({ where: { generationId: sessionId }, data: { state: "CANCELLED" } });
    await tx.videoCleanupWork.upsert({ where: { id: `session:${sessionId}` }, create: { id: `session:${sessionId}`, uploadId: row.uploadId, sessionId, generationId: sessionId, sourceKey: row.sourceKey, storageUploadId: row.storageUploadId, objectKeys, nextAttemptAt }, update: { state: "PENDING", objectKeys, nextAttemptAt } });
    await tx.listing.updateMany({ where: { pendingVideoGenerationId: sessionId }, data: { pendingVideoGenerationId: null, activeVideoRevision: { increment: 1 } } });
  }
}
