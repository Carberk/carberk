import { DomainError, LISTING_ERROR_CODES } from "../../domain/types";
import type {
  VideoSession,
  VideoSource,
} from "../../domain/VideoUpload";
import type {
  ListedVideoPart,
  VideoStoragePort,
  VideoStoredObject,
} from "../../domain/ports/VideoStoragePort";
import type {
  OpenVideoSessionInput,
  VideoCleanup,
  OpenVideoSessionResult,
  VideoUploadRepository,
} from "../../domain/ports/VideoUploadRepository";

const conflict = (message: string) =>
  new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_CONFLICT, message);

interface StoredMultipart {
  uploadId: string;
  key: string;
  parts: Map<number, { sizeBytes: number; etag: string }>;
  completedSize: number | null;
  aborted: boolean;
}

/** In-memory Bucket: parts are confirmed only when the server lists them. */
export class FakeVideoStorage implements VideoStoragePort {
  readonly bucket = "listing-videos";
  private uploads = new Map<string, StoredMultipart>();
  private objects = new Map<string, VideoStoredObject>();
  completeCalls = 0;
  abortCalls = 0;
  failAbort = false;
  deferCompletion = false;
  private deferredCompletion: (() => Promise<void>) | undefined;

  async deliverDeferredCompletion(): Promise<void> {
    const deliver = this.deferredCompletion;
    this.deferredCompletion = undefined;
    if (deliver) await deliver();
  }

  async createMultipart(input: { key: string }): Promise<{ uploadId: string }> {
    const uploadId = `upload-${this.uploads.size + 1}-${input.key}`;
    this.uploads.set(input.key, {
      uploadId,
      key: input.key,
      parts: new Map(),
      completedSize: null,
      aborted: false,
    });
    return { uploadId };
  }

  async presignPart(input: { key: string; partNumber: number }): Promise<{ url: string }> {
    return { url: `https://bucket.test/${input.key}?part=${input.partNumber}` };
  }

  /** Test helper simulating the client's direct PUT of one part. */
  putPart(key: string, partNumber: number, sizeBytes: number): void {
    const upload = this.uploads.get(key);
    if (!upload || upload.aborted) throw new Error("No such upload");
    upload.parts.set(partNumber, { sizeBytes, etag: `"etag-${partNumber}-${sizeBytes}"` });
  }

  async listParts(input: { key: string; uploadId: string }): Promise<ListedVideoPart[]> {
    const upload = this.uploads.get(input.key);
    if (!upload || upload.aborted || upload.completedSize !== null || upload.uploadId !== input.uploadId) {
      const err = new Error("NoSuchUpload") as Error & { name: string };
      err.name = "NoSuchUpload";
      throw err;
    }
    return [...upload.parts.entries()]
      .map(([partNumber, part]) => ({ partNumber, sizeBytes: part.sizeBytes, etag: part.etag }))
      .sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(input: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }): Promise<void> {
    const upload = this.uploads.get(input.key);
    if (!upload || upload.aborted || upload.uploadId !== input.uploadId || upload.completedSize !== null) {
      const err = new Error("NoSuchUpload") as Error & { name: string };
      err.name = "NoSuchUpload";
      throw err;
    }
    if (this.deferCompletion) {
      this.deferCompletion = false;
      this.deferredCompletion = () => this.completeMultipart(input);
      throw new Error("TimeoutError");
    }
    this.completeCalls += 1;
    const total = input.parts.reduce(
      (sum, part) => sum + (upload.parts.get(part.partNumber)?.sizeBytes ?? 0),
      0,
    );
    upload.completedSize = total;
    this.objects.set(input.key, { sizeBytes: total, contentType: "video/mp4" });
  }

  async abortMultipart(input: { key: string; uploadId: string }): Promise<void> {
    this.abortCalls += 1;
    if (this.failAbort) throw new Error("StorageUnavailable");
    const upload = this.uploads.get(input.key);
    if (upload && upload.uploadId === input.uploadId) {
      upload.aborted = true;
      upload.parts.clear();
    }
  }

  async headObject(key: string): Promise<VideoStoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  hasMultipart(key: string): boolean {
    const upload = this.uploads.get(key);
    return Boolean(upload && !upload.aborted && upload.completedSize === null);
  }
}

/** In-memory session store serializing transitions the way row locks do. */
export class InMemoryVideoUploadRepository implements VideoUploadRepository {
  sessions = new Map<string, VideoSession>();
  cleanups = new Set<string>();
  private cleanupWork = new Map<string, VideoCleanup>();
  private chain: Promise<void> = Promise.resolve();

  private async locked<T>(fn: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = gate;
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async openSession(input: OpenVideoSessionInput): Promise<OpenVideoSessionResult> {
    return this.locked(() => {
      if (input.openIdempotencyKey) {
        const existing = [...this.sessions.values()].find(
          (s) =>
            s.source.userId === input.ownerId &&
            s.source.openIdempotencyKey === input.openIdempotencyKey,
        );
        if (existing) {
          const s = existing.source;
          const sameInput =
            existing.slot.target.type === input.target.type &&
            existing.slot.target.id === input.target.id &&
            s.contentType === input.contentType &&
            s.sizeBytes === input.sizeBytes &&
            s.coverOffsetMs === input.coverOffsetMs;
          if (!sameInput) throw conflict("Idempotency key was reused with different input");
          return { kind: "replay", session: existing };
        }
      }
      const slot = [...this.sessions.values()].find(
        (s) =>
          s.slot.ownerId === input.ownerId &&
          s.slot.target.type === input.target.type &&
          s.slot.target.id === input.target.id &&
          s.slot.pendingGenerationId !== null &&
          (s.generation.status === "Uploading" || s.generation.status === "Processing"),
      );
      if (slot) throw conflict("Target already has a pending video");

      const session: VideoSession = {
        slot: {
          id: input.slotId,
          ownerId: input.ownerId,
          target: input.target,
          activeGenerationId: null,
          pendingGenerationId: input.generationId,
          createdAt: input.now,
          updatedAt: input.now,
        },
        source: {
          id: input.sourceId,
          userId: input.ownerId,
          listingVideoId: input.slotId,
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
          completionStartedAt: null,
          completedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
        },
        generation: {
          id: input.generationId,
          listingVideoId: input.slotId,
          sourceId: input.sourceId,
          status: "Uploading",
          coverOffsetMs: input.coverOffsetMs,
          processingAttempt: 1,
          createdAt: input.now,
          updatedAt: input.now,
        },
      };
      this.sessions.set(input.sourceId, session);
      return { kind: "opened", session };
    });
  }

  async findSession(sessionId: string): Promise<VideoSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findSlotForTarget(
    ownerId: string,
    target: { type: "draft" | "listing"; id: string },
  ) {
    const found = [...this.sessions.values()].find(
      (s) =>
        s.slot.ownerId === ownerId &&
        s.slot.target.type === target.type &&
        s.slot.target.id === target.id,
    );
    return found?.slot ?? null;
  }

  async findByOpenIdempotency(userId: string, key: string): Promise<VideoSession | null> {
    return (
      [...this.sessions.values()].find(
        (s) => s.source.userId === userId && s.source.openIdempotencyKey === key,
      ) ?? null
    );
  }

  private mustGet(sessionId: string): VideoSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DomainError(
        LISTING_ERROR_CODES.VIDEO_UPLOAD_NOT_AVAILABLE,
        "Video upload is not available",
      );
    }
    return session;
  }

  async claimCompletion(sessionId: string, now: Date): Promise<{ session: VideoSession; claimed: boolean }> {
    return this.locked(() => {
      const session = this.mustGet(sessionId);
      if (session.source.state === "COMPLETED") return { session, claimed: false };
      if (session.source.state === "CANCELLED") throw conflict("Upload was cancelled");
      if (session.source.state === "EXPIRED" || (session.source.state === "OPEN" && session.source.expiresAt <= now)) {
        throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED, "Upload expired");
      }
      if (session.source.state === "COMPLETING" && session.source.completionStartedAt && now.getTime() - session.source.completionStartedAt.getTime() < 120_000) return { session, claimed: false };
      session.source.state = "COMPLETING";
      session.source.completionStartedAt = now;
      return { session, claimed: true };
    });
  }

  async finishCompletion(sessionId: string, now: Date): Promise<VideoSession> {
    return this.locked(() => {
      const session = this.mustGet(sessionId);
      if (session.source.state === "COMPLETED") return session;
      if (session.source.state !== "COMPLETING") throw conflict("Upload is terminal");
      session.source.state = "COMPLETED";
      session.source.completedAt = now;
      session.source.updatedAt = now;
      session.generation.status = "Processing";
      session.generation.updatedAt = now;
      return session;
    });
  }

  async claimCancellation(sessionId: string, now: Date): Promise<VideoSession> {
    return this.locked(() => {
      const session = this.mustGet(sessionId);
      if (session.source.state === "CANCELLED") return session;
      if (session.source.state === "COMPLETED") throw conflict("Upload already completed");
      if (session.source.state === "COMPLETING") throw conflict("Completion is in progress");
      if (session.source.state === "EXPIRED") {
        throw new DomainError(LISTING_ERROR_CODES.VIDEO_UPLOAD_EXPIRED, "Upload expired");
      }
      session.source.state = "CANCELLED";
      session.source.updatedAt = now;
      session.generation.status = "Retired";
      session.generation.updatedAt = now;
      session.slot.pendingGenerationId = null;
      this.cleanups.add(sessionId);
      return session;
    });
  }

  async claimExpiry(sessionId: string, now: Date): Promise<VideoSession> {
    return this.locked(() => {
      const session = this.mustGet(sessionId);
      if (session.source.state === "COMPLETED" || session.source.state === "COMPLETING" || session.source.state === "CANCELLED") {
        return session;
      }
      if (session.source.state === "EXPIRED") return session;
      session.source.state = "EXPIRED";
      session.source.updatedAt = now;
      session.generation.status = "Retired";
      session.generation.updatedAt = now;
      session.slot.pendingGenerationId = null;
      this.cleanups.add(sessionId);
      return session;
    });
  }

  async listExpired(now: Date, limit: number): Promise<VideoSource[]> {
    return [...this.sessions.values()]
      .map((s) => s.source)
      .filter(
        (s) =>
          s.state === "OPEN" && s.expiresAt <= now,
      )
      .slice(0, limit);
  }

  async listStaleCompletions(now: Date, limit: number): Promise<VideoSource[]> {
    return [...this.sessions.values()]
      .map((s) => s.source)
      .filter((s) => s.state === "COMPLETING" && Boolean(s.completionStartedAt && now.getTime() - s.completionStartedAt.getTime() >= 120_000))
      .slice(0, limit);
  }

  async recordCleanup(work: VideoCleanup): Promise<void> {
    this.cleanups.add(work.sourceId);
    this.cleanupWork.set(work.sourceId, work);
  }

  async listPendingCleanup(_now: Date, limit: number) {
    return [...this.cleanups].slice(0, limit).map((sourceId) => this.cleanupWork.get(sourceId) ?? ({
      sourceId, objectKey: this.mustGet(sourceId).source.objectKey,
      multipartUploadId: this.mustGet(sourceId).source.multipartUploadId,
    }));
  }

  async markCleanupDone(sourceId: string): Promise<void> {
    this.cleanups.delete(sourceId);
  }

  async markCleanupFailed(sourceId: string): Promise<void> {
    this.cleanups.add(sourceId);
  }

  async hasPendingCleanup(sourceId: string): Promise<boolean> {
    return this.cleanups.has(sourceId);
  }
}
