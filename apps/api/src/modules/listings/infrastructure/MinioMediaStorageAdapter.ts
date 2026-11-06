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
import { imageUploadObjectKeys } from "../domain/imageUploadObjectKeys";
import { ConditionalImageStorage } from "./ConditionalImageStorage";

@Injectable()
export class MinioMediaStorageAdapter implements MediaStoragePort, MediaObjectInspector {
  private readonly s3: S3Client;
  private readonly signingS3: S3Client;
  private conditionalSigner: S3Client | undefined;
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
    writeProtocol?: "conditional-v1";
  }): Promise<{ url: string; key: string; headers?: Record<string, string>; objectKeys?: string[] }> {
    const bucket = this.inferBucket(data.key);
    if (bucket === "listing-videos" ||
      (bucket !== "chat-attachments" && data.contentType.startsWith("video/"))) {
      throw new Error("Listing videos require multipart sessions");
    }
    const objectKeys = data.writeProtocol ? imageUploadObjectKeys(data.key) : undefined;
    const match = objectKeys ? await new ConditionalImageStorage(this.s3).initialize(objectKeys) : undefined;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: data.key,
      ContentType: data.contentType,
      ContentLength: data.sizeBytes,
      ...(match ? { IfMatch: match, CacheControl: "no-store" } : {}),
    });

    // The caller supplies the body later. Do not sign a checksum of an empty body.
    // Keep the installed clients' legacy signer unchanged.
    if (match) this.conditionalSigner ??= new S3Client({
      endpoint: this.publicUrl, region: this.config.get("MINIO_REGION", { infer: true }),
      credentials: {
        accessKeyId: this.config.get("MINIO_ACCESS_KEY", { infer: true }),
        secretAccessKey: this.config.get("MINIO_SECRET_KEY", { infer: true }),
      },
      forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
    });
    const signer = match ? this.conditionalSigner : this.signingS3;
    if (!signer) throw new Error("Conditional signer was not initialized");
    const url = await getSignedUrl(signer, command, {
      expiresIn: data.expirySeconds ?? 600,
      ...(match ? { signableHeaders: new Set(["if-match", "cache-control"]) } : {}),
    });

    return { url, key: data.key, ...(match && objectKeys ? {
      headers: { "if-match": match, "content-type": data.contentType, "cache-control": "no-store" }, objectKeys,
    } : {}) };
  }

  resolvePublicUrl(key: string): string {
    if (/^https?:\/\//i.test(key)) return key;
    const bucket = this.inferBucket(key);
    // Match presignUpload: Key retains its namespace inside the bucket.
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
