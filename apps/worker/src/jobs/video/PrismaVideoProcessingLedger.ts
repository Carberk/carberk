import type { MeasurementSchemas } from "@auto-tm/contracts";
import type { PrismaService, Prisma } from "@auto-tm/db";
import { z } from "zod";

import type { VideoProcessingLedger, VideoProcessingLease, VideoProcessingFacts, VideoPublishedAsset } from "./VideoProcessingPorts";

export interface VideoProcessingMeasurement {
  capture(transaction: object, userId: string, event: MeasurementSchemas.MeasurementEvent): Promise<"captured" | "disabled" | "unavailable">;
  context: MeasurementSchemas.MeasurementEvent["context"];
}
export interface VideoWorkerEligibility { isEligible(userId: string): boolean; }
const version = "ffmpeg-debian-5.1.9-v1";
const leaseMs = 20 * 60_000;
const assetSchema = z.object({ path: z.string().regex(/^(?:master\.m3u8|poster\.jpg|(?:240|360|720)\/(?:index\.m3u8|seg-[0-9]+\.ts))$/), key: z.string().max(512), sizeBytes: z.number().int().positive().max(100 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), purpose: z.enum(["poster", "playback"]), contentType: z.enum(["application/vnd.apple.mpegurl", "video/mp2t", "image/jpeg"]) }).strict();
const manifestSchema = z.object({ assets: z.array(assetSchema).min(2).max(1024) }).strict();
type Context = Awaited<ReturnType<PrismaVideoProcessingLedger["locked"]>>;
type Current = NonNullable<Context>;

/** PostgreSQL owns current authority, leases, finite output intent and adoption.
 * Storage/codec I/O never runs in a database transaction. */
export class PrismaVideoProcessingLedger implements VideoProcessingLedger {
  constructor(private readonly prisma: PrismaService, private readonly eligibility: VideoWorkerEligibility, private readonly measurement?: VideoProcessingMeasurement) {}

  async claim(id: string, now: Date, token: string): Promise<VideoProcessingLease | null> {
    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(token).success) return null;
    return this.transaction(async tx => {
      const context = await this.locked(tx, id);
      if (!context || !this.current(context) || !["PENDING", "PROCESSING"].includes(context.work.state) || context.work.attempts >= 3 || context.work.nextAttemptAt > now || (context.work.leaseExpiresAt && context.work.leaseExpiresAt > now)) return null;
      const { session, work } = context;
      if (!session.completionFence || !session.sizeBytes || !session.sha256 || session.posterMs === null) return null;
      await tx.videoProcessWork.update({ where: { generationId: id }, data: { state: "PROCESSING", attempts: { increment: 1 }, leaseToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMs) } });
      return { generationId: id, uploadId: work.uploadId, sessionId: session.id, completionFence: session.completionFence, targetRevision: work.targetRevision, leaseToken: token, sourceKey: session.sourceKey, sizeBytes: session.sizeBytes, sha256: session.sha256, posterMs: session.posterMs };
    });
  }
  async plan(lease: VideoProcessingLease, assets: VideoPublishedAsset[], now: Date): Promise<boolean> {
    const manifest = this.manifest(lease, assets);
    if (!manifest) return false;
    return this.transaction(async tx => {
      const context = await this.locked(tx, lease.generationId);
      if (!context || !this.owns(context, lease, now) || !this.current(context)) return false;
      if (context.generation.manifest !== null) {
        const existing = manifestSchema.safeParse(context.generation.manifest);
        if (!existing.success || this.inventory(existing.data.assets) !== this.inventory(manifest.assets)) return false;
      }
      const cleanup = await tx.videoCleanupWork.findUnique({ where: { id: `session:${lease.sessionId}` } });
      if (cleanup && (cleanup.state !== "HELD" || cleanup.uploadId !== lease.uploadId || cleanup.generationId !== lease.generationId || cleanup.sessionId !== lease.sessionId || cleanup.sourceKey !== lease.sourceKey || cleanup.storageUploadId !== context.session.storageUploadId)) return false;
      await tx.videoGeneration.update({ where: { id: lease.generationId }, data: { manifest: manifest as Prisma.InputJsonValue } });
      // HELD is durable deletion authority, not a request to delete live bytes.
      // Cancellation/retirement flips the same exact inventory to PENDING.
      await tx.videoCleanupWork.upsert({ where: { id: `session:${lease.sessionId}` },
        create: { id: `session:${lease.sessionId}`, generationId: lease.generationId, uploadId: lease.uploadId, sessionId: lease.sessionId, sourceKey: lease.sourceKey, storageUploadId: context.session.storageUploadId, objectKeys: manifest.assets.map(asset => asset.key), state: "HELD", nextAttemptAt: new Date(now.getTime() + leaseMs + 120_000) },
        update: { objectKeys: manifest.assets.map(asset => asset.key) },
      });
      return true;
    });
  }
  async adopt(lease: VideoProcessingLease, facts: VideoProcessingFacts, now: Date): Promise<boolean> {
    const manifest = this.manifest(lease, facts.assets);
    if (!manifest || facts.sourceSha256 !== lease.sha256 || !Number.isInteger(facts.durationMs) || facts.durationMs < 1 || facts.durationMs > 90_000 || lease.posterMs >= facts.durationMs || !Number.isInteger(facts.width) || !Number.isInteger(facts.height) || facts.width < 1 || facts.height < 1 || facts.width > (facts.width >= facts.height ? 1280 : 720) || facts.height > (facts.width >= facts.height ? 720 : 1280)) return false;
    return this.transaction(async tx => {
      const context = await this.locked(tx, lease.generationId);
      if (!context || !this.owns(context, lease, now)) return false;
      if (!this.current(context)) { await this.retire(tx, context, now); return false; }
      const plan = manifestSchema.safeParse(context.generation.manifest);
      if (!plan.success || this.inventory(plan.data.assets) !== this.inventory(manifest.assets)) return false;
      const poster = manifest.assets.find(asset => asset.purpose === "poster");
      if (!poster) return false;
      const { target, session, upload } = context;
      if (target.kind === "listing") {
        const oldId = target.row.activeVideoGenerationId;
        if (oldId && oldId !== lease.generationId) await this.retireReplaced(tx, context, oldId, now);
        await tx.mediaUpload.update({ where: { id: upload.id }, data: { state: "ADOPTED", claimTargetType: "listing", claimTargetId: target.row.id, claimToken: null, claimDeadline: null } });
        await tx.listing.update({ where: { id: target.row.id }, data: { activeVideoGenerationId: lease.generationId, pendingVideoGenerationId: null } });
      }
      await tx.videoGeneration.update({ where: { id: lease.generationId }, data: { state: "READY", readyAt: now, durationMs: facts.durationMs, posterKey: poster.key, sourceSha256: facts.sourceSha256, sourceWidth: facts.width, sourceHeight: facts.height } });
      await tx.videoUploadSession.update({ where: { id: session.id }, data: { state: "READY" } });
      await tx.videoProcessWork.update({ where: { generationId: lease.generationId }, data: { state: "COMPLETED", completedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: null } });
      return true;
    });
  }
  async fail(lease: VideoProcessingLease, reason: string, now: Date): Promise<void> {
    await this.transaction(async tx => {
      const context = await this.locked(tx, lease.generationId);
      if (!context || !this.owns(context, lease, now, false)) return;
      const lastError = /^VIDEO_[A-Z_]{1,70}$/.test(reason) ? reason : "VIDEO_PROCESSING_FAILED";
      if (!this.current(context) || context.work.attempts >= 3) { await this.retire(tx, context, now, lastError); return; }
      await tx.videoProcessWork.update({ where: { generationId: lease.generationId }, data: { state: "PENDING", leaseToken: null, leaseExpiresAt: null, lastError, nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** (context.work.attempts - 1)) } });
    });
  }
  private transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async tx => { await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`; return run(tx); }, { timeout: 5000, maxWait: 1500 });
  }
  private async locked(tx: Prisma.TransactionClient, id: string) {
    const candidate = await tx.videoProcessWork.findUnique({ where: { generationId: id } });
    if (!candidate) return null;
    const initialSession = await tx.videoUploadSession.findUnique({ where: { id: candidate.sessionId } });
    if (!initialSession?.targetId) return null;
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${initialSession.userId} FOR UPDATE`;
    const initialUpload = await tx.mediaUpload.findUnique({ where: { id: candidate.uploadId } });
    if (!initialUpload) return null;
    if (initialUpload.businessId) {
      await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id" = ${initialUpload.businessId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "dealership_members" WHERE "userId" = ${initialSession.userId} FOR UPDATE`;
    }
    const user = await tx.user.findUnique({ where: { id: initialSession.userId } });
    const business = initialUpload.businessId ? await tx.dealership.findUnique({ where: { id: initialUpload.businessId } }) : null;
    const member = initialUpload.businessId ? await tx.dealershipMember.findUnique({ where: { userId: initialSession.userId } }) : null;
    let target;
    if (initialSession.targetKind === "listing") {
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${initialSession.targetId} FOR UPDATE`;
      const row = await tx.listing.findUnique({ where: { id: initialSession.targetId } }); if (!row) return null;
      target = { kind: "listing" as const, row };
    } else if (initialSession.targetKind === "draft") {
      await tx.$queryRaw`SELECT "id" FROM "listing_drafts" WHERE "id" = ${initialSession.targetId} FOR UPDATE`;
      const row = await tx.listingDraft.findUnique({ where: { id: initialSession.targetId } }); if (!row) return null;
      target = { kind: "draft" as const, row };
    } else return null;
    await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${candidate.uploadId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_upload_sessions" WHERE "id" = ${candidate.sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "generationId" FROM "video_process_work" WHERE "generationId" = ${id} FOR UPDATE`;
    const [upload, session, generation, work] = await Promise.all([
      tx.mediaUpload.findUnique({ where: { id: candidate.uploadId } }), tx.videoUploadSession.findUnique({ where: { id: candidate.sessionId } }),
      tx.videoGeneration.findUnique({ where: { id } }), tx.videoProcessWork.findUnique({ where: { generationId: id } }),
    ]);
    if (!upload || !session || !generation || !work) return null;
    const newerDraft = target.kind === "draft" ? await tx.videoUploadSession.count({ where: { targetKind: "draft", targetId: target.row.id, targetRevision: { gt: work.targetRevision } } }) : 0;
    return { user, business, member, target, upload, session, generation, work, newerDraft };
  }
  private current(context: Current): boolean {
    const { user, business, member, target, upload, session, generation, work } = context;
    if (!user || user.suspendedAt || user.deletionScheduledAt || !this.eligibility.isEligible(user.id) || upload.userId !== user.id || upload.writeProtocol !== "video-v1" || upload.kind !== "video" || upload.state !== "PREPARING" || upload.claimToken !== session.id || upload.claimTargetType !== "video_session" || upload.claimTargetId !== session.id || session.protocolVersion !== 1 || session.state !== "PROCESSING" || session.cancelledAt || !session.completedAt || !session.sha256 || !/^[a-f0-9]{64}$/.test(session.sha256) || !session.sizeBytes || session.sizeBytes > 15 * 1024 * 1024 || session.sizeBytes !== upload.sizeBytes || session.posterMs === null || session.posterMs < 0 || session.posterMs >= 90_000 || !session.completionFence || session.sourceKey !== upload.key || session.sourceKey !== `video/v1/${upload.id}/${session.id}/source.mp4` || session.targetId !== target.row.id || session.targetRevision !== work.targetRevision || session.completionFence !== work.completionFence || work.processingVersion !== version || generation.processingVersion !== version || generation.id !== session.id || generation.sessionId !== session.id || generation.uploadId !== upload.id || generation.listingId !== target.row.id || generation.completionFence !== work.completionFence || generation.targetRevision !== work.targetRevision || generation.state !== "PROCESSING" || generation.retiredAt || work.sessionId !== session.id || work.uploadId !== upload.id) return false;
    if (upload.businessId) {
      if (target.row.businessId !== upload.businessId || business?.status !== "active" || !member || member.status !== "active" || member.dealershipId !== upload.businessId || !["owner", "sales"].includes(member.role)) return false;
    } else if (target.row.businessId || (target.kind === "listing" ? target.row.sellerId : target.row.userId) !== user.id) return false;
    return target.kind === "listing" ? !target.row.deletedAt && target.row.status !== "banned" && target.row.pendingVideoGenerationId === generation.id && target.row.activeVideoRevision === work.targetRevision : context.newerDraft === 0;
  }
  private owns(context: Current, lease: VideoProcessingLease, now: Date, requireLive = true) {
    const { work, session } = context;
    return work.state === "PROCESSING" && work.leaseToken === lease.leaseToken && !!work.leaseExpiresAt && (!requireLive || work.leaseExpiresAt > now) && work.uploadId === lease.uploadId && work.sessionId === lease.sessionId && work.completionFence === lease.completionFence && work.targetRevision === lease.targetRevision && session.sourceKey === lease.sourceKey && session.sha256 === lease.sha256 && session.sizeBytes === lease.sizeBytes && session.posterMs === lease.posterMs;
  }
  private manifest(lease: Pick<VideoProcessingLease, "uploadId" | "generationId">, assets: VideoPublishedAsset[]) {
    const parsed = manifestSchema.safeParse({ assets });
    if (!parsed.success || new Set(parsed.data.assets.map(asset => asset.path)).size !== assets.length || !parsed.data.assets.some(asset => asset.path === "master.m3u8" && asset.purpose === "playback") || parsed.data.assets.filter(asset => asset.purpose === "poster").length !== 1 || !parsed.data.assets.some(asset => asset.path === "poster.jpg" && asset.purpose === "poster") || parsed.data.assets.reduce((sum, asset) => sum + asset.sizeBytes, 0) > 100 * 1024 * 1024 || parsed.data.assets.some(asset => asset.key !== `video/v1/${lease.uploadId}/${lease.generationId}/${asset.path}` || asset.contentType !== (asset.path.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : asset.path.endsWith(".ts") ? "video/mp2t" : "image/jpeg"))) return null;
    return parsed.data;
  }
  private inventory(assets: VideoPublishedAsset[]) { return JSON.stringify([...assets].sort((a, b) => a.key.localeCompare(b.key))); }
  private async retire(tx: Prisma.TransactionClient, context: Current, now: Date, reason = "VIDEO_SUPERSEDED") {
    if (context.target.kind === "listing" && context.target.row.activeVideoGenerationId === context.generation.id) return;
    const parsed = manifestSchema.safeParse(context.generation.manifest);
    const assets = parsed.success ? this.manifest({ uploadId: context.upload.id, generationId: context.generation.id }, parsed.data.assets) : null;
    if (context.generation.manifest !== null && !assets) throw new Error("VIDEO_MANIFEST_INVALID");
    if (context.session.sourceKey !== `video/v1/${context.upload.id}/${context.session.id}/source.mp4`) throw new Error("VIDEO_MANIFEST_INVALID");
    await tx.mediaUpload.update({ where: { id: context.upload.id }, data: { state: "RETIRED", retiredAt: now, claimToken: null, claimDeadline: null } });
    await tx.videoGeneration.update({ where: { id: context.generation.id }, data: { state: "RETIRED", retiredAt: now } });
    await tx.videoUploadSession.update({ where: { id: context.session.id }, data: { state: context.session.cancelledAt ? "CLEANUP_PENDING" : "FAILED" } });
    await tx.videoProcessWork.update({ where: { generationId: context.generation.id }, data: { state: "FAILED", lastError: reason } });
    await tx.videoCleanupWork.upsert({ where: { id: `session:${context.session.id}` }, create: { id: `session:${context.session.id}`, sessionId: context.session.id, generationId: context.generation.id, uploadId: context.upload.id, sourceKey: context.session.sourceKey, storageUploadId: context.session.storageUploadId, objectKeys: assets ? assets.assets.map(asset => asset.key) : [], nextAttemptAt: new Date(Math.max(now.getTime(), context.work.leaseExpiresAt?.getTime() ?? 0) + 120_000) }, update: { state: "PENDING", nextAttemptAt: new Date(Math.max(now.getTime(), context.work.leaseExpiresAt?.getTime() ?? 0) + 120_000) } });
    await tx.listing.updateMany({ where: { pendingVideoGenerationId: context.generation.id }, data: { pendingVideoGenerationId: null } });
  }
  private async retireReplaced(tx: Prisma.TransactionClient, context: Current, id: string, now: Date) {
    const generation = await tx.videoGeneration.findUnique({ where: { id } });
    if (!generation?.sessionId) throw new Error("VIDEO_REPLACEMENT_UNAVAILABLE");
    await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${generation.uploadId} FOR UPDATE`;
    const session = await tx.videoUploadSession.findUnique({ where: { id: generation.sessionId } });
    const upload = await tx.mediaUpload.findUnique({ where: { id: generation.uploadId } });
    const parsed = manifestSchema.safeParse(generation.manifest);
    const manifest = parsed.success ? this.manifest({ uploadId: generation.uploadId, generationId: generation.id }, parsed.data.assets) : null;
    if (!session || !upload || !manifest || generation.state !== "READY" || generation.retiredAt || generation.listingId !== context.target.row.id || session.uploadId !== generation.uploadId || session.targetKind !== "listing" || session.targetId !== context.target.row.id || session.state !== "READY" || session.cancelledAt || session.sourceKey !== `video/v1/${upload.id}/${session.id}/source.mp4` || upload.key !== session.sourceKey || upload.writeProtocol !== "video-v1" || upload.kind !== "video" || upload.state !== "ADOPTED" || upload.claimTargetType !== "listing" || upload.claimTargetId !== context.target.row.id || upload.businessId !== context.upload.businessId || upload.userId !== session.userId) throw new Error("VIDEO_REPLACEMENT_UNAVAILABLE");
    await tx.mediaUpload.update({ where: { id: generation.uploadId }, data: { state: "RETIRED", retiredAt: now, claimToken: null, claimDeadline: null } });
    await tx.videoGeneration.update({ where: { id }, data: { state: "RETIRED", retiredAt: now } });
    await tx.videoGrant.updateMany({ where: { generationId: id, revokedAt: null }, data: { revokedAt: now } });
    await tx.videoCleanupWork.upsert({ where: { id: `session:${session.id}` }, create: { id: `session:${session.id}`, uploadId: session.uploadId, sessionId: session.id, generationId: id, sourceKey: session.sourceKey, storageUploadId: session.storageUploadId, objectKeys: manifest.assets.map(asset => asset.key), nextAttemptAt: new Date(now.getTime() + 120_000) }, update: { state: "PENDING", nextAttemptAt: new Date(now.getTime() + 120_000) } });
  }
}
