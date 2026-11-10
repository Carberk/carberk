export interface VideoMediaStorage {
  readonly bucket: string;
  mediaHead(key: string): Promise<{ sizeBytes: number; etag: string }>;
  mediaRead(key: string, range?: string): Promise<Uint8Array>;
}
export const VIDEO_MEDIA_STORAGE = Symbol("VideoMediaStorage");
