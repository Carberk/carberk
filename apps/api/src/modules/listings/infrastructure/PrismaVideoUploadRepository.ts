import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, Prisma } from "@auto-tm/db";

import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import type {
  VideoGeneration,
  VideoSession,
  VideoSource,
} from "../domain/VideoUpload";
import type {
  OpenVideoSessionInput,
  VideoCleanup,
  OpenVideoSessionResult,
  VideoUploadRepository,
} from "../domain/ports/VideoUploadRepository";

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];
type SlotRow = NonNullable<Awaited<ReturnType<Tx["listingVideo"]["findFirst"]>>>;
type SourceRow = Awaited<ReturnType<Tx["videoSource"]["findUniqueOrThrow"]>>;
type GenerationRow = Awaited<ReturnType<Tx["videoGeneration"]["findUniqueOrThrow"]>>;

const conflict = (message: string) =>
  new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT, message);

function toSession(slot: SlotRow, source: SourceRow, generation: GenerationRow): VideoSession {
  return {
    slot: {
      id: slot.id,
      ownerId: slot.ownerId,
      target:
        slot.draftId !== null
          ? { type: "draft", id: slot.draftId }
          : { type: "listing", id: slot.listingId ?? "" },
      activeGenerationId: slot.activeGenerationId,
      pendingGenerationId: slot.pendingGenerationId,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
    },
    source: {
      id: source.id,
      userId: source.userId,
      listingVideoId: source.listingVideoId,
      bucket: source.bucket,
      objectKey: source.objectKey,
      multipartUploadId: source.multipartUploadId,
      contentType: source.contentType,
      sizeBytes: source.sizeBytes,
      partSizeBytes: source.partSizeBytes,
      partCount: source.partCount,
      state: source.state as VideoSource["state"],
      openIdempotencyKey: source.openIdempotencyKey,
      coverOffsetMs: source.coverOffsetMs,
      expiresAt: source.expiresAt,
      completionStartedAt: source.completionStartedAt,
      completedAt: source.completedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    },
    generation: {
      id: generation.id,
      listingVideoId: generation.listingVideoId,
      sourceId: generation.sourceId,
      status: generation.status as VideoGeneration["status"],
      coverOffsetMs: generation.coverOffsetMs,
      processingAttempt: generation.processingAttempt,
      processingRetryCount: generation.processingRetryCount,
      nextRetryAt: generation.nextRetryAt,
      failureType: generation.failureType as VideoGeneration["failureType"],
      lastError: generation.lastError,
      createdAt: generation.createdAt,
      updatedAt: generation.updatedAt,
    },
  };
}

@Injectable()
export class PrismaVideoUploadRepository implements VideoUploadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async loadSession(tx: Tx, sourceId: string): Promise<VideoSession | null> {
    const source = await tx.videoSource.findUnique({ where: { id: sourceId } });
    if (!source) return null;
    const slot = await tx.listingVideo.findUnique({ where: { id: source.listingVideoId } });
    const generation = await tx.videoGeneration.findUnique({ where: { sourceId } });
    if (!slot || !generation) return null;
    return toSession(slot, source, generation);
  }

  /** Takes the source row lock; callers must not hold it across storage I/O. */
  private async lockSource(tx: Tx, sourceId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "video_sources" WHERE "id" = ${sourceId} FOR UPDATE`;
  }

  private async assertEligibleTarget(tx: Tx, ownerId: string, target: { type: "draft" | "listing"; id: string }): Promise<void> {
    const owner = await tx.user.findUnique({ where: { id: ownerId } });
    if (!owner || owner.suspendedAt || owner.deletionScheduledAt) throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE, "Video upload is not available");
    if (target.type === "draft") {
      await tx.$queryRaw`SELECT id FROM listing_drafts WHERE id = ${target.id} FOR UPDATE`;
      const draft = await tx.listingDraft.findUnique({ where: { id: target.id } });
      if (draft?.userId === ownerId) return;
    } else {
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${target.id} FOR UPDATE`;
      const listing = await tx.listing.findUnique({ where: { id: target.id } });
      if (listing?.sellerId === ownerId && !listing.deletedAt && listing.status !== "banned") return;
    }
    throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE, "Video upload is not available");
  }

  async openSession(input: OpenVideoSessionInput): Promise<OpenVideoSessionResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
      // One owner's reservations serialize even for a new slot or reused key
      // on a different target. The target lock also fences deletion/ban.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.ownerId} FOR UPDATE`;
      await this.assertEligibleTarget(tx, input.ownerId, input.target);
      if (input.openIdempotencyKey) {
        const replayed = await tx.videoSource.findUnique({
          where: {
            userId_openIdempotencyKey: {
              userId: input.ownerId,
              openIdempotencyKey: input.openIdempotencyKey,
            },
          },
        });
        if (replayed) {
          const session = await this.loadSession(tx, replayed.id);
          if (!session) throw new Error("Video session rows are incomplete");
          const same =
            session.slot.target.type === input.target.type &&
            session.slot.target.id === input.target.id &&
            replayed.contentType === input.contentType &&
            replayed.sizeBytes === input.sizeBytes &&
            replayed.coverOffsetMs === input.coverOffsetMs;
          if (!same) throw conflict("Idempotency key was reused with different input");
          return { kind: "replay", session };
        }
      }

      let slot = await tx.listingVideo.findFirst({
        where: {
          ownerId: input.ownerId,
          ...(input.target.type === "draft"
            ? { draftId: input.target.id }
            : { listingId: input.target.id }),
        },
      });
      if (slot?.pendingGenerationId) {
        const pending = await tx.videoGeneration.findUnique({
          where: { id: slot.pendingGenerationId },
        });
        if (pending && (pending.status === "Uploading" || pending.status === "Processing")) {
          throw conflict("Target already has a pending video");
        }
      }
      if (!slot) {
        slot = await tx.listingVideo.create({
          data: {
            id: input.slotId,
            ownerId: input.ownerId,
            ...(input.target.type === "draft"
              ? { draftId: input.target.id }
              : { listingId: input.target.id }),
          },
        });
      }

      const source = await tx.videoSource.create({
        data: {
          id: input.sourceId,
          userId: input.ownerId,
          listingVideoId: slot.id,
          bucket: input.bucket,
          objectKey: input.objectKey,
          multipartUploadId: input.multipartUploadId,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          partSizeBytes: input.partSizeBytes,
          partCount: input.partCount,
          state: "OPEN",
          openIdempotencyKey: input.openIdempotencyKey,
          coverOffsetMs: input.coverOffsetMs,
          expiresAt: input.expiresAt,
        },
      });
      const generation = await tx.videoGeneration.create({
        data: {
          id: input.generationId,
          listingVideoId: slot.id,
          sourceId: source.id,
          status: "Uploading",
          coverOffsetMs: input.coverOffsetMs,
          processingAttempt: 1,
        },
      });
      const updatedSlot = await tx.listingVideo.update({
        where: { id: slot.id },
        data: { pendingGenerationId: generation.id },
      });
      return { kind: "opened", session: toSession(updatedSlot, source, generation) };
    });
  }

  async findSession(sessionId: string): Promise<VideoSession | null> {
    return this.prisma.$transaction((tx) => this.loadSession(tx, sessionId));
  }

  async findByOpenIdempotency(userId: string, key: string): Promise<VideoSession | null> {
    const source = await this.prisma.videoSource.findUnique({
      where: { userId_openIdempotencyKey: { userId, openIdempotencyKey: key } },
    });
    if (!source) return null;
    return this.findSession(source.id);
  }

  async findSlotForTarget(
    ownerId: string,
    target: { type: "draft" | "listing"; id: string },
  ) {
    const slot = await this.prisma.listingVideo.findFirst({
      where: {
        ownerId,
        ...(target.type === "draft" ? { draftId: target.id } : { listingId: target.id }),
      },
    });
    if (!slot) return null;
    return {
      id: slot.id,
      ownerId: slot.ownerId,
      target,
      activeGenerationId: slot.activeGenerationId,
      pendingGenerationId: slot.pendingGenerationId,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
    };
  }

  async claimCompletion(sessionId: string, now: Date): Promise<{ session: VideoSession; claimed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, sessionId);
      const session = await this.loadSession(tx, sessionId);
      if (!session) throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE, "Video upload is not available");
      if (session.source.state === "COMPLETED") return { session, claimed: false };
      if (session.source.state === "CANCELLED") throw conflict("Upload was cancelled");
      if (session.source.state === "EXPIRED" || (session.source.state === "OPEN" && session.source.expiresAt <= now)) {
        throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED, "Upload expired");
      }
      if (session.source.state === "COMPLETING" && session.source.completionStartedAt &&
          now.getTime() - session.source.completionStartedAt.getTime() < 120_000) {
        return { session, claimed: false };
      }
      await this.assertEligibleTarget(tx, session.source.userId, session.slot.target);
      const source = await tx.videoSource.update({
        where: { id: sessionId }, data: { state: "COMPLETING", completionStartedAt: now },
      });
      return { session: { ...session, source: { ...session.source, state: "COMPLETING", completionStartedAt: source.completionStartedAt } }, claimed: true };
    });
  }

  async finishCompletion(sessionId: string, now: Date): Promise<VideoSession> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, sessionId);
      const current = await this.loadSession(tx, sessionId);
      if (!current) throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE, "Video upload is not available");
      if (current.source.state === "COMPLETED") return current;
      if (current.source.state !== "COMPLETING") throw conflict("Upload is terminal");
      await this.assertEligibleTarget(tx, current.source.userId, current.slot.target);
      const source = await tx.videoSource.update({
        where: { id: sessionId }, data: { state: "COMPLETED", completedAt: now },
      });
      const generation = await tx.videoGeneration.update({
        where: { sourceId: sessionId },
        data: { status: "Processing" },
      });
      const slot = await tx.listingVideo.findUniqueOrThrow({ where: { id: source.listingVideoId } });
      return toSession(slot, source, generation);
    });
  }

  async claimProcessingRetry(sessionId: string, now: Date): Promise<{ sourceId: string; generationId: string; attempt: number }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, sessionId);
      const session = await this.loadSession(tx, sessionId);
      if (!session || session.source.state !== "COMPLETED" || session.generation.status !== "Failed") {
        throw conflict("Video is not ready to reprocess");
      }
      if (session.generation.failureType === "SOURCE_MISSING" || session.generation.failureType === "SOURCE_INVALID") {
        throw conflict("This uploaded source cannot be reprocessed; choose another video");
      }
      const attempt = session.generation.processingAttempt + 1;
      const generation = await tx.videoGeneration.update({
        where: { id: session.generation.id },
        data: { status: "Processing", processingAttempt: attempt, processingRetryCount: 0, manifest: Prisma.JsonNull, lastError: null, failureType: null, nextRetryAt: null, processingStartedAt: now, completedAt: null },
      });
      return { sourceId: session.source.id, generationId: generation.id, attempt };
    });
  }

  async claimCancellation(sessionId: string, now: Date): Promise<VideoSession> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, sessionId);
      const session = await this.loadSession(tx, sessionId);
      if (!session) {
        throw new DomainError(
          LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE,
          "Video upload is not available",
        );
      }
      if (session.source.state === "CANCELLED") return session;
      if (session.source.state === "COMPLETED") throw conflict("Upload already completed");
      if (session.source.state === "COMPLETING") throw conflict("Completion is in progress");
      if (session.source.state === "EXPIRED") {
        throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED, "Upload expired");
      }
      const source = await tx.videoSource.update({
        where: { id: sessionId },
        data: { state: "CANCELLED" },
      });
      const generation = await tx.videoGeneration.update({
        where: { sourceId: sessionId },
        data: { status: "Retired" },
      });
      const slot = await tx.listingVideo.update({
        where: { id: source.listingVideoId },
        data: { pendingGenerationId: null },
      });
      await tx.videoUploadCleanup.upsert({
        where: { sourceId: sessionId },
        create: {
          sourceId: sessionId,
          objectKey: source.objectKey,
          multipartUploadId: source.multipartUploadId,
          status: "PENDING",
          nextAttemptAt: now,
        },
        update: { status: "PENDING", nextAttemptAt: now },
      });
      return toSession(slot, source, generation);
    });
  }

  async claimExpiry(sessionId: string, now: Date): Promise<VideoSession> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSource(tx, sessionId);
      const session = await this.loadSession(tx, sessionId);
      if (!session) {
        throw new DomainError(
          LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE,
          "Video upload is not available",
        );
      }
      if (
        session.source.state === "COMPLETED" ||
        session.source.state === "COMPLETING" ||
        session.source.state === "CANCELLED" ||
        session.source.state === "EXPIRED"
      ) {
        return session;
      }
      const source = await tx.videoSource.update({
        where: { id: sessionId },
        data: { state: "EXPIRED" },
      });
      const generation = await tx.videoGeneration.update({
        where: { sourceId: sessionId },
        data: { status: "Retired" },
      });
      const slot = await tx.listingVideo.update({
        where: { id: source.listingVideoId },
        data: { pendingGenerationId: null },
      });
      await tx.videoUploadCleanup.upsert({
        where: { sourceId: sessionId },
        create: {
          sourceId: sessionId,
          objectKey: source.objectKey,
          multipartUploadId: source.multipartUploadId,
          status: "PENDING",
          nextAttemptAt: now,
        },
        update: { status: "PENDING", nextAttemptAt: now },
      });
      return toSession(slot, source, generation);
    });
  }

  async listExpired(now: Date, limit: number): Promise<VideoSource[]> {
    const rows = await this.prisma.videoSource.findMany({
      where: { state: "OPEN", expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return rows.map((source) => this.toSource(source));
  }

  async listStaleCompletions(now: Date, limit: number): Promise<VideoSource[]> {
    const rows = await this.prisma.videoSource.findMany({
      where: { state: "COMPLETING", completionStartedAt: { lte: new Date(now.getTime() - 120_000) } },
      orderBy: { completionStartedAt: "asc" },
      take: limit,
    });
    return rows.map((source) => this.toSource(source));
  }

  private toSource(source: SourceRow): VideoSource {
    return {
      id: source.id,
      userId: source.userId,
      listingVideoId: source.listingVideoId,
      bucket: source.bucket,
      objectKey: source.objectKey,
      multipartUploadId: source.multipartUploadId,
      contentType: source.contentType,
      sizeBytes: source.sizeBytes,
      partSizeBytes: source.partSizeBytes,
      partCount: source.partCount,
      state: source.state as VideoSource["state"],
      openIdempotencyKey: source.openIdempotencyKey,
      coverOffsetMs: source.coverOffsetMs,
      expiresAt: source.expiresAt,
      completionStartedAt: source.completionStartedAt,
      completedAt: source.completedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }

  async recordCleanup(work: VideoCleanup, now: Date): Promise<void> {
    await this.prisma.videoUploadCleanup.upsert({
      where: { sourceId: work.sourceId },
      create: { ...work, status: "PENDING", nextAttemptAt: now },
      update: {},
    });
  }

  async listPendingCleanup(now: Date, limit: number) {
    return this.prisma.videoUploadCleanup.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: "asc" }, take: limit,
    });
  }

  async markCleanupDone(sourceId: string, now: Date): Promise<void> {
    await this.prisma.videoUploadCleanup.updateMany({
      where: { sourceId },
      data: { status: "DONE", completedAt: now },
    });
  }

  async markCleanupFailed(sourceId: string, error: string, now: Date): Promise<void> {
    const existing = await this.prisma.videoUploadCleanup.findUnique({ where: { sourceId } });
    const attempts = (existing?.attempts ?? 0) + 1;
    const backoffMs = Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** attempts);
    await this.prisma.videoUploadCleanup.updateMany({
      where: { sourceId, status: "PENDING" },
      data: {
        status: "PENDING",
        attempts,
        nextAttemptAt: new Date(now.getTime() + backoffMs),
        // Error names only: messages can carry endpoints or signed URLs.
        lastError: error.slice(0, 120),
      },
    });
  }

  async hasPendingCleanup(sourceId: string): Promise<boolean> {
    const row = await this.prisma.videoUploadCleanup.findFirst({
      where: { sourceId, status: "PENDING" },
    });
    return row !== null;
  }
}
