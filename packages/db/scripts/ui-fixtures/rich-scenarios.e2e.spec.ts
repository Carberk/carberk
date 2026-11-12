import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutBucketPolicyCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Pool } from "pg";
import sharp from "sharp";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestPool } from "../../tests/testing/create-test-pool";

import { RICH_SCENARIOS, runRichScenarios } from "./rich-scenarios";
import { richTarget } from "./rich-target";

// Both services are disposable and owned by this suite; never the shared dev stack.
describe("additive rich scenarios on real Postgres and conditional MinIO", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let pool: Pool;
  let s3: S3Client;
  let target: ReturnType<typeof richTarget>;
  const Bucket = "listing-photos";
  const ids = RICH_SCENARIOS.map((scenario) => scenario.id);
  const policy = () => JSON.stringify({ Version: "2012-10-17", Statement: [
    { Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${Bucket}/*` },
  ] });
  beforeAll(async () => {
    [postgres, minio] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine").withUsername("auto_tm").withPassword("test_pass").withDatabase("rich_test").start(),
      new GenericContainer("cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285")
        .withUser("0:0").withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
        .withCommand(["server", "/data"]).withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/live", 9000)).start(),
    ]);
    const databaseUrl = postgres.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: fileURLToPath(new URL("../..", import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    pool = createTestPool(databaseUrl);
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    target = richTarget(["--target", "local", "--mode", "plan", "--owner-id", "seller"], {
      NODE_ENV: "test", APP_ENV: "test", DATABASE_URL: databaseUrl, MINIO_ENDPOINT: endpoint, MINIO_PUBLIC_URL: endpoint,
      MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin",
    });
    s3 = new S3Client({ endpoint, forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
    await s3.send(new CreateBucketCommand({ Bucket }));
    await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: policy() }));
    await pool.query(`INSERT INTO users (id,role,phone,"phoneVerifiedAt","createdAt","updatedAt") VALUES ('seller','seller','+99361999999',now(),now(),now()),('other','seller','+99361999998',now(),now(),now())`);
    await pool.query(`INSERT INTO brands (id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES ('local-brand','lexus','Lexus','Lexus','Lexus',now())`);
    await pool.query(`INSERT INTO models (id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES ('local-model','local-brand','es','ES','ES','ES',now())`);
    await pool.query(`INSERT INTO regions (id,slug,"nameRu","nameTk","nameEn","updatedAt") VALUES ('local-region','ashgabat','Ashgabat','Ashgabat','Ashgabat',now())`);
    await pool.query(`INSERT INTO cities (id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt") VALUES ('local-city','local-region','ashgabat-city','Ashgabat','Ashgabat','Ashgabat',now())`);
    await pool.query(`INSERT INTO body_types (id,"nameRu","nameTk","nameEn","updatedAt") VALUES ('local-body','Sedan','Sedan','Sedan',now())`);
    await pool.query(`INSERT INTO listings (id,"sellerId",status,"brandId","modelId","cityId","priceAmount","updatedAt") VALUES ('unrelated','seller','active','local-brand','local-model','local-city',123,now())`);
    await pool.query(`INSERT INTO listing_media (id,"listingId",kind,key,"sortOrder") VALUES ('old-media','unrelated','image','existing/original.webp',0)`);
    await pool.query(`INSERT INTO sessions (id,"userId","refreshTokenHash","expiresAt") VALUES ('session','seller','private-test-hash',now()+interval '1 day')`);
    await pool.query(`INSERT INTO listing_drafts (id,"userId",payload,"updatedAt") VALUES ('draft','seller','{"description":"keep local draft"}',now())`);
    await pool.query(`INSERT INTO listing_videos (id,"ownerId","listingId","updatedAt") VALUES ('video','seller','unrelated',now())`);
    await pool.query(`INSERT INTO favorites (id,"userId","listingId") VALUES ('favorite','seller','unrelated')`);
    await s3.send(new PutObjectCommand({ Bucket, Key: "existing/original.webp", Body: "preserve old media" }));
  });
  afterEach(async () => {
    // Cleanup is confined to these disposable containers, never the operator's executor.
    await pool.query('DELETE FROM listing_media WHERE id <> $1', ["old-media"]);
    await pool.query('DELETE FROM listings WHERE id <> $1', ["unrelated"]);
    const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: "review-baseline/" }));
    for (const object of page.Contents ?? []) await s3.send(new DeleteObjectCommand({ Bucket, Key: object.Key }));
    await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: policy() }));
  });
  afterAll(async () => { await pool?.end(); s3?.destroy(); await minio?.stop(); await postgres?.stop(); });
  async function snapshot() {
    const result = [];
    for (const table of ["users", "sessions", "listing_drafts", "listings", "listing_media", "listing_videos", "favorites"]) {
      result.push((await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY id`)).rows);
    }
    return result;
  }
  async function apply() {
    const plan = await runRichScenarios(target);
    return runRichScenarios({ ...target, mode: "apply", planHash: plan.planHash });
  }
  it("plans read-only, creates two ten-view scenarios with public credits, and repeats with no timestamp/object changes", async () => {
    const before = await snapshot();
    const plan = await runRichScenarios(target);
    expect(plan.planned).toEqual({ listings: 2, media: 20, objects: 101 });
    expect(await snapshot()).toEqual(before);
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toHaveLength(1);
    const applied = await runRichScenarios({ ...target, mode: "apply", planHash: plan.planHash });
    expect(applied.writes).toBe(123);
    const after = await snapshot();
    const stored = await s3.send(new ListObjectsV2Command({ Bucket }));
    expect((await runRichScenarios({ ...target, mode: "apply", planHash: plan.planHash })).writes).toBe(0);
    expect((await runRichScenarios({ ...target, mode: "check" })).state).toBe("installed");
    expect(await snapshot()).toEqual(after);
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(stored.Contents);
    const photos = (await pool.query('SELECT key,width,height,"sortOrder" FROM listing_media WHERE "listingId"=$1 ORDER BY "sortOrder"', [ids[0]])).rows;
    expect(photos.map((photo) => photo.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(photos[4].height).toBeGreaterThan(photos[4].width);
    const rendered = await s3.send(new GetObjectCommand({ Bucket, Key: photos[4].key }));
    if (!rendered.Body) throw new Error("Missing photo body");
    const metadata = await sharp(Buffer.from(await rendered.Body.transformToByteArray())).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.exif).toBeUndefined(); expect(metadata.orientation).toBeUndefined();
    const creditResponse = await fetch(plan.creditsUrl);
    expect(creditResponse.status).toBe(200);
    const credits = await creditResponse.json() as { photos: { sourceFile: string; modifications: string }[] };
    expect(credits.photos).toHaveLength(310);
    expect(credits.photos.slice(-10).filter((photo) => photo.modifications.includes("metadata removed"))).toHaveLength(10);
    await pool.query('DELETE FROM listings WHERE id=ANY($1::text[])', [ids]);
    expect(await snapshot()).toEqual(before);
  });
  it("refuses occupied IDs, foreign owners, modified scenarios and media collisions", async () => {
    await pool.query(`INSERT INTO listings (id,"sellerId",status,"brandId","modelId","cityId","priceAmount","updatedAt") VALUES ($1,'other','draft','local-brand','local-model','local-city',4,now())`, [ids[0]]);
    await expect(apply()).rejects.toThrow("Partial scenario rows");
    await pool.query('DELETE FROM listings WHERE id=$1', [ids[0]]);
    await pool.query(`INSERT INTO listing_media (id,"listingId",kind,key,"sortOrder") VALUES ('b1126000-0000-4000-8001-000000000001','unrelated','image','foreign/key.webp',0)`);
    await expect(apply()).rejects.toThrow("Occupied media");
    await pool.query("DELETE FROM listing_media WHERE key='foreign/key.webp'");
    await apply();
    await expect(runRichScenarios({ ...target, ownerId: "other" })).rejects.toThrow("Modified/occupied Listing");
    await pool.query('UPDATE listing_media SET "sortOrder"=99 WHERE id=$1', ["b1126000-0000-4000-8001-000000000001"]);
    await expect(apply()).rejects.toThrow("Modified/occupied media");
    await pool.query('UPDATE listing_media SET "sortOrder"=0 WHERE id=$1', ["b1126000-0000-4000-8001-000000000001"]);
    await pool.query('UPDATE listings SET description=$1 WHERE id=$2', ["seller edited", ids[0]]);
    await expect(apply()).rejects.toThrow("Modified/occupied Listing");
  });
  it.each(["missing", "corrupt"])("refuses %s stored bytes without repairing them", async (damage) => {
    await apply();
    const key = (await pool.query('SELECT key FROM listing_media WHERE "listingId"=$1 ORDER BY "sortOrder" LIMIT 1', [ids[0]])).rows[0].key as string;
    if (damage === "missing") await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    else await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: "bad", ContentType: "image/webp" }));
    const before = await snapshot();
    await expect(apply()).rejects.toThrow(damage === "missing" ? "Missing/extra" : "Corrupt/incompatible");
    expect(await snapshot()).toEqual(before);
  });
  it("partial upload failure retains exact recovery objects, no rows, no pre-existing deletion, and refuses retry", async () => {
    // Real storage through a faulting network boundary: credits succeed, the next PUT fails.
    const proxy = createServer((incoming, response) => {
      if (incoming.method === "PUT" && incoming.url?.includes("/rich-es300h-portrait/")) {
        response.writeHead(503); response.end(); return;
      }
      const forwarded = request(new URL(incoming.url ?? "/", target.endpoint), { method: incoming.method, headers: incoming.headers }, (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(response);
      });
      forwarded.on("error", () => { response.writeHead(502); response.end(); });
      incoming.pipe(forwarded);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    if (!address || typeof address === "string") throw new Error("Missing fault proxy address");
    const faultTarget = { ...target, endpoint: `http://127.0.0.1:${address.port}/` };
    const before = await snapshot();
    try {
      const plan = await runRichScenarios(faultTarget);
      await expect(runRichScenarios({ ...faultTarget, mode: "apply", planHash: plan.planHash })).rejects.toThrow(/conditional immutable uploads.*createdObjects.*credits.json.*attemptedObject/);
    } finally { await new Promise<void>((resolve) => proxy.close(() => resolve())); }
    expect(await snapshot()).toEqual(before);
    const page = await s3.send(new ListObjectsV2Command({ Bucket }));
    expect(page.Contents).toHaveLength(2);
    await expect(apply()).rejects.toThrow("Occupied object namespace");
  });
  it("refuses offline loss, target/owner plan drift and orphan objects before any write", async () => {
    const empty = await mkdtemp(join(tmpdir(), "rich-empty-"));
    try { await expect(runRichScenarios(target, empty)).rejects.toThrow("missing or unreadable local JPEG"); } finally { await rm(empty, { recursive: true }); }
    await expect(runRichScenarios({ ...target, mode: "apply", planHash: "0".repeat(64) })).rejects.toThrow("Plan hash changed");
    await s3.send(new PutObjectCommand({ Bucket, Key: "review-baseline/photos-v1/foreign", Body: "keep" }));
    await expect(apply()).rejects.toThrow("Occupied object namespace");
    expect((await pool.query('SELECT id FROM listings ORDER BY id')).rows).toEqual([{ id: "unrelated" }]);
  });
  it("rolls back both new Listings if media insertion fails, retaining exact new objects for bounded recovery", async () => {
    await pool.query(`ALTER TABLE listing_media ADD CONSTRAINT rich_test_failure CHECK ("listingId"='unrelated')`);
    const before = await snapshot();
    try { await expect(apply()).rejects.toThrow(/atomic new Listing\/media inserts.*createdObjects/); }
    finally { await pool.query("ALTER TABLE listing_media DROP CONSTRAINT rich_test_failure"); }
    expect(await snapshot()).toEqual(before);
    expect((await s3.send(new ListObjectsV2Command({ Bucket, Prefix: "review-baseline/" }))).Contents).toHaveLength(101);
    await expect(apply()).rejects.toThrow("Occupied object namespace");
  });
  it("requires anonymously accessible attribution before exposing Listings", async () => {
    // Root operator can write/read; public readers cannot. No policy is changed by the executor.
    await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: JSON.stringify({ Version: "2012-10-17", Statement: [
      { Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${Bucket}/existing/*` },
    ] }) }));
    const before = await snapshot();
    await expect(apply()).rejects.toThrow("Public attribution is unavailable");
    expect(await snapshot()).toEqual(before);
  });
});
