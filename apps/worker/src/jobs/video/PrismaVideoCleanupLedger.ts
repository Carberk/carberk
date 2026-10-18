import type { PrismaService, Prisma } from "@auto-tm/db";
import { z } from "zod";

import type { VideoCleanupLease, VideoCleanupLedger } from "./VideoCleanupPorts";
const leaseMs = 20 * 60_000;
const activeStates = ["PENDING", "VERIFYING", "CLEANING", "VERIFYING_LEASED"];
type Work = Prisma.VideoCleanupWorkGetPayload<Record<string, never>>;
/** Retired claims cannot be adopted again. Exact deletion authority survives
 * source-row erasure; live references and still-running writers always block. */
export class PrismaVideoCleanupLedger implements VideoCleanupLedger {
  constructor(private readonly prisma: PrismaService) {}
  async claim(now: Date, token: string): Promise<VideoCleanupLease | null> {
    if (!Number.isFinite(now.getTime()) || !z.string().uuid().safeParse(token).success) return null;
    await this.retireExpired(now);
    const candidates = await this.prisma.videoCleanupWork.findMany({ where: { state: { in: activeStates }, nextAttemptAt: { lte: now }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: 20 });
    for (const candidate of candidates) {
      const leased = await this.transaction(async tx => {
        const work = await this.lock(tx, candidate);
        if (!work || !work.sessionId || !work.generationId || !work.sourceKey || !activeStates.includes(work.state) || work.nextAttemptAt > now || (work.leaseExpiresAt && work.leaseExpiresAt > now) || !await this.safe(tx, work, now)) return null;
        const verifying = ["VERIFYING", "VERIFYING_LEASED"].includes(work.state);
        await tx.videoCleanupWork.update({ where: { id: work.id }, data: { state: verifying ? "VERIFYING_LEASED" : "CLEANING", attempts: { increment: 1 }, leaseToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMs) } });
        return { id: work.id, uploadId: work.uploadId, sessionId: work.sessionId, generationId: work.generationId, sourceKey: work.sourceKey, objectKeys: work.objectKeys, token, verifying };
      });
      if (leased) return leased;
    }
    return null;
  }
  /** Expiry invalidates private writers first. Actual object deletion still waits
   * for credential/processor grace and two complete absence observations. */
  private async retireExpired(now: Date) {
    const states = ["INITIALIZING", "UPLOADING", "PAUSED", "COMPLETING", "PROCESSING", "READY"];
    const candidates = await this.prisma.videoUploadSession.findMany({ where: { protocolVersion: 1, expiresAt: { lte: now }, OR: [{ state: { in: states.filter(state => state !== "READY") } }, { state: "READY", targetKind: "draft" }] }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 10 });
    for (const candidate of candidates) await this.transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${candidate.userId} FOR UPDATE`;
      if (candidate.targetKind === "listing" && candidate.targetId) await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${candidate.targetId} FOR UPDATE`;
      else if (candidate.targetKind === "draft" && candidate.targetId) await tx.$queryRaw`SELECT "id" FROM "listing_drafts" WHERE "id" = ${candidate.targetId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${candidate.uploadId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "video_upload_sessions" WHERE "id" = ${candidate.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${candidate.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "generationId" FROM "video_process_work" WHERE "generationId" = ${candidate.id} FOR UPDATE`;
      const [session, upload, generation, work] = await Promise.all([tx.videoUploadSession.findUnique({ where: { id: candidate.id } }), tx.mediaUpload.findUnique({ where: { id: candidate.uploadId } }), tx.videoGeneration.findUnique({ where: { id: candidate.id } }), tx.videoProcessWork.findUnique({ where: { generationId: candidate.id } })]);
      if (!session || !upload || !generation || !states.includes(session.state) || session.targetKind !== candidate.targetKind || session.targetId !== candidate.targetId || session.expiresAt > now || session.protocolVersion !== 1 || upload.writeProtocol !== "video-v1" || upload.kind !== "video" || upload.state !== "PREPARING" || upload.claimToken !== session.id || upload.claimTargetType !== "video_session" || upload.claimTargetId !== session.id || session.uploadId !== upload.id || generation.uploadId !== upload.id || generation.sessionId !== session.id || session.sourceKey !== `video/v1/${upload.id}/${session.id}/source.mp4` || upload.key !== session.sourceKey || await tx.listing.count({ where: { activeVideoGenerationId: generation.id } })) return;
      const existing = await tx.videoCleanupWork.findUnique({ where: { id: `session:${session.id}` } });
      if (existing && (existing.uploadId !== upload.id || existing.sessionId !== session.id || existing.generationId !== generation.id || existing.sourceKey !== session.sourceKey)) throw new Error("VIDEO_CLEANUP_REFERENCE_CHANGED");
      const inventory = z.object({ assets: z.array(z.object({ key: z.string() }).passthrough()).max(1024) }).strict().safeParse(generation.manifest);
      if (generation.manifest !== null && !inventory.success) throw new Error("VIDEO_MANIFEST_INVALID");
      const objectKeys = [...new Set([...(existing?.objectKeys ?? []), ...(inventory.success ? inventory.data.assets.map(asset => asset.key) : [])])];
      const prefix = `video/v1/${upload.id}/${generation.id}/`;
      if (objectKeys.length > 1024 || objectKeys.some(key => !key.startsWith(prefix) || !/^(?:master\.m3u8|poster\.jpg|(?:240|360|720)\/(?:index\.m3u8|seg-[0-9]+\.ts))$/.test(key.slice(prefix.length)))) throw new Error("VIDEO_MANIFEST_INVALID");
      const nextAttemptAt = new Date(Math.max(now.getTime() + 15 * 60_000, work?.leaseExpiresAt?.getTime() ?? 0) + 120_000);
      await tx.mediaUpload.update({ where: { id: upload.id }, data: { state: "RETIRED", retiredAt: now, claimToken: null, claimDeadline: null } });
      await tx.videoGeneration.update({ where: { id: generation.id }, data: { state: "RETIRED", retiredAt: now } });
      await tx.videoUploadSession.update({ where: { id: session.id }, data: { state: "CLEANUP_PENDING", cancelledAt: now } });
      await tx.videoProcessWork.updateMany({ where: { generationId: generation.id }, data: { state: "CANCELLED", lastError: "VIDEO_SESSION_EXPIRED" } });
      await tx.videoGrant.updateMany({ where: { generationId: generation.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.listing.updateMany({ where: { pendingVideoGenerationId: generation.id }, data: { pendingVideoGenerationId: null } });
      await tx.videoCleanupWork.upsert({ where: { id: `session:${session.id}` }, create: { id: `session:${session.id}`, uploadId: upload.id, sessionId: session.id, generationId: generation.id, sourceKey: session.sourceKey, storageUploadId: session.storageUploadId, objectKeys, nextAttemptAt }, update: { state: "PENDING", objectKeys, nextAttemptAt } });
    });
  }
  async recordAbsence(lease: VideoCleanupLease, now: Date): Promise<void> {
    await this.finish(lease, now, async (tx, work) => {
      if (!await this.safe(tx, work, now)) throw new Error("VIDEO_CLEANUP_REFERENCE_CHANGED");
      if (!lease.verifying) {
        await tx.videoCleanupWork.update({ where: { id: work.id }, data: { state: "VERIFYING", nextAttemptAt: new Date(now.getTime() + 60_000), leaseToken: null, leaseExpiresAt: null, lastError: null } });
        return;
      }
      await tx.videoCleanupWork.update({ where: { id: work.id }, data: { state: "DONE", completedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: null } });
      await tx.mediaUpload.updateMany({ where: { id: work.uploadId, state: "RETIRED" }, data: { state: "DELETED" } });
      await tx.videoUploadSession.updateMany({ where: { id: lease.sessionId, uploadId: lease.uploadId }, data: { state: "DELETED" } });
    });
  }
  async fail(lease: VideoCleanupLease, now: Date, reason: string): Promise<void> {
    await this.finish(lease, now, async (tx, work) => {
      await tx.videoCleanupWork.update({ where: { id: work.id }, data: { state: "PENDING", leaseToken: null, leaseExpiresAt: null, lastError: /^VIDEO_[A-Z_]{1,70}$/.test(reason) ? reason : "VIDEO_CLEANUP_UNAVAILABLE", nextAttemptAt: new Date(now.getTime() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(20, work.attempts - 1))) } });
    });
  }
  private async finish(lease: VideoCleanupLease, now: Date, apply: (tx: Prisma.TransactionClient, work: Work) => Promise<void>) {
    await this.transaction(async tx => {
      const work = await this.lock(tx, lease);
      if (!work || work.state !== (lease.verifying ? "VERIFYING_LEASED" : "CLEANING") || work.leaseToken !== lease.token || !work.leaseExpiresAt || work.leaseExpiresAt <= now || work.uploadId !== lease.uploadId || work.sessionId !== lease.sessionId || work.generationId !== lease.generationId || work.sourceKey !== lease.sourceKey || JSON.stringify([...work.objectKeys].sort()) !== JSON.stringify([...lease.objectKeys].sort())) return;
      await apply(tx, work);
    });
  }
  private transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async tx => { await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`; return run(tx); }, { timeout: 5000, maxWait: 1500 });
  }
  private async lock(tx: Prisma.TransactionClient, candidate: { id: string; uploadId: string; generationId: string | null }) {
    await tx.$queryRaw`SELECT "id" FROM "media_uploads" WHERE "id" = ${candidate.uploadId} FOR UPDATE`;
    if (candidate.generationId) await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${candidate.generationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "video_cleanup_work" WHERE "id" = ${candidate.id} FOR UPDATE`;
    return tx.videoCleanupWork.findUnique({ where: { id: candidate.id } });
  }
  private async safe(tx: Prisma.TransactionClient, work: Work, now: Date): Promise<boolean> {
    if (work.writeProtocol !== "video-v1" || !work.sourceKey || !work.sessionId || !work.generationId || ![work.uploadId, work.sessionId, work.generationId].every(id => z.string().uuid().safeParse(id).success) || work.sourceKey !== `video/v1/${work.uploadId}/${work.sessionId}/source.mp4` || work.objectKeys.length > 1024 || new Set(work.objectKeys).size !== work.objectKeys.length) return false;
    const prefix = `video/v1/${work.uploadId}/${work.generationId}/`;
    if (work.objectKeys.some(key => !key.startsWith(prefix) || !/^(?:master\.m3u8|poster\.jpg|(?:240|360|720)\/(?:index\.m3u8|seg-[0-9]+\.ts))$/.test(key.slice(prefix.length)))) return false;
    const [upload, generation, session, processing, listing, media] = await Promise.all([
      tx.mediaUpload.findUnique({ where: { id: work.uploadId } }), tx.videoGeneration.findUnique({ where: { id: work.generationId } }), tx.videoUploadSession.findUnique({ where: { id: work.sessionId } }), tx.videoProcessWork.findUnique({ where: { generationId: work.generationId } }),
      tx.listing.count({ where: { OR: [{ activeVideoGenerationId: work.generationId }, { pendingVideoGenerationId: work.generationId }] } }),
      tx.listingMedia.count({ where: { OR: [{ uploadId: work.uploadId }, { key: { in: [work.sourceKey, ...work.objectKeys] } }, { posterKey: { in: work.objectKeys } }] } }),
    ]);
    return !listing && !media && (!upload || (upload.writeProtocol === "video-v1" && upload.kind === "video" && upload.key === work.sourceKey && ["RETIRED", "DELETED"].includes(upload.state))) && (!generation || (generation.uploadId === work.uploadId && generation.state === "RETIRED" && !!generation.retiredAt)) && (!session || (session.uploadId === work.uploadId && session.protocolVersion === 1 && session.sourceKey === work.sourceKey)) && (!processing?.leaseExpiresAt || processing.leaseExpiresAt.getTime() + 120_000 <= now.getTime());
  }
}
