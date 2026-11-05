import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, it } from "vitest";
import { CreateBucketCommand, GetObjectCommand, PutBucketPolicyCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../../..");
let minio: StartedTestContainer;
let s3: S3Client;
let endpoint: string;
let directory: string;

async function cli(script: string, ...args: string[]) {
  await run(process.execPath, [join(root, "infra/minio", `${script}.mjs`), ...args], {
    cwd: root,
    env: { ...process.env, MINIO_ENDPOINT: endpoint, MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin" },
  });
}

function legacyVideoPolicy() {
  return JSON.stringify({ Version: "2012-10-17", Statement: [{
    Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::listing-videos/*",
  }] });
}

beforeAll(async () => {
  minio = await new GenericContainer("cgr.dev/chainguard/minio@sha256:8d5a0265f0e18fb3b29f95598147f1cc2a86b782181668bad176b0e90cce9569")
    .withUser("0:0").withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
    .withCommand(["server", "/data"]).withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000)).start();
  endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  directory = await mkdtemp(join(tmpdir(), "carberk-video-hold-"));
}, 60_000);

afterAll(async () => {
  s3?.destroy();
  await minio?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("revokes old anonymous video URLs and keeps restored videos private without losing bytes", async () => {
  await s3.send(new CreateBucketCommand({ Bucket: "listing-videos" }));
  await s3.send(new PutBucketPolicyCommand({ Bucket: "listing-videos", Policy: legacyVideoPolicy() }));
  await s3.send(new PutObjectCommand({ Bucket: "listing-videos", Key: "legacy/original.mp4", Body: "synthetic-video" }));
  const videoUrl = `${endpoint}/listing-videos/legacy/original.mp4`;
  const before = await fetch(videoUrl);
  expect(before.status).toBe(200);
  expect(await before.text()).toBe("synthetic-video");

  await cli("bootstrap");
  await cli("bootstrap"); // Reconciliation is idempotent, including no policy.
  expect((await fetch(videoUrl)).status).toBe(403);
  expect(await (await s3.send(new GetObjectCommand({ Bucket: "listing-videos", Key: "legacy/original.mp4" }))).Body?.transformToString())
    .toBe("synthetic-video");
  for (const [bucket, key] of [
    ["listing-photos", "photo.webp"], ["chat-attachments", "image.webp"], ["catalog-assets", "brands/logo.webp"],
  ] as const) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "image" }));
    expect((await fetch(`${endpoint}/${bucket}/${key}`)).status).toBe(200);
  }
  expect((await fetch(`${endpoint}/listing-videos?list-type=2`)).status).toBe(403);
  expect((await fetch(`${endpoint}/listing-videos/anonymous.mp4`, { method: "PUT", body: "blocked" })).status).toBe(403);

  await cli("backup", directory);
  const policyFile = join(directory, "policies/listing-videos.json");
  expect(JSON.parse(await readFile(policyFile, "utf8"))).toBeNull();
  // Restore must reconcile access even if the target drifted back to public.
  await s3.send(new PutBucketPolicyCommand({ Bucket: "listing-videos", Policy: legacyVideoPolicy() }));
  await cli("restore", directory);
  expect((await fetch(videoUrl)).status).toBe(403);

  // Historical backups can restore their bytes without restoring the old grant.
  await writeFile(policyFile, legacyVideoPolicy());
  await cli("restore", directory);
  expect((await fetch(videoUrl)).status).toBe(403);
  expect(await (await s3.send(new GetObjectCommand({ Bucket: "listing-videos", Key: "legacy/original.mp4" }))).Body?.transformToString())
    .toBe("synthetic-video");
  await s3.send(new PutBucketPolicyCommand({ Bucket: "listing-videos", Policy: legacyVideoPolicy() }));
  await expect(cli("backup", join(directory, "drifted"))).rejects.toThrow(/re-bootstrap before backup/);
}, 30_000);
