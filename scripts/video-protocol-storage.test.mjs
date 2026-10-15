import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const endpoint = process.env.MINIO_ENDPOINT ?? "";
const hosted = process.env.GITHUB_ACTIONS === "true" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint);

test("owned S3 multipart confirms resume, signed credential renewal, idempotent object reconciliation and abort absence", { skip: !hosted }, async () => {
  const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
  const { S3Client, CreateBucketCommand, DeleteBucketCommand, CreateMultipartUploadCommand, UploadPartCommand,
    ListPartsCommand, CompleteMultipartUploadCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand,
    AbortMultipartUploadCommand, ListMultipartUploadsCommand, GetBucketVersioningCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const { VideoUploadProof, PART_BYTES, SESSION_MS } = await import("./video-protocol-proof.mjs");
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin", secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin" } });
  const Bucket = `video-proof-${randomUUID()}`;
  const Key = "video/v1/session/generation/source.mp4";
  let UploadId;
  try {
    await s3.send(new CreateBucketCommand({ Bucket }));
    assert.equal((await s3.send(new GetBucketVersioningCommand({ Bucket }))).Status, undefined);
    UploadId = (await s3.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: "video/mp4" }))).UploadId;
    const source = Buffer.alloc(PART_BYTES + 17, 42);
    const put = async (number, bytes) => {
      const url = await getSignedUrl(s3, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber: number, ContentLength: bytes.length }), { expiresIn: 60 });
      const response = await fetch(url, { method: "PUT", body: bytes });
      assert.equal(response.status, 200);
    };
    await put(1, source.subarray(0, PART_BYTES));
    const absent = (error) => error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchUpload";
    const store = {
      async listParts() {
        try { const value = await s3.send(new ListPartsCommand({ Bucket, Key, UploadId }));
          return (value.Parts ?? []).map((part) => ({ number: part.PartNumber, size: part.Size, etag: part.ETag }));
        } catch (error) { if (absent(error)) return []; throw error; }
      },
      async head() { try { const value = await s3.send(new HeadObjectCommand({ Bucket, Key })); return { size: value.ContentLength }; }
        catch (error) { if (absent(error)) return null; throw error; } },
      async complete(parts) { await s3.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId,
        MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.number, ETag: part.etag })) } })); return this.head(); },
      async abort() { try { await s3.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })); } catch (error) { if (!absent(error)) throw error; } },
      async delete() { await s3.send(new DeleteObjectCommand({ Bucket, Key })); },
    };
    const record = { owner: "fixture-owner", state: "UPLOADING", bytes: source.length, expiresAt: Date.now() + SESSION_MS, cancelled: false };
    const proof = new VideoUploadProof(record, store);
    assert.equal((await proof.recover("fixture-owner")).nextPart, 2);
    const expired = await getSignedUrl(s3, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber: 2, ContentLength: 17 }),
      { expiresIn: 1, signingDate: new Date(Date.now() - 60_000) });
    assert.equal((await fetch(expired, { method: "PUT", body: source.subarray(PART_BYTES) })).status, 403);
    assert.equal((await proof.recover("fixture-owner")).nextPart, 2);
    await put(2, source.subarray(PART_BYTES));
    assert.equal((await proof.complete("fixture-owner")).state, "PROCESSING");
    assert.equal((await new VideoUploadProof({ ...record, state: "COMPLETING" }, store).complete("fixture-owner")).state, "PROCESSING");
    assert.ok([403, 404].includes((await fetch(`${endpoint}/${Bucket}/${Key}`)).status));
    const bytes = await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body.transformToByteArray();
    assert.deepEqual(Buffer.from(bytes), source);
    assert.equal((await proof.cancel("fixture-owner")).state, "DELETED");
    assert.equal(await store.head(), null);
    // Separate unfinished multipart proves actual abort/list absence, not just completed-object deletion.
    UploadId = (await s3.send(new CreateMultipartUploadCommand({ Bucket, Key }))).UploadId;
    await put(1, source.subarray(0, PART_BYTES));
    await store.abort();
    assert.deepEqual(await store.listParts(), []);
    assert.deepEqual((await s3.send(new ListMultipartUploadsCommand({ Bucket }))).Uploads ?? [], []);
  } finally {
    if (UploadId) { try { await s3.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })); } catch { /* Already completed/aborted. */ } }
    await s3.send(new DeleteObjectCommand({ Bucket, Key }));
    await s3.send(new DeleteBucketCommand({ Bucket }));
    s3.destroy();
  }
});
