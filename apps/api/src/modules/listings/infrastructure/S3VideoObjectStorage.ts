import { type S3Client, CreateMultipartUploadCommand, ListPartsCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListMultipartUploadsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { VIDEO_PART_BYTES, type VideoObjectStorage, type VideoStorageSession, type VideoConfirmedPart } from "../domain/ports/VideoObjectStorage";
type SignPart = (client: S3Client, command: UploadPartCommand, options: { expiresIn: number; signableHeaders: Set<string> }) => Promise<string>;
export class S3VideoObjectStorage implements VideoObjectStorage {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly now: () => Date, private readonly sign: SignPart = getSignedUrl) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("VIDEO_STORAGE_CONFIG_INVALID");
  }
  /** Called only for an already durable initialization intent. An empty result
   * leaves it uncertain; callers must not issue another create for this key. */
  async recoverInitialization(sessionId: string, uploadId: string): Promise<string | null> {
    const key = this.key(sessionId, uploadId);
    const matches = new Set<string>(); let keyMarker: string | undefined; let uploadMarker: string | undefined;
    for (let page = 0; page < 4; page++) {
      const result = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.bucket, Prefix: key, MaxUploads: 100, ...(keyMarker ? { KeyMarker: keyMarker, UploadIdMarker: uploadMarker } : {}) }), { abortSignal: AbortSignal.timeout(10_000) });
      for (const upload of result.Uploads ?? []) if (upload.Key === key && upload.UploadId) matches.add(upload.UploadId);
      if (matches.size > 1) throw new Error("VIDEO_INITIALIZATION_AMBIGUOUS");
      if (!result.IsTruncated) return [...matches][0] ?? null;
      if (!result.NextKeyMarker || !result.NextUploadIdMarker || (result.NextKeyMarker === keyMarker && result.NextUploadIdMarker === uploadMarker)) throw new Error("VIDEO_INITIALIZATION_UNCERTAIN");
      keyMarker = result.NextKeyMarker; uploadMarker = result.NextUploadIdMarker;
    }
    throw new Error("VIDEO_INITIALIZATION_UNCERTAIN");
  }
  /** Completion provenance only. The worker still hashes and decodes all bytes. */
  async sourceCommitted(session: VideoStorageSession): Promise<boolean> {
    this.validate(session, false);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(session.sessionId, session.uploadId) }), { abortSignal: AbortSignal.timeout(10_000) });
      return result.ContentLength === session.expectedBytes && result.Metadata?.["video-session"] === session.sessionId && result.Metadata?.["video-upload"] === session.uploadId;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw new Error("VIDEO_STORAGE_UNAVAILABLE");
    }
  }
  async initialize(sessionId: string, uploadId: string): Promise<string> {
    const result = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: this.key(sessionId, uploadId), ContentType: "video/mp4", CacheControl: "private, no-store", Metadata: { "video-session": sessionId, "video-upload": uploadId } }), { abortSignal: AbortSignal.timeout(10_000) });
    if (!result.UploadId) throw new Error("VIDEO_STORAGE_UNAVAILABLE");
    return result.UploadId;
  }
  async listParts(session: VideoStorageSession): Promise<VideoConfirmedPart[]> {
    this.validate(session, false); const parts: VideoConfirmedPart[] = []; let marker: string | undefined;
    for (let page = 0; page < 4; page++) {
      const result = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: this.key(session.sessionId, session.uploadId), UploadId: session.storageUploadId, MaxParts: 100, ...(marker ? { PartNumberMarker: marker } : {}) }), { abortSignal: AbortSignal.timeout(10_000) });
      for (const part of result.Parts ?? []) {
        const number = part.PartNumber;
        if (!number || !part.ETag || part.Size !== this.partSize(session, number) || parts.some((known) => known.partNumber === number)) throw new Error("VIDEO_PARTS_INVALID");
        parts.push({ partNumber: number, sizeBytes: part.Size, etag: part.ETag });
      }
      if (!result.IsTruncated) return parts.sort((a, b) => a.partNumber - b.partNumber);
      if (!result.NextPartNumberMarker || result.NextPartNumberMarker === marker) throw new Error("VIDEO_PARTS_INVALID");
      marker = result.NextPartNumberMarker;
    }
    throw new Error("VIDEO_PARTS_INVALID");
  }
  async partCredential(session: VideoStorageSession, partNumber: number): Promise<{ url: string; expiresAt: Date; sizeBytes: number }> {
    this.validate(session, true); const sizeBytes = this.partSize(session, partNumber);
    const issuedAt = this.now().getTime();
    const expiresIn = Math.min(900, Math.floor((session.expiresAt.getTime() - issuedAt) / 1000));
    if (expiresIn < 1) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    const command = new UploadPartCommand({ Bucket: this.bucket, Key: this.key(session.sessionId, session.uploadId), UploadId: session.storageUploadId, PartNumber: partNumber, ContentLength: sizeBytes });
    const url = await this.sign(this.client, command, { expiresIn, signableHeaders: new Set(["content-length"]) });
    return { url, sizeBytes, expiresAt: new Date(issuedAt + expiresIn * 1000) };
  }
  async complete(session: VideoStorageSession): Promise<void> {
    this.validate(session, true); const parts = await this.listParts(session);
    if (parts.length !== Math.ceil(session.expectedBytes / VIDEO_PART_BYTES) || parts.some((part, index) => part.partNumber !== index + 1)) throw new Error("VIDEO_PARTS_INVALID");
    this.validate(session, true);
    await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: this.key(session.sessionId, session.uploadId), UploadId: session.storageUploadId, MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) } }), { abortSignal: AbortSignal.timeout(30_000) });
  }
  /** Abort acknowledgement is not deletion evidence. Caller retains durable cleanup work
   * and reconciles in-flight completion, remaining parts and completed object separately. */
  async abort(session: VideoStorageSession): Promise<void> {
    this.validate(session, false);
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: this.key(session.sessionId, session.uploadId), UploadId: session.storageUploadId }), { abortSignal: AbortSignal.timeout(10_000) });
  }
  private key(sessionId: string, uploadId: string): string {
    if (![sessionId, uploadId].every((id) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))) throw new Error("VIDEO_SESSION_UNAVAILABLE");
    return `video/v1/${uploadId}/${sessionId}/source.mp4`;
  }
  private validate(session: VideoStorageSession, requireActive: boolean): void {
    this.key(session.sessionId, session.uploadId);
    if (!session.storageUploadId || session.storageUploadId.length > 2048 || !Number.isInteger(session.expectedBytes) || session.expectedBytes < 1 || session.expectedBytes > 15 * 1024 * 1024 || (requireActive && session.expiresAt.getTime() <= this.now().getTime())) throw new Error("VIDEO_SESSION_UNAVAILABLE");
  }
  private partSize(session: VideoStorageSession, number: number): number {
    const count = Math.ceil(session.expectedBytes / VIDEO_PART_BYTES);
    if (!Number.isInteger(number) || number < 1 || number > count) throw new Error("VIDEO_PART_INVALID");
    return Math.min(VIDEO_PART_BYTES, session.expectedBytes - (number - 1) * VIDEO_PART_BYTES);
  }
}
