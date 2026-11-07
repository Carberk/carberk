import { randomUUID } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import {
  videoPartLayout,
  videoSessionExpiresAt,
  videoSessionState,
  VIDEO_PART_URL_TTL_SECONDS,
  VIDEO_UPLOAD_PART_SIZE_BYTES,
  type VideoSession,
  type VideoUploadTarget,
} from "../domain/VideoUpload";
import {
  VIDEO_STORAGE_PORT,
  type VideoStoragePort,
} from "../domain/ports/VideoStoragePort";
import {
  VIDEO_UPLOAD_REPOSITORY,
  type VideoUploadRepository,
  type VideoCleanup,
} from "../domain/ports/VideoUploadRepository";
import {
  VIDEO_UPLOAD_ACCESS_PORT,
  type VideoUploadAccessPort,
} from "../domain/ports/VideoUploadAccessPort";
import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";

export const VIDEO_UPLOAD_NOW = Symbol("VideoUploadNow");

export interface OpenVideoUploadInput {
  userId: string;
  target: VideoUploadTarget;
  contentType: string;
  sizeBytes: number;
  coverOffsetMs: number;
  idempotencyKey?: string | undefined;
}

export interface VideoPartView {
  partNumber: number;
  sizeBytes: number;
  uploadUrl: string;
  expiresAt: string;
}

export interface VideoUploadView {
  sessionId: string;
  generationId: string;
  target: VideoUploadTarget;
  state: "UPLOADING" | "PROCESSING" | "FAILED" | "CANCELLED" | "EXPIRED";
  failureReason?: string | null;
  failureType?: "SOURCE_MISSING" | "SOURCE_INVALID" | "TRANSIENT" | null;
  partSizeBytes: number;
  confirmedParts: { partNumber: number; sizeBytes: number }[];
  parts: VideoPartView[];
  expiresAt: string;
}

const notAvailable = () =>
  new NotFoundException({
    code: LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE,
    message: "Video upload is not available",
  });

function isNoSuchUpload(err: unknown): boolean {
  const failure = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    failure.name === "NoSuchUpload" ||
    failure.Code === "NoSuchUpload" ||
    failure.$metadata?.httpStatusCode === 404
  );
}

function rethrowDomain(err: unknown): never {
  if (err instanceof DomainError) {
    if (err.code === LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT) {
      throw new ConflictException({ code: err.code, message: err.message });
    }
    if (err.code === LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED) {
      throw new BadRequestException({ code: err.code, message: err.message });
    }
    if (err.code === LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE) throw notAvailable();
  }
  throw err;
}

@Injectable()
export class VideoUploadSessions implements OnModuleInit, OnModuleDestroy {
  private readonly nowFn: () => Date;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(VIDEO_UPLOAD_REPOSITORY) private readonly repo: VideoUploadRepository,
    @Inject(VIDEO_STORAGE_PORT) private readonly storage: VideoStoragePort,
    @Inject(VIDEO_UPLOAD_ACCESS_PORT) private readonly access: VideoUploadAccessPort,
    @Inject(LISTING_DRAFT_REPOSITORY) private readonly drafts: ListingDraftRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Optional() @Inject(VIDEO_UPLOAD_NOW) nowFn?: () => Date,
    @Optional() @InjectQueue("video-transcode") private readonly videoQueue?: Queue,
  ) {
    this.nowFn = nowFn ?? (() => new Date());
  }

  onModuleInit(): void {
    // The API is the writer of this durable ledger; every replica may sweep,
    // while row locks make expiry and cleanup idempotent across replicas.
    this.sweepTimer = setInterval(() => {
      void this.expireDue().catch(() => undefined);
    }, 60_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async open(input: OpenVideoUploadInput): Promise<VideoUploadView> {
    if (input.idempotencyKey) {
      const existing = await this.repo.findByOpenIdempotency(input.userId, input.idempotencyKey);
      if (existing) {
        this.assertReplayMatches(existing, input);
        return this.status({ userId: input.userId, sessionId: existing.source.id });
      }
    }

    if (!this.access.canUploadVideo(input.userId)) {
      throw new ForbiddenException({
        code: LISTING_ERROR_CODES.LISTING_VIDEO_UNAVAILABLE,
        message: "Listing video is not available",
      });
    }
    await this.assertOwnedTarget(input.userId, input.target);

    const now = await this.now();
    const sourceId = randomUUID();
    const objectKey = `video-sources/${sourceId}/source.mp4`;
    const created = await this.storage.createMultipart({
      key: objectKey,
      contentType: input.contentType,
    });
    const layout = videoPartLayout(input.sizeBytes);
    let result;
    try {
      result = await this.repo.openSession({
        slotId: randomUUID(),
        sourceId,
        generationId: randomUUID(),
        ownerId: input.userId,
        target: input.target,
        bucket: this.storage.bucket,
        objectKey,
        multipartUploadId: created.uploadId,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        partSizeBytes: VIDEO_UPLOAD_PART_SIZE_BYTES,
        partCount: layout.length,
        coverOffsetMs: input.coverOffsetMs,
        openIdempotencyKey: input.idempotencyKey ?? null,
        expiresAt: videoSessionExpiresAt(now),
        now,
      });
    } catch (err) {
      // A failed reservation never granted part URLs. Persist cleanup before
      // attempting abort so a transient Bucket failure can be retried.
      const work = { sourceId, objectKey, multipartUploadId: created.uploadId };
      await this.repo.recordCleanup(work, now);
      await this.cleanup(work);
      rethrowDomain(err);
    }
    if (result.kind === "replay") {
      const work = { sourceId, objectKey, multipartUploadId: created.uploadId };
      await this.repo.recordCleanup(work, now);
      await this.cleanup(work);
      return this.status({ userId: input.userId, sessionId: result.session.source.id });
    }
    // Presigning failure leaves the persisted session resumable.
    return this.openView(result.session, now);
  }

  async status(input: { userId: string; sessionId: string }): Promise<VideoUploadView> {
    const session = await this.ownedSession(input.userId, input.sessionId);
    await this.assertCurrentEligibility(input.userId, session);
    const now = await this.now();
    if (session.source.state === "COMPLETING") {
      const head = await this.storage.headObject(session.source.objectKey);
      if (head?.sizeBytes === session.source.sizeBytes) return this.statusView(await this.finishAndEnqueue(session.source.id, now), now);
    }
    if (session.source.state === "OPEN" && now.getTime() >= session.source.expiresAt.getTime()) {
      const expired = await this.repo.claimExpiry(session.source.id, now).catch((e) => rethrowDomain(e));
      if (expired.source.state === "EXPIRED") await this.cleanupSession(expired);
      return this.statusView(expired, now);
    }
    return this.statusView(session, now);
  }

  async complete(input: { userId: string; sessionId: string }): Promise<VideoUploadView> {
    const session = await this.ownedSession(input.userId, input.sessionId);
    await this.assertCurrentEligibility(input.userId, session);
    const now = await this.now();
    if (session.source.state === "COMPLETED") return this.statusView(session, now);
    if (session.source.state === "CANCELLED") throw new ConflictException({ code: LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT, message: "Upload was cancelled" });
    if (session.source.state === "EXPIRED" || (session.source.state === "OPEN" && now >= session.source.expiresAt)) {
      const expired = await this.repo.claimExpiry(session.source.id, now).catch(rethrowDomain);
      if (expired.source.state !== "EXPIRED") return this.statusView(expired, now);
      await this.cleanupSession(expired);
      throw new BadRequestException({ code: LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED, message: "Video upload expired" });
    }
    const done = await this.completeSource(session, now);
    return this.statusView(done, await this.now());
  }

  private async completeSource(session: VideoSession, now: Date): Promise<VideoSession> {
    if (session.source.state === "COMPLETING") {
      const head = await this.storage.headObject(session.source.objectKey);
      if (head?.sizeBytes === session.source.sizeBytes) {
        return this.finishAndEnqueue(session.source.id, now);
      }
    }
    // Validate before recording completion intent. A missing/mismatched part
    // can still be replaced or cancelled; after intent no operation reopens it.
    let listed;
    try {
      listed = await this.storage.listParts({ key: session.source.objectKey, uploadId: session.source.multipartUploadId });
    } catch (err) {
      if (isNoSuchUpload(err)) {
        const head = await this.storage.headObject(session.source.objectKey);
        if (head?.sizeBytes === session.source.sizeBytes) return this.finishAndEnqueue(session.source.id, now);
      }
      throw err;
    }
    const layout = videoPartLayout(session.source.sizeBytes);
    const sorted = [...listed].sort((a, b) => a.partNumber - b.partNumber);
    if (sorted.length !== layout.length || !sorted.every((part, i) => part.partNumber === i + 1 && part.sizeBytes === layout[i])) {
      throw new BadRequestException({ code: LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID, message: "Uploaded parts do not match the declared video" });
    }
    const claim = await this.repo.claimCompletion(session.source.id, await this.now()).catch(rethrowDomain);
    if (claim.session.source.state === "COMPLETED") return claim.session;
    if (!claim.claimed) {
      const head = await this.storage.headObject(session.source.objectKey);
      if (head?.sizeBytes === session.source.sizeBytes) return this.finishAndEnqueue(session.source.id, now);
      throw new ConflictException({ code: LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT, message: "Completion is in progress; retry status" });
    }
    try {
      await this.storage.completeMultipart({
        key: session.source.objectKey, uploadId: session.source.multipartUploadId,
        parts: sorted.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
      });
    } catch (err) {
      // An absent/failed HEAD cannot disprove late provider success. Retain
      // COMPLETING and retry reconciliation; cancel/expiry cannot delete it.
      const head = await this.storage.headObject(session.source.objectKey).catch(() => null);
      if (head?.sizeBytes !== session.source.sizeBytes) throw err;
    }
    const stored = await this.storage.headObject(session.source.objectKey);
    if (stored?.sizeBytes !== session.source.sizeBytes) {
      throw new ConflictException({ code: LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT, message: "Completion is still being reconciled" });
    }
    return this.finishAndEnqueue(session.source.id, await this.now());
  }

  async cancel(input: { userId: string; sessionId: string }): Promise<{ sessionId: string; generationId: string; state: "CANCELLED" }> {
    const session = await this.ownedSession(input.userId, input.sessionId);
    await this.assertCurrentEligibility(input.userId, session);
    const now = await this.now();
    if (session.source.state === "CANCELLED") {
      if (await this.repo.hasPendingCleanup(session.source.id)) await this.cleanupSession(session);
      return { sessionId: session.source.id, generationId: session.generation.id, state: "CANCELLED" };
    }
    if (session.source.state === "COMPLETED") {
      throw new ConflictException({
        code: LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT,
        message: "A completed video cannot be cancelled",
      });
    }
    if (session.source.state === "EXPIRED") {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED,
        message: "Video upload expired",
      });
    }
    const claimed = await this.repo.claimCancellation(session.source.id, now).catch((e) => rethrowDomain(e));
    await this.cleanupSession(claimed);
    return { sessionId: claimed.source.id, generationId: claimed.generation.id, state: "CANCELLED" };
  }

  async reprocess(input: { userId: string; sessionId: string }): Promise<VideoUploadView> {
    const session = await this.ownedSession(input.userId, input.sessionId);
    await this.assertCurrentEligibility(input.userId, session);
    if (session.source.state !== "COMPLETED" || session.generation.status !== "Failed") {
      throw new ConflictException({ code: LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT, message: "Video is not ready to reprocess" });
    }
    const job = await this.repo.claimProcessingRetry(session.source.id, await this.now()).catch(rethrowDomain);
    if (this.videoQueue) await this.videoQueue.add("process", job, { jobId: `${job.generationId}-${job.attempt}`, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    const latest = await this.repo.findSession(session.source.id);
    if (!latest) throw notAvailable();
    return this.statusView(latest, await this.now());
  }

  /** Reconciles completion first; only OPEN sessions can expire. */
  async expireDue(limit = 50): Promise<number> {
    const now = await this.now();
    const due = await this.repo.listExpired(now, limit);
    let count = 0;
    for (const source of due) {
      try {
        const session = await this.repo.findSession(source.id);
        if (!session) continue;
        const expired = await this.repo.claimExpiry(source.id, now);
        if (expired.source.state === "EXPIRED") {
          await this.cleanupSession(expired);
          count += 1;
        }
      } catch {
        // Durable source/cleanup state remains for the next bounded sweep.
      }
    }
    // Reconcile completion intents in a separate bounded queue. A poisoned
    // completion can retry forever, but it cannot starve seven-day expiry.
    for (const source of await this.repo.listStaleCompletions(now, limit)) {
      try {
        const session = await this.repo.findSession(source.id);
        if (session?.source.state === "COMPLETING") await this.completeSource(session, now);
      } catch {
        // Keep the intent fenced for the next reconciliation sweep.
      }
    }
    await this.retryCleanup(limit);
    return count;
  }

  async retryCleanup(limit = 50): Promise<void> {
    for (const work of await this.repo.listPendingCleanup(await this.now(), limit)) {
      await this.cleanup(work);
    }
  }

  private async now(): Promise<Date> {
    return this.nowFn();
  }

  private async finishAndEnqueue(sourceId: string, now: Date): Promise<VideoSession> {
    const session = await this.repo.finishCompletion(sourceId, now).catch(rethrowDomain);
    if (this.videoQueue) {
      await this.videoQueue.add("process", { sourceId, generationId: session.generation.id, attempt: session.generation.processingAttempt }, { jobId: `${session.generation.id}-${session.generation.processingAttempt}`, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    }
    return session;
  }

  private async ownedSession(userId: string, sessionId: string): Promise<VideoSession> {
    const session = await this.repo.findSession(sessionId);
    if (!session || session.source.userId !== userId) throw notAvailable();
    return session;
  }

  private async assertCurrentEligibility(userId: string, session: VideoSession): Promise<void> {
    if (!this.access.canResumeVideo(userId)) throw notAvailable();
    await this.assertOwnedTarget(userId, session.slot.target);
  }

  private async assertOwnedTarget(userId: string, target: VideoUploadTarget): Promise<void> {
    if (target.type === "draft") {
      const draft = await this.drafts.findById(target.id);
      if (!draft || draft.userId !== userId) throw notAvailable();
      return;
    }
    const listing = await this.listings.findById(target.id);
    if (!listing || listing.sellerId !== userId || listing.deletedAt || listing.status === "banned") {
      throw notAvailable();
    }
  }

  private assertReplayMatches(session: VideoSession, input: OpenVideoUploadInput): void {
    const s = session.source;
    const same =
      session.slot.target.type === input.target.type &&
      session.slot.target.id === input.target.id &&
      s.contentType === input.contentType &&
      s.sizeBytes === input.sizeBytes &&
      s.coverOffsetMs === input.coverOffsetMs;
    if (!same) {
      throw new ConflictException({
        code: LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT,
        message: "Idempotency key was reused with different input",
      });
    }
  }

  private async cleanupSession(session: VideoSession): Promise<void> {
    if (session.source.state !== "CANCELLED" && session.source.state !== "EXPIRED") return;
    await this.cleanup({ sourceId: session.source.id, objectKey: session.source.objectKey, multipartUploadId: session.source.multipartUploadId });
  }

  private async cleanup(work: VideoCleanup): Promise<void> {
    const { objectKey, multipartUploadId, sourceId } = work;
    try {
      const current = await this.repo.findSession(sourceId);
      if (current && current.source.state !== "CANCELLED" && current.source.state !== "EXPIRED") return;
      if (multipartUploadId) {
        await this.storage.abortMultipart({ key: objectKey, uploadId: multipartUploadId }).catch((err) => {
          if (!isNoSuchUpload(err)) throw err;
        });
        try {
          await this.storage.listParts({ key: objectKey, uploadId: multipartUploadId });
          throw new Error("Multipart upload still present");
        } catch (err) {
          if (!isNoSuchUpload(err)) throw err;
        }
      }
      if (await this.storage.headObject(objectKey)) await this.storage.deleteObject(objectKey);
      if (await this.storage.headObject(objectKey)) throw new Error("Video source still present after cleanup");
      await this.repo.markCleanupDone(sourceId, await this.now());
    } catch (err) {
      await this.repo.markCleanupFailed(sourceId, err instanceof Error ? err.name : "cleanup failed", await this.now()).catch(() => undefined);
    }
  }

  private partUrlExpiry(session: VideoSession, now: Date): Date {
    const cap = session.source.expiresAt.getTime();
    return new Date(Math.min(now.getTime() + VIDEO_PART_URL_TTL_SECONDS * 1000, cap));
  }

  private async signedParts(
    session: VideoSession,
    now: Date,
    onlyPartNumbers?: Set<number>,
  ): Promise<VideoPartView[]> {
    if (now.getTime() >= session.source.expiresAt.getTime()) return [];
    const layout = videoPartLayout(session.source.sizeBytes);
    const expiresAt = this.partUrlExpiry(session, now);
    const views: VideoPartView[] = [];
    for (let i = 0; i < layout.length; i += 1) {
      const partNumber = i + 1;
      if (onlyPartNumbers && !onlyPartNumbers.has(partNumber)) continue;
      const ttl = Math.floor((expiresAt.getTime() - (await this.now()).getTime()) / 1000);
      if (ttl < 1) continue;
      const signed = await this.storage.presignPart({
        key: session.source.objectKey,
        uploadId: session.source.multipartUploadId,
        partNumber,
        expiresInSeconds: ttl,
      });
      const sizeBytes = layout[i];
      if (sizeBytes === undefined) continue;
      views.push({
        partNumber,
        sizeBytes,
        uploadUrl: signed.url,
        expiresAt: expiresAt.toISOString(),
      });
    }
    return views;
  }

  private async openView(session: VideoSession, now: Date): Promise<VideoUploadView> {
    return {
      sessionId: session.source.id,
      generationId: session.generation.id,
      target: session.slot.target,
      state: "UPLOADING",
      partSizeBytes: session.source.partSizeBytes,
      confirmedParts: [],
      parts: await this.signedParts(session, now),
      expiresAt: session.source.expiresAt.toISOString(),
    };
  }

  private terminalView(session: VideoSession): VideoUploadView {
    return {
      sessionId: session.source.id,
      generationId: session.generation.id,
      target: session.slot.target,
      state: videoSessionState(session.source, session.generation),
      failureReason: session.generation.lastError,
      failureType: session.generation.failureType,
      partSizeBytes: session.source.partSizeBytes,
      confirmedParts: [],
      parts: [],
      expiresAt: session.source.expiresAt.toISOString(),
    };
  }

  private async statusView(session: VideoSession, now: Date): Promise<VideoUploadView> {
    const state = videoSessionState(session.source, session.generation);
    if (state === "CANCELLED" || state === "EXPIRED") return this.terminalView(session);
    const layout = videoPartLayout(session.source.sizeBytes);
    if (state === "PROCESSING" || state === "FAILED") {
      return {
        sessionId: session.source.id,
        generationId: session.generation.id,
        target: session.slot.target,
        state,
        failureReason: session.generation.lastError,
        failureType: session.generation.failureType,
        partSizeBytes: session.source.partSizeBytes,
        confirmedParts: layout.map((sizeBytes, i) => ({ partNumber: i + 1, sizeBytes })),
        parts: [],
        expiresAt: session.source.expiresAt.toISOString(),
      };
    }
    let listed: { partNumber: number; sizeBytes: number }[] = [];
    try {
      listed = await this.storage.listParts({
        key: session.source.objectKey,
        uploadId: session.source.multipartUploadId,
      });
    } catch (err) {
      if (!isNoSuchUpload(err)) throw err;
    }
    if (session.source.state === "COMPLETING") {
      return {
        sessionId: session.source.id,
        generationId: session.generation.id,
        target: session.slot.target,
        state: "UPLOADING",
        partSizeBytes: session.source.partSizeBytes,
        confirmedParts: listed
          .filter((part) => layout[part.partNumber - 1] === part.sizeBytes)
          .map((part) => ({ partNumber: part.partNumber, sizeBytes: part.sizeBytes }))
          .sort((a, b) => a.partNumber - b.partNumber),
        parts: [],
        expiresAt: session.source.expiresAt.toISOString(),
      };
    }
    const confirmed = listed.filter(
      (part) => layout[part.partNumber - 1] === part.sizeBytes,
    );
    const confirmedNumbers = new Set(confirmed.map((p) => p.partNumber));
    const missing = new Set(
      layout.map((_, i) => i + 1).filter((n) => !confirmedNumbers.has(n)),
    );
    return {
      sessionId: session.source.id,
      generationId: session.generation.id,
      target: session.slot.target,
      state,
      partSizeBytes: session.source.partSizeBytes,
      confirmedParts: confirmed
        .map((p) => ({ partNumber: p.partNumber, sizeBytes: p.sizeBytes }))
        .sort((a, b) => a.partNumber - b.partNumber),
      parts: await this.signedParts(session, now, missing),
      expiresAt: session.source.expiresAt.toISOString(),
    };
  }
}
