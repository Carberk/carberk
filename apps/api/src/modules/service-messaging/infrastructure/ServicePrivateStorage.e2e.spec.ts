import { randomUUID } from "node:crypto";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { expect, it } from "vitest";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { MinioServicePrivateStore } from "./MinioServicePrivateStore";

const suite = defineE2eSuite("service-private-storage");
it("keeps known locators private, immutable and bounded on actual disposable object storage", async () => {
 const endpoint = process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000";
 const s3 = new S3Client({ endpoint, region: process.env["MINIO_REGION"] ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
 try { await s3.send(new CreateBucketCommand({ Bucket: "service-private" })); } catch (error) { if (!(error instanceof Error) || !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)) throw error; }
 const store = new MinioServicePrivateStore(new ConfigService(process.env));
 const key = `service-private/${suite.id("conversation")}/${randomUUID()}/synthetic`;
 const bytes = Buffer.from("Synthetic private fixture only");
 try {
  await store.putImmutable(key, bytes, "image/jpeg");
  expect(Buffer.from(await store.get(key, bytes.length))).toEqual(bytes);
  await expect(store.putImmutable(key, bytes, "image/jpeg")).resolves.toBeUndefined();
  await expect(store.putImmutable(key, Buffer.from("replacement"), "image/jpeg")).rejects.toBeDefined();
  expect(Buffer.from(await store.get(key, bytes.length))).toEqual(bytes);
  await expect(store.get(key, bytes.length - 1)).rejects.toBeDefined();
  const anonymous = await fetch(`${endpoint}/service-private/${key}`);
  expect([401, 403]).toContain(anonymous.status);
 } finally { await store.remove(key); s3.destroy(); }
});
