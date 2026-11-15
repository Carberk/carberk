import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import {
  DeleteObjectCommand, GetBucketVersioningCommand, HeadObjectCommand,
  PutObjectCommand, type S3Client,
} from "@aws-sdk/client-s3";

const REQUEST_TIMEOUT_MS = 10_000;

export function isMissingObject(error: unknown): boolean {
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return failure.name === "NotFound" || failure.name === "NoSuchKey" ||
    failure.$metadata?.httpStatusCode === 404;
}

function etag(value: string | undefined): string {
  if (!value) throw new Error("Conditional storage returned no ETag");
  return value;
}

/** Verifies the provider, then exposes only conditional writes to initialized keys. */
export class ConditionalImageStorage {
  private capability: Promise<void> | undefined;
  private emptyETag: string | undefined;

  constructor(private readonly s3: S3Client, private readonly bucket = "listing-photos") {}

  async assertSupported(): Promise<void> {
    const versioning = await this.s3.send(new GetBucketVersioningCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (versioning.Status !== undefined) throw new Error("Conditional storage requires an unversioned bucket");
    this.capability ??= this.probe().catch((error: unknown) => {
      this.capability = undefined;
      throw error;
    });
    await this.capability;
  }

  async initialize(keys: string[]): Promise<string> {
    await this.assertSupported();
    let originalETag: string | undefined;
    // Never retry by creating a missing issued object. This method is issuance only.
    for (const key of keys) {
      const result = await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: Buffer.alloc(0), IfNoneMatch: "*", CacheControl: "no-store",
      }), { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (key === keys[0]) originalETag = etag(result.ETag);
    }
    return etag(originalETag);
  }

  async write(key: string, body: Buffer, contentType: string, expectedETag?: string): Promise<void> {
    const current = expectedETag ?? etag((await this.s3.send(new HeadObjectCommand({
      Bucket: this.bucket, Key: key,
    }), { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })).ETag);
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, IfMatch: current, CacheControl: "no-store",
    }), { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }

  /** Reuse only untouched issuance placeholders, never the current ETag of uploaded bytes. */
  async inspectEmpty(keys: string[]): Promise<string> {
    await this.assertSupported();
    const heads = await Promise.all(keys.map(async Key => {
      try {
        return await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key }), {
          abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    }));
    if (!this.emptyETag || heads.some(head => !head || head.ContentLength !== 0 || head.ETag !== this.emptyETag ||
      head.CacheControl !== "no-store" || (head.ContentType !== undefined && head.ContentType !== "application/octet-stream") ||
      Object.keys(head.Metadata ?? {}).length > 0)) {
      throw new BadRequestException({ code: "UPLOAD_NOT_AVAILABLE", message: "Upload is no longer available" });
    }
    return this.emptyETag;
  }

  private async probe(): Promise<void> {
    const key = `pending/${randomUUID()}/.conditional-probe`;
    const input = { Bucket: this.bucket, Key: key };
    const options = () => ({ abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    try {
      const initial = await this.s3.send(new PutObjectCommand({
        ...input, Body: Buffer.alloc(0), IfNoneMatch: "*",
      }), options());
      this.emptyETag = etag(initial.ETag);
      await this.requireRefusal(new PutObjectCommand({
        ...input, Body: Buffer.from("wrong"), IfMatch: '"not-the-current-etag"',
      }));
      const changed = await this.s3.send(new PutObjectCommand({
        ...input, Body: Buffer.from("probe"), IfMatch: etag(initial.ETag),
      }), options());
      await this.s3.send(new DeleteObjectCommand(input), options());
      await this.requireRefusal(new PutObjectCommand({
        ...input, Body: Buffer.from("late"), IfMatch: etag(changed.ETag),
      }));
      try {
        await this.s3.send(new HeadObjectCommand(input), options());
      } catch (error) {
        if (isMissingObject(error)) return;
        throw error;
      }
      throw new Error("Conditional storage recreated a deleted key");
    } finally {
      await this.s3.send(new DeleteObjectCommand(input), options());
    }
  }

  private async requireRefusal(command: PutObjectCommand): Promise<void> {
    try {
      await this.s3.send(command, { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412 || status === 409 || status === 404) return;
      throw error;
    }
    throw new Error("Storage does not enforce conditional writes");
  }
}
