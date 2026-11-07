import type {
  ListingVideoSlot,
  VideoGeneration,
  VideoSession,
  VideoSource,
  VideoUploadTarget,
} from "../VideoUpload";

export interface OpenVideoSessionInput {
  slotId: string;
  sourceId: string;
  generationId: string;
  ownerId: string;
  target: VideoUploadTarget;
  bucket: string;
  objectKey: string;
  multipartUploadId: string;
  contentType: string;
  sizeBytes: number;
  partSizeBytes: number;
  partCount: number;
  coverOffsetMs: number;
  openIdempotencyKey: string | null;
  expiresAt: Date;
  now: Date;
}

export type OpenVideoSessionResult =
  | { kind: "opened"; session: VideoSession }
  | { kind: "replay"; session: VideoSession };

/**
 * Persistence for video upload sessions. Every state transition takes the
 * source row lock, so completion, cancellation and expiry serialize to one
 * outcome (ADR-0112). Implementations must not hold the lock across storage I/O.
 */
export interface VideoUploadRepository {
  /** Creates slot+source+generation, or replays an idempotent open. Throws on conflict. */
  openSession(input: OpenVideoSessionInput): Promise<OpenVideoSessionResult>;
  findSession(sessionId: string): Promise<VideoSession | null>;
  findByOpenIdempotency(userId: string, key: string): Promise<VideoSession | null>;
  findSlotForTarget(ownerId: string, target: VideoUploadTarget): Promise<ListingVideoSlot | null>;
  /** OPEN -> COMPLETING, persisting completion intent before storage I/O. */
  claimCompletion(sessionId: string, now: Date): Promise<{ session: VideoSession; claimed: boolean }>;
  /** COMPLETING -> COMPLETED and generation Uploading -> Processing. */
  finishCompletion(sessionId: string, now: Date): Promise<VideoSession>;
  /** OPEN -> CANCELLED, retiring the pending generation and recording cleanup. */
  claimCancellation(sessionId: string, now: Date): Promise<VideoSession>;
  /** OPEN -> EXPIRED, retiring the pending generation and recording cleanup. */
  claimExpiry(sessionId: string, now: Date): Promise<VideoSession>;
  /** Expired OPEN sessions eligible for terminal expiry. */
  listExpired(now: Date, limit: number): Promise<VideoSource[]>;
  /** Stale completion intents are reconciled separately from expiry backlog. */
  listStaleCompletions(now: Date, limit: number): Promise<VideoSource[]>;
  recordCleanup(work: VideoCleanup, now: Date): Promise<void>;
  listPendingCleanup(now: Date, limit: number): Promise<VideoCleanup[]>;
  markCleanupDone(sourceId: string, now: Date): Promise<void>;
  markCleanupFailed(sourceId: string, error: string, now: Date): Promise<void>;
  hasPendingCleanup(sourceId: string): Promise<boolean>;
  /** Failed -> Processing with a new fenced output namespace, retaining source bytes. */
  claimProcessingRetry(sessionId: string, now: Date): Promise<{ sourceId: string; generationId: string; attempt: number }>;
}

export const VIDEO_UPLOAD_REPOSITORY = Symbol("VideoUploadRepository");

export type { ListingVideoSlot, VideoGeneration, VideoSession, VideoSource };

export interface VideoCleanup {
  sourceId: string;
  objectKey: string;
  multipartUploadId: string | null;
}
