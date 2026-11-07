/** Listing video multipart upload domain (ADR-0112, #1041). */

export const MAX_VIDEO_UPLOAD_BYTES = 15 * 1024 * 1024;
export const VIDEO_UPLOAD_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const VIDEO_UPLOAD_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VIDEO_PART_URL_TTL_SECONDS = 600;

export type VideoUploadTargetType = "draft" | "listing";
export interface VideoUploadTarget {
  type: VideoUploadTargetType;
  id: string;
}

export type VideoSourceState =
  | "OPEN"
  | "COMPLETING"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type VideoGenerationStatus =
  | "Uploading"
  | "Processing"
  | "Failed"
  | "Ready"
  | "Retired";

export type VideoFailureType = "SOURCE_MISSING" | "SOURCE_INVALID" | "TRANSIENT";

export interface ListingVideoSlot {
  id: string;
  ownerId: string;
  target: VideoUploadTarget;
  activeGenerationId: string | null;
  pendingGenerationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoSource {
  id: string;
  userId: string;
  listingVideoId: string;
  bucket: string;
  objectKey: string;
  multipartUploadId: string;
  contentType: string;
  sizeBytes: number;
  partSizeBytes: number;
  partCount: number;
  state: VideoSourceState;
  openIdempotencyKey: string | null;
  openingDraftId: string | null;
  coverOffsetMs: number;
  expiresAt: Date;
  completionStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoGeneration {
  id: string;
  listingVideoId: string;
  sourceId: string;
  status: VideoGenerationStatus;
  coverOffsetMs: number;
  processingAttempt: number;
  processingRetryCount: number;
  nextRetryAt: Date | null;
  failureType: VideoFailureType | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoSession {
  slot: ListingVideoSlot;
  source: VideoSource;
  generation: VideoGeneration;
}

/** Fixed server-chosen layout: 5 MiB parts, last part holds the remainder. */
export function videoPartLayout(sizeBytes: number): number[] {
  const sizes: number[] = [];
  let remaining = sizeBytes;
  while (remaining > VIDEO_UPLOAD_PART_SIZE_BYTES) {
    sizes.push(VIDEO_UPLOAD_PART_SIZE_BYTES);
    remaining -= VIDEO_UPLOAD_PART_SIZE_BYTES;
  }
  if (remaining > 0) sizes.push(remaining);
  return sizes;
}

export function videoSessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + VIDEO_UPLOAD_SESSION_TTL_MS);
}

/** Client-visible session state; completion means Processing, never Ready. */
export function videoSessionState(source: VideoSource, generation?: VideoGeneration): "UPLOADING" | "PROCESSING" | "FAILED" | "CANCELLED" | "EXPIRED" {
  switch (source.state) {
    case "OPEN":
    case "COMPLETING":
      return "UPLOADING";
    case "COMPLETED":
      return generation?.status === "Failed" ? "FAILED" : "PROCESSING";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
  }
}
