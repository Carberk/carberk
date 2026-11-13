import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutBucketPolicyCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, type Pool } from "pg";
import sharp from "sharp";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createTestPool } from "../../tests/testing/create-test-pool";

import { RICH_SCENARIOS, runRichScenarios } from "./rich-scenarios";
import { richTarget } from "./rich-target";
import { configurationHash, deployedRichTarget, deployedRichVersion, runDeployedRich, type DeployedBinding, type StagingEvidence, type BackupEvidence } from "./deployed-rich";

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
    await pool.query("DELETE FROM listing_drafts WHERE id <> 'draft'");
    await pool.query("DELETE FROM media_uploads");
    const page = await s3.send(new ListObjectsV2Command({ Bucket }));
    for (const object of page.Contents ?? []) if (object.Key !== "existing/original.webp") await s3.send(new DeleteObjectCommand({ Bucket, Key: object.Key }));
    await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: policy() }));
  });
  afterAll(async () => { await pool?.end(); s3?.destroy(); await minio?.stop(); await postgres?.stop(); });
  async function snapshot() {
    const result = [];
    for (const table of ["users", "sessions", "listing_drafts", "listings", "listing_media", "listing_videos", "favorites", "media_uploads"]) {
      result.push((await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY id`)).rows);
    }
    return result;
  }
  async function apply() {
    const plan = await runRichScenarios(target);
    return runRichScenarios({ ...target, mode: "apply", planHash: plan.planHash });
  }
  async function deployed(environment: "staging" | "production" = "staging", scenarioSet: DeployedBinding["scenarioSet"] = "photos", photoEndpoint = target.endpoint) {
    const version = await deployedRichVersion();
    const api = { NODE_ENV: "production", APP_ENV: environment, RAILWAY_PROJECT_ID: "disposable-project",
      RAILWAY_ENVIRONMENT_ID: `disposable-${environment}`, RAILWAY_ENVIRONMENT_NAME: environment, RAILWAY_SERVICE_ID: "api-service",
      RAILWAY_GIT_COMMIT_SHA: "a".repeat(40), DATABASE_URL: target.databaseUrl, MINIO_ENDPOINT: photoEndpoint, MINIO_PUBLIC_URL: target.publicUrl,
      MINIO_ACCESS_KEY: target.accessKeyId, MINIO_SECRET_KEY: target.secretAccessKey,
      REDIS_URL: "redis://127.0.0.1:1", LISTING_VIDEO_API_ORIGIN: "http://127.0.0.1:1",
      LISTING_VIDEO_UPLOADS_ENABLED: "true", LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "seller", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "seller,other" };
    const worker = { ...api, RAILWAY_SERVICE_ID: "worker-service" };
    const resources = { database: { ...api, RAILWAY_SERVICE_ID: "database-service" }, storage: { ...api, RAILWAY_SERVICE_ID: "storage-service" }, redis: { ...api, RAILWAY_SERVICE_ID: "redis-service" } };
    const binding: DeployedBinding = { target: environment, projectId: "disposable-project", environmentId: `disposable-${environment}`,
      services: { api: "api-service", worker: "worker-service", database: "database-service", storage: "storage-service", redis: "redis-service" },
      apiConfigHash: configurationHash(api), workerConfigHash: configurationHash(worker),
      resourceConfigHashes: { database: configurationHash(resources.database), storage: configurationHash(resources.storage), redis: configurationHash(resources.redis) }, ownerId: "seller", viewerId: "other", scenarioSet, component: "scenario",
      compatibility: { apiCommit: "a".repeat(40), workerCommit: "a".repeat(40), behavior: version.behavior, schema: version.schemaHash,
        verifiedAt: new Date().toISOString(), ordinaryUploadAndPlayback: true } };
    return deployedRichTarget(binding, api, worker, resources);
  }
  async function completeSnapshot() {
    const tables = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
    const result: Record<string, unknown[]> = {};
    for (const { tablename } of tables) result[tablename] = (await pool.query(`SELECT to_jsonb(t) AS row FROM "${tablename}" t ORDER BY to_jsonb(t)::text`)).rows;
    return result;
  }
  it("guards deployed apply, binds stale state, preserves the exact DB/object write set and makes original-plan reapply a timestamp-preserving no-op", async () => {
    const context = await deployed();
    const before = await completeSnapshot();
    const oldObjects = (await s3.send(new ListObjectsV2Command({ Bucket }))).Contents;
    for (const override of [{ target: "production" }, { services: { ...context.binding.services, api: "foreign-service" } }, { services: { ...context.binding.services, storage: "foreign-storage" } }, { ownerId: "other" }, { databaseUrl: "postgres://private:secret@private/db" }]) {
      expect(() => deployedRichTarget({ ...context.binding, ...override }, context.api, context.worker, context.resources)).toThrow("Deployed rich target refused");
    }
    expect(() => deployedRichTarget(context.binding, { ...context.api, DATABASE_URL: "postgres://private:secret@private/db" }, context.worker, context.resources)).toThrow("Deployed rich target refused");
    expect(() => deployedRichTarget(context.binding, context.api, { ...context.worker, RAILWAY_ENVIRONMENT_ID: "foreign" }, context.resources)).toThrow("Deployed rich target refused");
    const checked = await runDeployedRich(context, { mode: "check" });
    const planned = await runDeployedRich(context, { mode: "plan" });
    expect(checked.writes).toBe(0); expect(checked.state).toBe("absent");
    expect(await completeSnapshot()).toEqual(before);
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(oldObjects);
    await pool.query(`UPDATE listing_drafts SET payload='{"description":"changed after plan"}' WHERE id='draft'`);
    const stale = await completeSnapshot();
    await expect(runDeployedRich(context, { mode: "apply", plan: planned.plan })).rejects.toThrow("Deployed rich target refused");
    expect(await completeSnapshot()).toEqual(stale);
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(oldObjects);
    const current = await runDeployedRich(context, { mode: "plan" });
    const applied = await runDeployedRich(context, { mode: "apply", plan: current.plan });
    expect(applied.writes).toBe(123); // two Listings, twenty media, one hundred variants and credits
    const after = await completeSnapshot();
    expect(Object.keys(after).filter((table) => JSON.stringify(after[table]) !== JSON.stringify(stale[table]))).toEqual(["listing_media", "listings"]);
    for (const table of ["listings", "listing_media"]) for (const row of stale[table] ?? []) expect(after[table]).toContainEqual(row);
    const objects = (await s3.send(new ListObjectsV2Command({ Bucket }))).Contents ?? [];
    expect(objects).toHaveLength(102);
    for (const object of oldObjects ?? []) expect(objects).toContainEqual(object);
    expect(objects.filter((object) => object.Key !== "existing/original.webp").every((object) => object.Key?.startsWith(`review-baseline/photos-v1/${applied.version}/`))).toBe(true);
    expect((await runDeployedRich(context, { mode: "apply", plan: current.plan })).writes).toBe(0);
    const deep = await runDeployedRich(context, { mode: "check" });
    expect(deep.state).toBe("installed"); expect(deep.writes).toBe(0);
    expect(deep.stagingEvidence?.success).toBe(true);
    expect(await completeSnapshot()).toEqual(after);
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(objects);
    expect(JSON.stringify(deep)).not.toMatch(/postgres:|http:|secret|test_pass|minioadmin|private-test-hash/);
  });
  it("requires same-pack successful staging and a fresh target/plan-bound verified production DB/media restore receipt before writes", async () => {
    const stagingContext = await deployed();
    const initial = await runDeployedRich(stagingContext, { mode: "plan" });
    await runDeployedRich(stagingContext, { mode: "apply", plan: initial.plan });
    const successful = await runDeployedRich(stagingContext, { mode: "check" });
    // Clear only suite-owned rows/objects, inside its disposable target, so
    // production authorization is exercised on absent resources as well.
    await pool.query('DELETE FROM listings WHERE id=ANY($1::text[])', [ids]);
    for (const object of (await s3.send(new ListObjectsV2Command({ Bucket }))).Contents ?? []) if (object.Key !== "existing/original.webp") await s3.send(new DeleteObjectCommand({ Bucket, Key: object.Key }));
    const context = await deployed("production");
    const { plan } = await runDeployedRich(context, { mode: "plan" });
    const before = await completeSnapshot();
    const objects = (await s3.send(new ListObjectsV2Command({ Bucket }))).Contents;
    const staging = successful.stagingEvidence as StagingEvidence;
    expect(staging.success).toBe(true);
    const backup: BackupEvidence = { target: "production", binding: plan.binding, planHash: plan.planHash, capturedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(), database: true, photos: true, privateVideos: true, restoreVerified: true, receiptId: "disposable-backup" };
    for (const evidence of [{}, { staging }, { staging: { ...staging, version: "old-pack" }, backup },
      { staging: { ...staging, success: false }, backup }, { staging, backup: { ...backup, restoreVerified: false } },
      { staging, backup: { ...backup, capturedAt: "2020-01-01" } }, { staging, backup: { ...backup, binding: "f".repeat(64) } }]) {
      await expect(runDeployedRich(context, { mode: "apply", plan, ...evidence } as Parameters<typeof runDeployedRich>[1])).rejects.toThrow("Deployed rich target refused");
      expect(await completeSnapshot()).toEqual(before);
      expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(objects);
    }
    expect((await runDeployedRich(context, { mode: "apply", plan, staging, backup })).writes).toBe(123);
    expect((await runDeployedRich(context, { mode: "apply", plan, staging, backup })).writes).toBe(0);
  });
  it("refuses deployed schema incompatibility, unexpected in-flight work, partial rows, foreign ownership and object collisions without adoption", async () => {
    const context = await deployed();
    const { plan } = await runDeployedRich(context, { mode: "plan" });
    const refuseWithoutWrites = async () => {
      const before = await completeSnapshot(); const objects = (await s3.send(new ListObjectsV2Command({ Bucket }))).Contents;
      await expect(runDeployedRich(context, { mode: "apply", plan })).rejects.toThrow("Deployed rich target refused");
      expect(await completeSnapshot()).toEqual(before);
      expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(objects);
    };
    await pool.query(`UPDATE _prisma_migrations SET checksum='incompatible' WHERE migration_name=(SELECT min(migration_name) FROM _prisma_migrations)`);
    await refuseWithoutWrites();
    const version = await deployedRichVersion();
    await pool.query('UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2', [version.schema[0]?.checksum, version.schema[0]?.migration_name]);
    await pool.query(`INSERT INTO media_uploads(id,"userId",key,kind,"contentType",state,"claimTargetType","claimTargetId","claimToken","claimDeadline") VALUES ('unexpected','seller','pending/unexpected/original.webp','image','image/webp','PREPARING','listing','unrelated','disposable-claim',now()+interval '1 minute')`);
    await refuseWithoutWrites();
    await pool.query("DELETE FROM media_uploads WHERE id='unexpected'");
    await pool.query(`INSERT INTO listings(id,"sellerId",status,"brandId","modelId","cityId","priceAmount","updatedAt") VALUES ($1,'other','active','local-brand','local-model','local-city',999,now())`, [ids[0]]);
    await refuseWithoutWrites();
    await pool.query(`INSERT INTO listings(id,"sellerId",status,"brandId","modelId","cityId","priceAmount","updatedAt") VALUES ($1,'other','active','local-brand','local-model','local-city',999,now())`, [ids[1]]);
    await refuseWithoutWrites();
    await pool.query('DELETE FROM listings WHERE id=ANY($1::text[])', [ids]);
    await s3.send(new PutObjectCommand({ Bucket, Key: "review-baseline/photos-v1/partial/original.webp", Body: "preserve partial" }));
    await refuseWithoutWrites();
  });
  it("adds four private Photos-step drafts with accurate AVAILABLE uploads, retaining the existing draft and making repeat apply a no-op", async () => {
    const selected = { ...target, scenarioSet: "private-drafts" as const };
    const before = await snapshot();
    const plan = await runRichScenarios(selected);
    expect(plan.planned).toEqual({ drafts: 4, uploads: 24, objects: 121 });
    expect(await snapshot()).toEqual(before);
    await runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash });
    const rows = (await pool.query(`SELECT payload FROM listing_drafts WHERE id LIKE 'b1130000-%' ORDER BY id`)).rows;
    expect(rows.map((row) => row.payload.photos.length)).toEqual([0, 1, 3, 20]);
    expect(rows.every((row) => row.payload.currentStep === 3)).toBe(true);
    const uploads = (await pool.query(`SELECT * FROM media_uploads WHERE id LIKE 'b1130000-%'`)).rows;
    expect(uploads).toHaveLength(24);
    for (const upload of uploads) {
      expect(upload.state).toBe("AVAILABLE"); expect(upload.userId).toBe("seller");
      expect(upload.objectKeys).toHaveLength(5);
      const object = await s3.send(new GetObjectCommand({ Bucket, Key: upload.key }));
      expect(object.ContentLength).toBe(upload.sizeBytes);
      expect(object.ContentType).toBe("image/webp");
    }
    const after = await snapshot();
    const stored = (await s3.send(new ListObjectsV2Command({ Bucket }))).Contents;
    expect((await runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash })).writes).toBe(0);
    expect((await runRichScenarios({ ...selected, mode: "check" })).state).toBe("installed");
    expect(await snapshot()).toEqual(after);
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toEqual(stored);
  });
  it("refuses capacity and stale plans after concurrent creation without evicting drafts", async () => {
    const selected = { ...target, scenarioSet: "private-drafts" as const };
    const plan = await runRichScenarios(selected);
    await pool.query(`INSERT INTO listing_drafts(id,"userId",payload,"updatedAt")VALUES('concurrent','seller','{}',now())`);
    const before = await snapshot();
    await expect(runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash })).rejects.toThrow("Draft capacity: existing=2, required=4, cap=5");
    expect(await snapshot()).toEqual(before);
    await pool.query("DELETE FROM listing_drafts WHERE id='concurrent'");
    await pool.query(`UPDATE listing_drafts SET "updatedAt"="updatedAt"+interval '1 second' WHERE id='draft'`);
    await expect(runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash })).rejects.toThrow("Plan hash changed");
    expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toHaveLength(1);
  });
  it("counts a normal create committed while apply waits for the owner lock", async () => {
    const selected = { ...target, scenarioSet: "private-drafts" as const };
    const plan = await runRichScenarios(selected);
    const creator = new Client({ connectionString: target.databaseUrl });
    await creator.connect();
    await creator.query("BEGIN");
    await creator.query("SELECT id FROM users WHERE id='seller' FOR UPDATE");
    const creatorPid = (await creator.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
    if (!creatorPid) throw new Error("Creator backend missing");
    let connected!: (pid: number) => void;
    const databaseReady = new Promise<number>((resolve) => { connected = resolve; });
    const connect: (this: Client) => Promise<Client> = Client.prototype.connect;
    // Call through at the external DB boundary: the real renderer must finish
    // before the bounded lock observation starts, regardless of host speed.
    const connection = vi.spyOn(Client.prototype, "connect").mockImplementationOnce(async function (this: Client) {
      await connect.call(this);
      const pid = (await this.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      if (!pid) throw new Error("Apply backend missing");
      connected(pid);
      return this;
    });
    const applying = runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash }).then(() => "unexpected success", (error: unknown) => String(error));
    try {
      const applyingPid = await Promise.race([databaseReady, applying.then((result) => { throw new Error(`Apply exited before connecting: ${result}`); })]);
      // PostgreSQL must confirm this apply is blocked by this creator, not by
      // an unrelated query whose text happens to contain FOR UPDATE.
      let blocked = false;
      for (let attempt = 0; attempt < 500 && !blocked; attempt++) {
        blocked = (await pool.query<{ blocked: boolean }>("SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked", [creatorPid, applyingPid])).rows[0]?.blocked ?? false;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await creator.query(`INSERT INTO listing_drafts(id,"userId",payload,"updatedAt")VALUES('racing','seller','{}',now())`);
      await creator.query("COMMIT");
      expect(await applying).toContain("Draft capacity: existing=2, required=4, cap=5");
      expect((await pool.query("SELECT id FROM listing_drafts ORDER BY id")).rows).toEqual([{ id: "draft" }, { id: "racing" }]);
      expect((await s3.send(new ListObjectsV2Command({ Bucket }))).Contents).toHaveLength(1);
    } finally { connection.mockRestore(); await creator.query("ROLLBACK"); await creator.end(); await applying; }
  });
  it("refuses foreign, modified and consumed private drafts and upload/object collisions", async () => {
    const selected = { ...target, scenarioSet: "private-drafts" as const };
    const plan = await runRichScenarios(selected);
    await runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash });
    await expect(runRichScenarios({ ...selected, ownerId: "other" })).rejects.toThrow("Modified/foreign private draft");
    await pool.query(`UPDATE media_uploads SET "userId"='other' WHERE id='b1130000-0000-4003-8000-000000000001'`);
    await expect(runRichScenarios(selected)).rejects.toThrow("modified/consumed private upload");
    await pool.query(`UPDATE media_uploads SET "userId"='seller'`);
    await pool.query(`UPDATE media_uploads SET state='RETIRED',"retiredAt"=now() WHERE id='b1130000-0000-4003-8000-000000000001'`);
    await expect(runRichScenarios(selected)).rejects.toThrow("modified/consumed private upload");
    await pool.query(`UPDATE media_uploads SET state='AVAILABLE',"retiredAt"=NULL`);
    await pool.query(`UPDATE listing_drafts SET payload=jsonb_set(payload,'{currentStep}','4') WHERE id='b1130000-0000-4000-8000-000000000003'`);
    await expect(runRichScenarios(selected)).rejects.toThrow("Modified/foreign private draft");
    await pool.query(`DELETE FROM listing_drafts WHERE id='b1130000-0000-4000-8000-000000000003'`);
    await expect(runRichScenarios(selected)).rejects.toThrow("Partial/consumed private drafts");
  });
  it("refuses exact private upload IDs, keys and foreign draft references before writes", async () => {
    const selected = { ...target, scenarioSet: "private-drafts" as const };
    const plan = await runRichScenarios(selected);
    await pool.query(`INSERT INTO media_uploads(id,"userId",key,kind,"contentType")VALUES('b1130000-0000-4003-8000-000000000001','other','foreign/original.webp','image','image/webp')`);
    await expect(runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash })).rejects.toThrow("Occupied/modified/consumed private upload");
    await pool.query("DELETE FROM media_uploads");
    await pool.query(`INSERT INTO listing_drafts(id,"userId",payload,"updatedAt")VALUES('foreign-reference','other','{"photos":[{"key":"pending/b1130000-0000-4003-8000-000000000001/original.webp"}]}',now())`);
    await expect(runRichScenarios(selected)).rejects.toThrow("referenced by another draft");
    await pool.query("DELETE FROM listing_drafts WHERE id='foreign-reference'");
    await s3.send(new PutObjectCommand({ Bucket, Key: "pending/b1130000-0000-4003-8000-000000000001/original.webp", Body: "preserve collision" }));
    await expect(runRichScenarios(selected)).rejects.toThrow("Occupied object namespace");
    expect((await pool.query("SELECT id FROM listing_drafts ORDER BY id")).rows).toEqual([{ id: "draft" }]);
  });
  it("retains an exact private-object recovery receipt when draft inserts fail", async () => {
    const selected = { ...target, scenarioSet: "private-drafts" as const };
    const plan = await runRichScenarios(selected);
    await pool.query(`ALTER TABLE listing_drafts ADD CONSTRAINT private_test_failure CHECK (id='draft')`);
    const before = await snapshot();
    try { await expect(runRichScenarios({ ...selected, mode: "apply", planHash: plan.planHash })).rejects.toThrow(/atomic private draft\/upload inserts.*createdObjects.*pending\/b1130000/); }
    finally { await pool.query("ALTER TABLE listing_drafts DROP CONSTRAINT private_test_failure"); }
    expect(await snapshot()).toEqual(before);
    expect((await s3.send(new ListObjectsV2Command({ Bucket, Prefix: "pending/b1130000-" }))).Contents).toHaveLength(120);
    await expect(runRichScenarios(selected)).rejects.toThrow("Occupied object namespace");
  });
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
  it.each(["local", "deployed"])("partial upload failure retains exact recovery objects, no rows, no pre-existing deletion, and refuses retry (%s)", async (entrypoint) => {
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
      if (entrypoint === "deployed") {
        const context = await deployed("staging", "photos", faultTarget.endpoint);
        const { plan } = await runDeployedRich(context, { mode: "plan" });
        await expect(runDeployedRich(context, { mode: "apply", plan })).rejects.toThrow("Deployed rich target refused");
      } else {
        const plan = await runRichScenarios(faultTarget);
        await expect(runRichScenarios({ ...faultTarget, mode: "apply", planHash: plan.planHash })).rejects.toThrow(/conditional immutable uploads.*createdObjects.*credits.json.*attemptedObject/);
      }
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
