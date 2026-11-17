import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { brandLogoCleanupTarget } from "../domain/BrandLogo";
import type { BrandLogoStorage } from "../domain/ports/BrandLogoStorage";
import type { Env } from "../../../env.schema";


export const CATALOG_ASSETS_BUCKET = "catalog-assets";


const DELETE_BATCH_SIZE = 1_000;

@Injectable()
export class MinioBrandLogoStorage implements BrandLogoStorage {
  private readonly s3: S3Client;
  private readonly signingS3: S3Client;
  private readonly publicBaseUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.publicBaseUrl = config.get("MINIO_PUBLIC_URL", { infer: true }).replace(/\/$/, "");
    const region = config.get("MINIO_REGION", { infer: true });
    const credentials = {
      accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }),
      secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }),
    };
    this.s3 = new S3Client({
      endpoint: config.get("MINIO_ENDPOINT", { infer: true }),
      region,
      credentials,
      forcePathStyle: true,
    });

    this.signingS3 = new S3Client({
      endpoint: this.publicBaseUrl,
      region,
      credentials,
      forcePathStyle: true,
    });
  }

  async presignUpload(
    key: string,
    contentType: string,
    expirySeconds: number,
    sizeBytes: number,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: CATALOG_ASSETS_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,

      ContentDisposition: "attachment",
    });
    const url = await getSignedUrl(this.signingS3, command, {
      expiresIn: expirySeconds,
      unhoistableHeaders: new Set(["content-disposition"]),
    });
    return {
      url,
      headers: { "Content-Type": contentType, "Content-Disposition": "attachment" },
    };
  }

  async get(
    key: string,
    maxBytes: number,
  ): Promise<{ bytes: Uint8Array; contentType: string } | "too-large" | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: CATALOG_ASSETS_BUCKET, Key: key }),
      );
      if ((head.ContentLength ?? 0) > maxBytes) return "too-large";
      const object = await this.s3.send(
        new GetObjectCommand({ Bucket: CATALOG_ASSETS_BUCKET, Key: key }),
      );
      if (!object.Body) return null;
      const bytes = await object.Body.transformToByteArray();
      if (bytes.byteLength > maxBytes) return "too-large";
      return { bytes, contentType: object.ContentType ?? "" };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: CATALOG_ASSETS_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,

        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: CATALOG_ASSETS_BUCKET, Key: key }));
  }

  async deleteLogoVersion(key: string): Promise<void> {
    const target = brandLogoCleanupTarget(key);
    if (target.kind === "object") {
      await this.delete(target.key);
      return;
    }

    const keys = await this.listKeys(target.prefix);
    const failures: string[] = [];
    for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
      const batch = keys.slice(start, start + DELETE_BATCH_SIZE);
      const response = await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: CATALOG_ASSETS_BUCKET,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      for (const error of response.Errors ?? []) {
        failures.push(
          `${error.Key ?? "unknown key"}: ${error.Code ?? "unknown error"}: ${error.Message ?? "no message"}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(`Failed to delete ${failures.length} object(s) under ${target.prefix}: ${failures.join("; ")}`);
    }
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: CATALOG_ASSETS_BUCKET,
          Prefix: prefix,
          ...(token === undefined ? {} : { ContinuationToken: token }),
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }
      token = page.NextContinuationToken;
    } while (token);
    return keys;
  }

  publicUrl(key: string): string {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    return `${this.publicBaseUrl}/${CATALOG_ASSETS_BUCKET}/${encodedKey}`;
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}
