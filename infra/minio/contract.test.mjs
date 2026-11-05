import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  assertPublicReadOnlyPolicy,
  backupBuckets,
  bootstrapBuckets,
  publicReadPolicy,
  restoreBuckets,
} from "./contract.mjs";

class FakeS3Client {
  constructor() {
    this.buckets = new Map();
    this.policies = new Map();
    this.lifecycles = new Map();
    this.sent = [];
  }

  async send(command) {
    this.sent.push(command);
    const name = command.constructor.name;
    const input = command.input;

    if (name === "HeadBucketCommand") {
      if (!this.buckets.has(input.Bucket)) throw new Error("not found");
      return {};
    }
    if (name === "CreateBucketCommand") {
      this.buckets.set(input.Bucket, new Map());
      return {};
    }
    if (name === "PutBucketLifecycleConfigurationCommand") {
      this.lifecycles.set(input.Bucket, input.LifecycleConfiguration);
      return {};
    }
    if (name === "PutBucketPolicyCommand") {
      this.policies.set(input.Bucket, input.Policy);
      return {};
    }
    if (name === "DeleteBucketPolicyCommand") {
      this.policies.delete(input.Bucket);
      return {};
    }
    if (name === "GetBucketPolicyCommand") {
      if (!this.policies.has(input.Bucket)) {
        const error = new Error("No policy");
        error.name = "NoSuchBucketPolicy";
        throw error;
      }
      return { Policy: this.policies.get(input.Bucket) };
    }
    if (name === "ListObjectsV2Command") {
      const objects = [...(this.buckets.get(input.Bucket)?.entries() ?? [])].map(
        ([Key, Body]) => ({ Key, Size: Body.length }),
      );
      return { Contents: objects };
    }
    if (name === "GetObjectCommand") {
      const body = this.buckets.get(input.Bucket)?.get(input.Key);
      if (!body) throw new Error("missing object");
      return { Body: Readable.from(body) };
    }
    if (name === "PutObjectCommand") {
      const chunks = [];
      for await (const chunk of input.Body) {
        chunks.push(Buffer.from(chunk));
      }
      this.buckets.get(input.Bucket).set(input.Key, Buffer.concat(chunks));
      return {};
    }
    throw new Error(`Unexpected command: ${name}`);
  }
}

test("public policy grants anonymous read without anonymous upload", () => {
  const policy = publicReadPolicy("listing-photos");

  assert.doesNotThrow(() => assertPublicReadOnlyPolicy(policy, "listing-photos"));
  assert.throws(
    () =>
      assertPublicReadOnlyPolicy(
        {
          ...policy,
          Statement: [
            ...policy.Statement,
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:PutObject"],
              Resource: ["arn:aws:s3:::listing-photos/*"],
            },
          ],
        },
        "listing-photos",
      ),
    /s3:GetObject only/,
  );
});

test("bucket bootstrap is idempotent and reapplies the public-read policy", async () => {
  const client = new FakeS3Client();

  assert.deepEqual(await bootstrapBuckets(client, ["listing-photos"]), [
    { bucket: "listing-photos", created: true },
  ]);
  assert.deepEqual(await bootstrapBuckets(client, ["listing-photos"]), [
    { bucket: "listing-photos", created: false },
  ]);
  assertPublicReadOnlyPolicy(client.policies.get("listing-photos"), "listing-photos");
});

test("backup writes object bytes, bucket policy, and checksums", async () => {
  const client = new FakeS3Client();
  await bootstrapBuckets(client, ["listing-photos"]);
  client.buckets.get("listing-photos").set("pending/a/original.jpg", Buffer.from("image"));
  const dir = await mkdtemp(join(tmpdir(), "autotm-minio-backup-test-"));

  const manifest = await backupBuckets(client, dir, ["listing-photos"]);

  assert.equal(manifest.buckets[0].objects[0].key, "pending/a/original.jpg");
  assert.match(manifest.buckets[0].objects[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    await readFile(join(dir, "objects/listing-photos/pending/a/original.jpg"), "utf8"),
    "image",
  );
  assertPublicReadOnlyPolicy(
    await readFile(join(dir, "policies/listing-photos.json"), "utf8"),
    "listing-photos",
  );
});

test("video bootstrap removes an old public grant and backup records private access", async () => {
  const client = new FakeS3Client();
  await bootstrapBuckets(client, ["listing-videos"]);
  client.buckets.get("listing-videos").set("legacy/original.mp4", Buffer.from("video"));
  client.policies.set("listing-videos", JSON.stringify(publicReadPolicy("listing-videos")));
  const dir = await mkdtemp(join(tmpdir(), "autotm-private-video-backup-"));
  await assert.rejects(() => backupBuckets(client, dir, ["listing-videos"]), /re-bootstrap before backup/);

  await bootstrapBuckets(client, ["listing-videos"]);
  await bootstrapBuckets(client, ["listing-videos"]);
  assert.equal(client.policies.has("listing-videos"), false);
  await backupBuckets(client, dir, ["listing-videos"]);
  assert.equal(JSON.parse(await readFile(join(dir, "policies/listing-videos.json"), "utf8")), null);

  // A historical backup can restore its bytes, but never its anonymous grant.
  await writeFile(join(dir, "policies/listing-videos.json"), JSON.stringify(publicReadPolicy("listing-videos")));
  const target = new FakeS3Client();
  await restoreBuckets(target, dir);
  assert.equal(target.policies.has("listing-videos"), false);
  assert.equal(target.buckets.get("listing-videos").get("legacy/original.mp4").toString(), "video");
});

test("restore fails before writing when a backup object checksum does not match", async () => {
  const source = new FakeS3Client();
  await bootstrapBuckets(source, ["listing-photos"]);
  source.buckets.get("listing-photos").set("pending/a/original.jpg", Buffer.from("image"));
  const dir = await mkdtemp(join(tmpdir(), "autotm-minio-restore-test-"));
  await backupBuckets(source, dir, ["listing-photos"]);
  await writeFile(join(dir, "objects/listing-photos/pending/a/original.jpg"), "corrupt");

  const target = new FakeS3Client();
  await mkdir(join(dir, "unused"), { recursive: true });

  await assert.rejects(() => restoreBuckets(target, dir), /Checksum mismatch before restore/);
  assert.equal(target.buckets.get("listing-photos")?.size ?? 0, 0);
});


test("catalog anonymous reads cover published brands only", () => {
  const policy = publicReadPolicy("catalog-assets");
  assert.deepEqual(policy.Statement[0].Resource, ["arn:aws:s3:::catalog-assets/brands/*"]);
  assert.doesNotThrow(() => assertPublicReadOnlyPolicy(policy, "catalog-assets"));
  for (const resource of ["arn:aws:s3:::catalog-assets/*", "arn:aws:s3:::catalog-assets/pending/*", "*"]) {
    assert.throws(() => assertPublicReadOnlyPolicy({ ...policy, Statement: [
      ...policy.Statement,
      { Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: resource },
    ] }, "catalog-assets"), /policy/);
  }
});

test("policy validation rejects anonymous writes even on a narrower prefix", () => {
  const policy = publicReadPolicy("listing-photos");
  assert.throws(() => assertPublicReadOnlyPolicy({ ...policy, Statement: [
    ...policy.Statement,
    { Effect: "Allow", Principal: "*", Action: "s3:PutObject", Resource: "arn:aws:s3:::listing-photos/pending/*" },
  ] }, "listing-photos"), /policy/);
});

test("catalog bootstrap expires pending uploads after one day without expiring published logos", async () => {
  const client = new FakeS3Client();
  await bootstrapBuckets(client, ["catalog-assets", "listing-photos"]);
  const lifecycle = { Rules: [{ ID: "ExpirePendingBrandLogos", Status: "Enabled", Filter: { Prefix: "pending/" }, Expiration: { Days: 1 } }] };
  assert.deepEqual(client.lifecycles.get("catalog-assets"), lifecycle);
  assert.equal(client.lifecycles.has("listing-photos"), false);
  client.lifecycles.delete("catalog-assets");
  await bootstrapBuckets(client, ["catalog-assets"]);
  assert.deepEqual(client.lifecycles.get("catalog-assets"), lifecycle);
});

test("backup and restore accept the scoped catalog policy and restore pending expiry", async () => {
  const source = new FakeS3Client();
  await bootstrapBuckets(source, ["catalog-assets"]);
  source.policies.set("catalog-assets", JSON.stringify({ Version: "2012-10-17", Statement: [{
    Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::catalog-assets/brands/*",
  }] }));
  source.buckets.get("catalog-assets").set("brands/toyota/imp-0123456789ab/logo.png", Buffer.from("logo"));
  const dir = await mkdtemp(join(tmpdir(), "autotm-454-backup-"));
  const manifest = await backupBuckets(source, dir, ["catalog-assets"]);
  assert.equal(manifest.buckets[0].objects.length, 1);
  const target = new FakeS3Client();
  await restoreBuckets(target, dir);
  assert.equal(target.buckets.get("catalog-assets").get("brands/toyota/imp-0123456789ab/logo.png").toString(), "logo");
  assertPublicReadOnlyPolicy(target.policies.get("catalog-assets"), "catalog-assets");
  assert.equal(target.lifecycles.get("catalog-assets").Rules[0].Expiration.Days, 1);
});
