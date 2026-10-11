import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CreateBucketCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import sharp from "sharp";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const must = <T>(value: T | null | undefined): T => { if (value == null) throw new Error("Missing fixture value"); return value; };

import { main } from "./convert-photos-webp";

// This fixture owns BOTH disposable services. Inventory/conversion must never touch shared CI buckets.
describe("WebP operator conversion on real Postgres and conditional MinIO", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let pool: Pool;
  let s3: S3Client;
  let directory: string;
  let endpoint: string;
  const prefix = "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585";
  const key = `${prefix}/original.jpg`;

  beforeAll(async () => {
    [postgres, minio] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("auto_tm_test").withDatabase("webp_conversion_test").start(),
      new GenericContainer("cgr.dev/chainguard/minio@sha256:8d5a0265f0e18fb3b29f95598147f1cc2a86b782181668bad176b0e90cce9569")
        .withUser("0:0").withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" }).withCommand(["server", "/data"])
        .withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/live", 9000)).start(),
    ]);
    const databaseUrl = postgres.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    pool = new Pool({ connectionString: databaseUrl });
    endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
    for (const Bucket of ["listing-photos", "chat-attachments"]) {
      await s3.send(new CreateBucketCommand({ Bucket }));
      await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${Bucket}/*` }] }) }));
    }
    for (const [name, value] of Object.entries({ DATABASE_URL: databaseUrl, MINIO_ENDPOINT: endpoint, MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin", PHOTO_CONVERSION_WRITERS_PAUSED: "yes" })) vi.stubEnv(name, value);
    directory = await mkdtemp(join(tmpdir(), "webp-operator-real-"));
    await pool.query(`INSERT INTO users (id, role, "createdAt", "updatedAt") VALUES ('webp-user','seller',now(),now())`);
    await pool.query(`INSERT INTO media_uploads (id,"userId",key,kind,"contentType","sizeBytes","createdAt", "objectKeys", "writeProtocol", state) VALUES ('webp-upload','webp-user',$1,'image','image/jpeg',100,now(),$2,'conditional-v1','ADOPTED')`, [key, ["original.jpg", "thumbnail.jpg", "thumbnail.webp", "list.jpg", "list.webp", "detail.jpg", "detail.webp", "fullscreen.jpg", "fullscreen.webp"].map((file) => `${prefix}/${file}`)]);
    await pool.query(`UPDATE users SET "avatarKey"=$1,"avatarUploadId"='webp-upload' WHERE id='webp-user'`, [key]);
    await pool.query(`INSERT INTO listing_drafts (id,"userId",payload,"createdAt","updatedAt") VALUES ('webp-draft','webp-user',$1,now(),now())`, [JSON.stringify({ photos: [{ photoId: "photo-1", key, sortOrder: 0 }], description: "Keep vehicle content" })]);
    await pool.query(`INSERT INTO audit_logs (id,action,"targetType","targetId",details,"createdAt") VALUES ('webp-audit','profile-photo-set','user','webp-user',$1,now())`, [JSON.stringify({ before: { avatarKey: key }, note: "Immutable audit history" })]);
    const original = await sharp({ create: { width: 160, height: 120, channels: 3, background: "red" } }).jpeg().withExif({ IFD0: { Make: "Camera" } }).toBuffer();
    const padded = await sharp(original).resize(240, 160, { fit: "contain", withoutEnlargement: true }).webp().toBuffer();
    await s3.send(new PutObjectCommand({ Bucket: "listing-photos", Key: `${prefix}/detail.webp`, Body: padded, ContentType: "image/webp", CacheControl: "public,max-age=31536000,immutable" }));
    for (const file of ["original", "thumbnail", "list", "detail", "fullscreen"]) await s3.send(new PutObjectCommand({ Bucket: "listing-photos", Key: `${prefix}/${file}.jpg`, Body: original, ContentType: "image/jpeg" }));
  });
  afterAll(async () => { vi.unstubAllEnvs(); await pool?.end(); s3?.destroy(); await minio?.stop(); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

  it("converts in place, CAS verifies JSON/arrays against real schema, resumes and conditionally deletes JPEGs", async () => {
    const plan = join(directory, "plan.json");
    const auditBefore = (await pool.query(`SELECT row_to_json(audit_logs) AS record FROM audit_logs WHERE id='webp-audit'`)).rows[0].record;
    const oldUrl = `${endpoint}/listing-photos/${prefix}/detail.webp`;
    const oldCachedBytes = Buffer.from(await (await fetch(oldUrl)).arrayBuffer());
    expect((await sharp(oldCachedBytes).metadata()).width).toBe(240);
    await main(["dry-run", plan]); await main(["apply", plan]); await main(["apply", plan]); await main(["verify", plan]);
    expect((await pool.query(`SELECT id,"avatarKey" FROM users WHERE id='webp-user'`)).rows[0]).toEqual({ id: "webp-user", avatarKey: `${prefix}/original.webp` });
    const upload = (await pool.query(`SELECT "objectKeys","contentType","sizeBytes" FROM media_uploads WHERE id='webp-upload'`)).rows[0];
    expect(upload.objectKeys).toHaveLength(5); expect(upload.contentType).toBe("image/webp");
    expect((await pool.query(`SELECT payload FROM listing_drafts WHERE id='webp-draft'`)).rows[0].payload).toEqual({ photos: [{ photoId: "photo-1", key: `${prefix}/original.webp`, sortOrder: 0 }], description: "Keep vehicle content" });
    const detail = await s3.send(new GetObjectCommand({ Bucket: "listing-photos", Key: `${prefix}/detail.webp` }));
    const meta = await sharp(Buffer.from(await must(detail.Body).transformToByteArray())).metadata();
    expect([meta.width, meta.height]).toEqual([160, 120]); expect(meta.exif).toBeUndefined();
    const freshUrl = `${oldUrl}?v=webp-natural-1`;
    const fresh = await fetch(freshUrl);
    expect(fresh.status).toBe(200);
    expect((await sharp(Buffer.from(await fresh.arrayBuffer())).metadata()).width).toBe(160);
    // Existing caches still hold the old URI's bytes; new clients use the distinct versioned URI.
    expect((await sharp(oldCachedBytes).metadata()).width).toBe(240);
    await main(["delete-jpeg", plan]); await main(["delete-jpeg", plan]);
    const stored = await s3.send(new ListObjectsV2Command({ Bucket: "listing-photos" }));
    expect((await pool.query(`SELECT row_to_json(audit_logs) AS record FROM audit_logs WHERE id='webp-audit'`)).rows[0].record).toEqual(auditBefore);
    expect(stored.Contents?.map((object) => object.Key).sort()).toEqual(["detail", "fullscreen", "list", "original", "thumbnail"].map((name) => `${prefix}/${name}.webp`));
  });

  it("rolls back earlier profile rewrites when a later JSON reference changes concurrently", async () => {
    const second = "pending/31b0b4e0-4d4a-4d2c-8bd6-705555cb7585";
    const key = `${second}/original.jpg`;
    await pool.query(`INSERT INTO users (id,role,"avatarKey","createdAt","updatedAt") VALUES ('webp-user2','seller',$1,now(),now())`, [key]);
    await pool.query(`INSERT INTO listing_drafts (id,"userId",payload,"createdAt","updatedAt") VALUES ('webp-draft2','webp-user2',$1,now(),now())`, [JSON.stringify({ photos: [{ key }], description: "Original" })]);
    const original = await sharp({ create: { width: 160, height: 120, channels: 3, background: "red" } }).jpeg().toBuffer();
    await s3.send(new PutObjectCommand({ Bucket: "listing-photos", Key: key, Body: original, ContentType: "image/jpeg" }));
    const plan = join(directory, "cas-plan.json");
    await main(["dry-run", plan]);
    await pool.query(`UPDATE listing_drafts SET payload=$1 WHERE id='webp-draft2'`, [JSON.stringify({ photos: [{ key }], description: "Edited by seller" })]);
    await expect(main(["apply", plan])).rejects.toThrow("Concurrent change");
    expect((await pool.query(`SELECT "avatarKey" FROM users WHERE id='webp-user2'`)).rows[0].avatarKey).toBe(key);
    expect((await pool.query(`SELECT payload FROM listing_drafts WHERE id='webp-draft2'`)).rows[0].payload.description).toBe("Edited by seller");
    await expect(main(["delete-jpeg", plan])).rejects.toThrow("old photo references");
    expect((await s3.send(new GetObjectCommand({ Bucket: "listing-photos", Key: key }))).Body).toBeDefined();
  });

});
