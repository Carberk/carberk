import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AbortMultipartUploadCommand,
  GetBucketVersioningCommand,
  ListObjectsV2Command,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { Env } from "../../../env.schema";
import type {
  ListedVideoPart,
  VideoStoragePort,
  VideoStoredObject,
} from "../domain/ports/VideoStoragePort";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Railway Bucket (or local MinIO fallback) for Listing video sources.
 * Dedicated LISTING_VIDEO_BUCKET_* settings win; otherwise the local
 * MinIO `listing-videos` bucket keeps development and tests on one stack.
 */
@Injectable()
export class BucketVideoStorage implements VideoStoragePort {
  readonly bucket: string;
  private readonly s3: S3Client;
  private readonly signingS3: S3Client;
  private readonly fallback: boolean;
  private bucketReady: Promise<void> | undefined;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const endpoint = config.get("LISTING_VIDEO_BUCKET_ENDPOINT", { infer: true });
    const dedicatedName = config.get("LISTING_VIDEO_BUCKET_NAME", { infer: true });
    const dedicatedKey = config.get("LISTING_VIDEO_BUCKET_ACCESS_KEY_ID", { infer: true });
    const dedicatedSecret = config.get("LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY", { infer: true });
    this.fallback = !(endpoint && dedicatedName && dedicatedKey && dedicatedSecret);
    this.bucket = this.fallback ? "listing-videos" : dedicatedName;
    const resolvedEndpoint = this.fallback
      ? config.get("MINIO_ENDPOINT", { infer: true })
      : endpoint;
    const accessKeyId = this.fallback
      ? config.get("MINIO_ACCESS_KEY", { infer: true })
      : dedicatedKey;
    const secretAccessKey = this.fallback
      ? config.get("MINIO_SECRET_KEY", { infer: true })
      : dedicatedSecret;
    const region = this.fallback
      ? config.get("MINIO_REGION", { infer: true })
      : config.get("LISTING_VIDEO_BUCKET_REGION", { infer: true });
    const base = {
      endpoint: resolvedEndpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    };
    this.s3 = new S3Client(base);
    this.signingS3 = new S3Client({
      ...base,
      endpoint: this.fallback
        ? config.get("MINIO_PUBLIC_URL", { infer: true })
        : resolvedEndpoint,
    });
  }

  private async ensureBucket(): Promise<void> {
    if (!this.fallback) return;
    this.bucketReady ??= (async () => {
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }), {
          abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }), {
          abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }).catch(() => undefined);
      }
    })();
    await this.bucketReady;
  }

  async createMultipart(input: { key: string; contentType: string }): Promise<{ uploadId: string }> {
    await this.ensureBucket();
    const created = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
      { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!created.UploadId) throw new Error("Bucket returned no multipart upload id");
    return { uploadId: created.UploadId };
  }

  async presignPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
  }): Promise<{ url: string }> {
    const url = await getSignedUrl(
      this.signingS3,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: input.expiresInSeconds },
    );
    return { url };
  }

  async listParts(input: { key: string; uploadId: string }): Promise<ListedVideoPart[]> {
    const parts: ListedVideoPart[] = [];
    let marker: string | undefined;
    for (;;) {
      const page = await this.s3.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumberMarker: marker,
        }),
        { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      for (const part of page.Parts ?? []) {
        if (part.PartNumber === undefined || !part.ETag) {
          throw new Error("Bucket listed a part without number or ETag");
        }
        parts.push({ partNumber: part.PartNumber, sizeBytes: part.Size ?? 0, etag: part.ETag });
      }
      if (!page.IsTruncated || page.NextPartNumberMarker === undefined) break;
      marker = page.NextPartNumberMarker;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(input: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }): Promise<void> {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
      { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
  }

  async abortMultipart(input: { key: string; uploadId: string }): Promise<void> {
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
      }),
      { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
  }

  async headObject(key: string): Promise<VideoStoredObject | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
    } catch (err) {
      const failure = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (failure.name === "NotFound" || failure.name === "NoSuchKey" || failure.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async assertUnversioned(): Promise<void> {
    const versioning = await this.s3.send(new GetBucketVersioningCommand({ Bucket: this.bucket }), { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (versioning.Status) throw new Error("Video cleanup requires unversioned storage");
  }

  async listObjects(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }), { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      keys.push(...(page.Contents ?? []).flatMap((entry) => entry.Key ? [entry.Key] : []));
      if (keys.length > 10_000) throw new Error("Too many video cleanup objects");
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) throw new Error("Incomplete video object list");
    } while (token);
    return keys;
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
  }
}
