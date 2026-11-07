export interface ListedVideoPart {
  partNumber: number;
  sizeBytes: number;
  etag: string;
}

export interface VideoStoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/** Direct-to-Bucket multipart storage for Listing video sources (ADR-0112). */
export interface VideoStoragePort {
  readonly bucket: string;
  assertUnversioned(): Promise<void>;
  listObjects(prefix: string): Promise<string[]>;
  createMultipart(input: { key: string; contentType: string }): Promise<{ uploadId: string }>;
  presignPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
  }): Promise<{ url: string }>;
  /** Server-authoritative part list; client ETags are never trusted. */
  listParts(input: { key: string; uploadId: string }): Promise<ListedVideoPart[]>;
  completeMultipart(input: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }): Promise<void>;
  abortMultipart(input: { key: string; uploadId: string }): Promise<void>;
  headObject(key: string): Promise<VideoStoredObject | null>;
  deleteObject(key: string): Promise<void>;
}

export const VIDEO_STORAGE_PORT = Symbol("VideoStoragePort");
