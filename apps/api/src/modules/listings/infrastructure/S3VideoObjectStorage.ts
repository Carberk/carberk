import type { VideoObjectStorage, VideoStorageSession, VideoConfirmedPart } from "../domain/ports/VideoObjectStorage";
export class S3VideoObjectStorage implements VideoObjectStorage {
  async initialize(_sessionId: string, _uploadId: string): Promise<string> { throw new Error("NOT_IMPLEMENTED"); }
  async listParts(_session: VideoStorageSession): Promise<VideoConfirmedPart[]> { throw new Error("NOT_IMPLEMENTED"); }
  async partCredential(_session: VideoStorageSession, _partNumber: number): Promise<{ url: string; expiresAt: Date; sizeBytes: number }> { throw new Error("NOT_IMPLEMENTED"); }
  async complete(_session: VideoStorageSession): Promise<void> { throw new Error("NOT_IMPLEMENTED"); }
  async abort(_session: VideoStorageSession): Promise<void> { throw new Error("NOT_IMPLEMENTED"); }
}
