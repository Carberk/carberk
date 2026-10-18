export const VIDEO_OBJECT_STORAGE = Symbol("VideoObjectStorage");
export const VIDEO_PART_BYTES = 5 * 1024 * 1024;
/** Loaded from the authorized durable session, never from a transport body.
 * The caller owns account/target eligibility and cancel/completion fences. */
export interface VideoStorageSession {
  sessionId: string; uploadId: string; storageUploadId: string;
  expectedBytes: number; expiresAt: Date;
}
export interface VideoConfirmedPart { partNumber: number; sizeBytes: number; etag: string; }
export interface VideoObjectStorage {
  recoverInitialization(sessionId: string, uploadId: string): Promise<string | null>;
  sourceCommitted(session: VideoStorageSession): Promise<boolean>;
  initialize(sessionId: string, uploadId: string): Promise<string>;
  listParts(session: VideoStorageSession): Promise<VideoConfirmedPart[]>;
  partCredential(session: VideoStorageSession, partNumber: number): Promise<{ url: string; expiresAt: Date; sizeBytes: number }>;
  complete(session: VideoStorageSession): Promise<void>;
  abort(session: VideoStorageSession): Promise<void>;
}
