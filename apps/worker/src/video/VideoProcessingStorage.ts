import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";

export interface StoredVideoObject {
  key: string;
  body: Buffer;
  contentType: string | null;
}

export interface VideoProcessingStorage {
  readonly bucket: string;
  get(key: string): Promise<StoredVideoObject>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  head(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null>;
  list(prefix: string): Promise<string[]>;
}

export const VIDEO_PROCESSING_STORAGE = Symbol("VideoProcessingStorage");

export class S3VideoProcessingStorage implements VideoProcessingStorage {
  constructor(
    private readonly s3: S3Client,
    readonly bucket: string,
  ) {}

  async get(key: string): Promise<StoredVideoObject> {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error("Stored video has no body");
    return {
      key,
      body: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType ?? null,
    };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async head(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
    try {
      const result = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (failure.name === "NotFound" || failure.name === "NoSuchKey" || failure.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      keys.push(...(page.Contents ?? []).flatMap((entry) => entry.Key ? [entry.Key] : []));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }
}
