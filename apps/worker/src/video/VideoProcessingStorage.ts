import type { Readable } from "node:stream";

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandOutput,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export interface StoredVideoObject {
  key: string;
  body: Buffer;
  contentType: string | null;
  etag: string | null;
}

export interface VideoProcessingStorage {
  readonly bucket: string;
  get(key: string): Promise<StoredVideoObject>;
  /** Reserve a new output key. A successful reservation is the write fence. */
  initialize(key: string, contentType: string): Promise<string>;
  /** Replace only the exact reservation returned by initialize. */
  put(key: string, body: Buffer, contentType: string, expectedETag?: string): Promise<void>;
  head(key: string): Promise<{ sizeBytes: number; contentType: string | null; etag: string | null } | null>;
  list(prefix: string): Promise<string[]>;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_LIST_KEYS = 10_000;

export const VIDEO_PROCESSING_STORAGE = Symbol("VideoProcessingStorage");

export class S3VideoProcessingStorage implements VideoProcessingStorage {
  constructor(
    private readonly s3: S3Client,
    readonly bucket: string,
  ) {}

  private async send<Output>(command: object): Promise<Output> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.s3.send(command as Parameters<S3Client["send"]>[0], { abortSignal: controller.signal }) as Output;
    } finally {
      clearTimeout(timer);
    }
  }

  async get(key: string): Promise<StoredVideoObject> {
    const controller = new AbortController();
    let body: Readable | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Stored video read timed out"));
        controller.abort();
        body?.destroy();
      }, REQUEST_TIMEOUT_MS);
    });
    const read = async (): Promise<StoredVideoObject> => {
      const result: GetObjectCommandOutput = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: controller.signal });
      body = result.Body as Readable | undefined;
      try {
        controller.signal.throwIfAborted();
        if (!body) throw new Error("Stored video has no body");
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of body as AsyncIterable<Uint8Array>) {
          total += chunk.byteLength;
          if (total > MAX_SOURCE_BYTES) throw new Error("Stored video exceeds maximum body size");
          chunks.push(Buffer.from(chunk));
        }
        return { key, body: Buffer.concat(chunks), contentType: result.ContentType ?? null, etag: result.ETag ?? null };
      } finally {
        body?.destroy();
      }
    };
    try {
      return await Promise.race([read(), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async initialize(key: string, contentType: string): Promise<string> {
    const result = await this.send<PutObjectCommandOutput>(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: Buffer.alloc(0), ContentType: contentType, IfNoneMatch: "*" }));
    if (!result.ETag) throw new Error("Storage did not return an output write fence");
    return result.ETag;
  }

  async put(key: string, body: Buffer, contentType: string, expectedETag?: string): Promise<void> {
    if (body.byteLength > MAX_SOURCE_BYTES) throw new Error("Stored video output exceeds maximum body size");
    const input = { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ...(expectedETag ? { IfMatch: expectedETag } : { IfNoneMatch: "*" }) };
    await this.send<PutObjectCommandOutput>(new PutObjectCommand(input));
  }

  async head(key: string): Promise<{ sizeBytes: number; contentType: string | null; etag: string | null } | null> {
    try {
      const result = await this.send<HeadObjectCommandOutput>(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? null, etag: result.ETag ?? null };
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
      const page = await this.send<ListObjectsV2CommandOutput>(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: Math.min(1000, MAX_LIST_KEYS - keys.length) }));
      keys.push(...(page.Contents ?? []).flatMap((entry) => entry.Key ? [entry.Key] : []));
      if (keys.length > MAX_LIST_KEYS) throw new Error("Too many processing objects");
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }
}
