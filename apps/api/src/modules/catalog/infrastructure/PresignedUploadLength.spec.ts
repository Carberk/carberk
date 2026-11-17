import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { Env } from "../../../env.schema";
import { MinioMediaStorageAdapter } from "../../listings/infrastructure/MinioMediaStorageAdapter";
import { MinioBrandLogoStorage } from "./MinioBrandLogoStorage";

const config = new ConfigService({
  MINIO_ENDPOINT: "http://127.0.0.1:9000",
  MINIO_PUBLIC_URL: "http://127.0.0.1:9000",
  MINIO_REGION: "us-east-1",
  MINIO_ACCESS_KEY: "minioadmin",
  MINIO_SECRET_KEY: "minioadmin",
}) as ConfigService<Env, true>;

describe("presigned PUT length enforcement", () => {
  it("binds the declared brand logo length in the actual SDK signature", async () => {
    const storage = new MinioBrandLogoStorage(config);
    const result = await storage.presignUpload("pending/brands/toyota/test", "image/png", 600, 4);
    expect(new URL(result.url).searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("content-length");
  });

  it("binds listing media length in the actual SDK signature", async () => {
    const storage = new MinioMediaStorageAdapter(config);
    const result = await storage.presignUpload({ key: "pending/test/original.jpg", contentType: "image/jpeg", sizeBytes: 4 });
    expect(new URL(result.url).searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("content-length");
  });
});



const liveEndpoint = process.env["AUTOTM_454_MINIO_ENDPOINT"]
  ?? (process.env["GITHUB_ACTIONS"] === "true" ? process.env["MINIO_ENDPOINT"] : undefined);

it.skipIf(!liveEndpoint)("isolated MinIO accepts exact lengths and rejects changed lengths for both adapters", async () => {
  const endpoint = liveEndpoint!;
  const config = new ConfigService({ MINIO_ENDPOINT: endpoint, MINIO_PUBLIC_URL: endpoint,
    MINIO_REGION: "us-east-1", MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin" }) as ConfigService<Env, true>;
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  const logo = new MinioBrandLogoStorage(config);
  const media = new MinioMediaStorageAdapter(config);
  for (const bucket of ["catalog-assets", "listing-photos"]) {
    try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); }
    catch (error) { if ((error as { name: string }).name !== "BucketAlreadyOwnedByYou") throw error; }
  }
  try {
    for (const kind of ["logo", "media"] as const) {
      const key = `pending/length-${kind}-${Date.now()}`;
      const result = kind === "logo"
        ? await logo.presignUpload(key, "image/png", 600, 4)
        : await media.presignUpload({ key, contentType: "image/jpeg", sizeBytes: 4 });
      const headers = "headers" in result ? result.headers : { "Content-Type": "image/jpeg" };
      const accepted = await fetch(result.url, { method: "PUT", headers, body: new Uint8Array(4) });
      expect(accepted.status).toBe(200);
      const rejected = await fetch(result.url, { method: "PUT", headers, body: new Uint8Array(5) });
      expect(rejected.status).toBe(403);
      expect(await rejected.text()).toContain("SignatureDoesNotMatch");
      const bucket = kind === "logo" ? "catalog-assets" : "listing-photos";
      const stored = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      expect(stored.ContentLength).toBe(4);
      expect(await stored.Body!.transformToByteArray()).toEqual(new Uint8Array(4));
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  } finally { s3.destroy(); }
});
