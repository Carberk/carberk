import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";

import type { Env } from "../../../env.schema";
import { BucketVideoStorage } from "./BucketVideoStorage";

// Real-storage gate for the Listing video Bucket contract (#1041). Runs on
// the disposable CI MinIO (GITHUB_ACTIONS with a loopback endpoint) or when
// VIDEO_STORAGE_E2E=1 points at disposable storage (local MinIO or the
// approved staging Bucket with a unique test prefix). Every object and
// multipart upload created here is removed and verified gone.
const minioHost = (() => {
  try {
    return new URL(process.env["MINIO_ENDPOINT"] ?? "").hostname;
  } catch {
    return "";
  }
})();
const enabled =
  process.env["VIDEO_STORAGE_E2E"] === "1" ||
  (process.env["GITHUB_ACTIONS"] === "true" &&
    ["localhost", "127.0.0.1"].includes(minioHost));

describe.skipIf(!enabled)("BucketVideoStorage on real storage (#1041)", () => {
  const storage = new BucketVideoStorage(
    new ConfigService({
      LISTING_VIDEO_BUCKET_ENDPOINT: process.env["LISTING_VIDEO_BUCKET_ENDPOINT"] ?? process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
      LISTING_VIDEO_BUCKET_NAME: process.env["LISTING_VIDEO_BUCKET_NAME"] ?? "",
      LISTING_VIDEO_BUCKET_ACCESS_KEY_ID: process.env["LISTING_VIDEO_BUCKET_ACCESS_KEY_ID"] ?? process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY: process.env["LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"] ?? process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
      LISTING_VIDEO_BUCKET_REGION: process.env["LISTING_VIDEO_BUCKET_REGION"] ?? "us-east-1",
      MINIO_ENDPOINT: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
      MINIO_PUBLIC_URL: process.env["MINIO_PUBLIC_URL"] ?? process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
      MINIO_ACCESS_KEY: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      MINIO_SECRET_KEY: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
      MINIO_REGION: "us-east-1",
    }) as ConfigService<Env, true>,
  );
  const prefix = `video-upload-e2e/${randomUUID()}/`;
  const ownedKeys = new Set<string>();
  const key = `${prefix}source.mp4`;

  const raw = new S3Client({
    endpoint: process.env["LISTING_VIDEO_BUCKET_ENDPOINT"] ?? process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env["LISTING_VIDEO_BUCKET_ACCESS_KEY_ID"] ?? process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      secretAccessKey: process.env["LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY"] ?? process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    },
  });

  afterAll(async () => {
    for (const owned of ownedKeys) {
      await raw.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: owned })).catch(() => undefined);
    }
    const uploads = await raw.send(
      new ListMultipartUploadsCommand({ Bucket: storage.bucket, Prefix: prefix }),
    ).catch(() => ({ Uploads: [] }));
    for (const upload of uploads.Uploads ?? []) {
      await storage.abortMultipart({ key: upload.Key!, uploadId: upload.UploadId! }).catch(() => undefined);
    }
    const remaining = await raw.send(
      new ListObjectsV2Command({ Bucket: storage.bucket, Prefix: prefix }),
    ).catch(() => ({ Contents: [] }));
    expect(remaining.Contents ?? []).toEqual([]);
    raw.destroy();
  });

  it("uploads parts through presigned URLs, lists them server-side and completes once", async () => {
    ownedKeys.add(key);
    const { uploadId } = await storage.createMultipart({ key, contentType: "video/mp4" });
    const part1 = Buffer.alloc(5 * 1024 * 1024, 7);
    const part2 = Buffer.alloc(1024 * 1024, 9);
    for (const [partNumber, body] of [[1, part1], [2, part2]] as const) {
      const signed = await storage.presignPart({ key, uploadId, partNumber, expiresInSeconds: 600 });
      const res = await fetch(signed.url, { method: "PUT", body });
      expect(res.ok).toBe(true);
      await res.arrayBuffer().catch(() => undefined);
    }
    const listed = await storage.listParts({ key, uploadId });
    expect(listed.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(listed.every((p) => p.etag.length > 0)).toBe(true);

    await storage.completeMultipart({ key, uploadId, parts: listed });
    await expect(storage.listParts({ key, uploadId })).rejects.toMatchObject({
      name: expect.stringMatching(/NoSuchUpload|NotFound/),
    });
    expect(await storage.headObject(key)).toMatchObject({
      sizeBytes: part1.length + part2.length,
    });
  });

  it("aborting a second session leaves no multipart upload or object", async () => {
    const abortKey = `${prefix}aborted.mp4`;
    ownedKeys.add(abortKey);
    const { uploadId } = await storage.createMultipart({ key: abortKey, contentType: "video/mp4" });
    const signed = await storage.presignPart({ key: abortKey, uploadId, partNumber: 1, expiresInSeconds: 600 });
    const res = await fetch(signed.url, { method: "PUT", body: Buffer.alloc(1024, 3) });
    expect(res.ok).toBe(true);
    await res.arrayBuffer().catch(() => undefined);
    await storage.abortMultipart({ key: abortKey, uploadId });
    await expect(storage.listParts({ key: abortKey, uploadId })).rejects.toBeTruthy();
    expect(await storage.headObject(abortKey)).toBeNull();
  });
});
