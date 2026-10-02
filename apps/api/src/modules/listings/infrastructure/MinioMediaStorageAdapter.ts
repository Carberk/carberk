import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StoredObjectInfo } from "../domain/MediaUpload";
import type { MediaObjectInspector } from "../domain/ports/MediaObjectInspector";
import type { MediaStoragePort } from "../domain/ports/MediaStoragePort";
import type { Env } from "../../../env.schema";

@Injectable()
export class MinioMediaStorageAdapter implements MediaStoragePort, MediaObjectInspector {
  private readonly s3: S3Client;
  private readonly signingS3: S3Client;
  private readonly publicUrl: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {
    const minioEndpoint = this.config.get("MINIO_ENDPOINT", { infer: true });
    const minioPublicUrl = this.config.get("MINIO_PUBLIC_URL", { infer: true });
    const accessKey = this.config.get("MINIO_ACCESS_KEY", { infer: true });
    const secretKey = this.config.get("MINIO_SECRET_KEY", { infer: true });
    const region = this.config.get("MINIO_REGION", { infer: true });

    this.publicUrl = minioPublicUrl.replace(/\/$/, "");
    this.s3 = new S3Client({
      endpoint: minioEndpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
    this.signingS3 = new S3Client({
      endpoint: this.publicUrl,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
  }

  async presignUpload(data: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expirySeconds?: number;
  }): Promise<{ url: string; key: string }> {
    const bucket = this.inferBucket(data.key);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: data.key,
      ContentType: data.contentType,
      ContentLength: data.sizeBytes,
    });

    const url = await getSignedUrl(this.signingS3, command, {
      expiresIn: data.expirySeconds ?? 600,
    });

    return { url, key: data.key };
  }

  resolvePublicUrl(key: string): string {
    const bucket = this.inferBucket(key);
    // Keys that already include the bucket prefix (e.g. "chat-attachments/...")
    // must not get the bucket prepended again; otherwise Caddy would serve
    // /<bucket>/<bucket>/<key>. Listing keys omit the bucket prefix, so the
    // bucket is prepended to form the path-style S3 URL.
    if (key.startsWith(`${bucket}/`)) {
      return `${this.publicUrl}/${key}`;
    }
    return `${this.publicUrl}/${bucket}/${key}`;
  }

  async inspect(key: string): Promise<StoredObjectInfo | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.inferBucket(key), Key: key }),
      );
      return {
        contentType: head.ContentType ?? null,
        sizeBytes: head.ContentLength ?? 0,
      };
    } catch (err) {
      const failure = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        failure.name === "NotFound" ||
        failure.name === "NoSuchKey" ||
        failure.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const bucket = this.inferBucket(key);

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  private inferBucket(key: string): string {
    if (key.startsWith("chat-attachments/")) {
      return "chat-attachments";
    }
    return key.includes(".mp4") || key.includes(".mov")
      ? "listing-videos"
      : "listing-photos";
  }

}
