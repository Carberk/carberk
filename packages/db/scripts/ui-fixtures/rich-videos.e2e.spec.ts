import "reflect-metadata";

import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutBucketPolicyCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runRichPhotos, runRichScenarios } from "./rich-scenarios";
import { richTarget } from "./rich-target";
import { configurationHash, deployedRichTarget, deployedRichVersion, runDeployedRich, type DeployedBinding, type DeployedPlan } from "./deployed-rich";

// This lane always starts disposable services. Missing Docker/FFmpeg fails it.
// Corruption tests restore edited rows/objects; recovery retires only its separate copy.
describe("rich video operator with real processor and storage", { concurrent: false }, () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let redis: StartedTestContainer;
  let h: Awaited<ReturnType<typeof harness>>;
  let db: Client;
  let s3: S3Client;
  let target: ReturnType<typeof richTarget>;
  let deployedContext: ReturnType<typeof deployedRichTarget>;
  let deployedPlan: DeployedPlan;
  let imported: Awaited<ReturnType<typeof prepareVideoScenarios>>;
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:16-alpine").start();
    minio = await new GenericContainer("cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285")
      .withUser("0:0").withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
      .withCommand(["server", "/data"]).withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/live", 9000)).start();
    redis = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    const databaseUrl = postgres.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    db = new Client({ connectionString: databaseUrl }); await db.connect();
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    const operatorEnv = {
      APP_ENV: "test", NODE_ENV: "test", DATABASE_URL: databaseUrl, REDIS_URL: "redis://localhost:6379", MINIO_ENDPOINT: endpoint,
      MINIO_PUBLIC_URL: endpoint, MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin", LISTING_VIDEO_API_ORIGIN: "http://localhost:3006",
      LISTING_VIDEO_UPLOADS_ENABLED: "true", LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "seller", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "seller,viewer", MINIO_REGION: process.env["RICH_VIDEO_TEST_API_REGION"] || "us-east-1",
    };
    target = richTarget(["--target", "local", "--mode", "plan", "--owner-id", "seller", "--viewer-id", "viewer", "--scenario-set", "videos"], operatorEnv,
      { ...operatorEnv, LISTING_VIDEO_BUCKET_REGION: process.env["RICH_VIDEO_TEST_WORKER_REGION"] || "auto" });
    s3 = new S3Client({ endpoint, forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
    for (const Bucket of ["listing-photos", "listing-videos"]) await s3.send(new CreateBucketCommand({ Bucket }));
    await s3.send(new PutBucketPolicyCommand({ Bucket: "listing-photos", Policy: JSON.stringify({ Version: "2012-10-17", Statement: [
      { Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::listing-photos/*" },
    ] }) }));
    await db.query(`INSERT INTO users (id,role,phone,"phoneVerifiedAt","createdAt","updatedAt") VALUES
      ('seller','seller','+99361910101',now(),now(),now()),('viewer','buyer','+99361910102',now(),now(),now())`);
    await db.query(`INSERT INTO brands (id,slug,"nameEn","nameRu","nameTk","updatedAt") VALUES ('brand','lexus','Lexus','Lexus','Lexus',now())`);
    await db.query(`INSERT INTO models (id,slug,"brandId","nameEn","nameRu","nameTk","updatedAt") VALUES ('model','es','brand','ES','ES','ES',now())`);
    await db.query(`INSERT INTO regions (id,slug,"nameEn","nameRu","nameTk","updatedAt") VALUES ('region','ashgabat','Ashgabat','Ashgabat','Ashgabat',now())`);
    await db.query(`INSERT INTO cities (id,slug,"regionId","nameEn","nameRu","nameTk","updatedAt") VALUES ('city','ashgabat-city','region','Ashgabat','Ashgabat','Ashgabat',now())`);
    await db.query(`INSERT INTO body_types (id,"nameEn","nameRu","nameTk","updatedAt") VALUES ('body','Sedan','Sedan','Sedan',now())`);
    await db.query(`INSERT INTO listing_drafts (id,"userId",payload,"updatedAt") VALUES ('protected','seller','{}',now())`);
    process.env["DATABASE_URL"] = databaseUrl;
    h = await harness(endpoint, `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`);
    await h.priorVideo();
    for (const scenarioSet of ["photos", "private-drafts"] as const) {
      const selected = { ...target, scenarioSet }; const plan = await runRichPhotos(selected);
      await runRichPhotos({ ...selected, mode: "apply", planHash: plan.planHash });
    }
  }, 120_000);
  // Separate real boundaries: photo fixtures, then Processing import and worker settlement.
  beforeAll(async () => { imported = await prepareVideoScenarios(); }, 240_000);
  afterAll(async () => {
    const errors: unknown[] = [];
    for (const close of [() => h?.close(), () => db?.end(), () => s3?.destroy(), () => redis?.stop(), () => minio?.stop(), () => postgres?.stop()]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Disposable video fixture cleanup failed");
  });
  async function fullSnapshot() {
    const rows = [];
    for (const table of ["users", "sessions", "listing_drafts", "listings", "listing_media", "media_uploads", "listing_videos", "video_sources", "video_generations", "video_output_reservations", "video_upload_cleanups"]) {
      rows.push((await db.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY ${table === "video_output_reservations" ? "key" : table === "video_upload_cleanups" ? '"sourceId"' : "id"}`)).rows);
    }
    return rows;
  }
  async function snapshot() {
    return (await db.query(`SELECT jsonb_agg(row_to_json(t) ORDER BY id) AS rows FROM listing_drafts t`)).rows;
  }
  async function prepareVideoScenarios() {
    const before = structuredClone(await snapshot());
    const prior = structuredClone(await h.priorSnapshot());
    const inventory = (await fullSnapshot()).slice(0, 6); // Users, Sessions, drafts, Listings, media and uploads.
    const plan = await runRichScenarios(target);
    const afterPlan = await snapshot();
    const version = await deployedRichVersion();
    const api = { APP_ENV: "staging", NODE_ENV: "production", RAILWAY_PROJECT_ID: "disposable", RAILWAY_ENVIRONMENT_ID: "disposable-staging",
      RAILWAY_ENVIRONMENT_NAME: "staging", RAILWAY_SERVICE_ID: "api", RAILWAY_GIT_COMMIT_SHA: "a".repeat(40),
      DATABASE_URL: target.databaseUrl, MINIO_ENDPOINT: target.endpoint, MINIO_PUBLIC_URL: target.publicUrl, MINIO_ACCESS_KEY: target.accessKeyId,
      MINIO_SECRET_KEY: target.secretAccessKey, REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      LISTING_VIDEO_API_ORIGIN: "http://localhost:3006", LISTING_VIDEO_UPLOADS_ENABLED: "true", LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "seller", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "seller,viewer",
      MINIO_REGION: target.video?.region ?? "us-east-1" };
    const worker = { ...api, RAILWAY_SERVICE_ID: "worker", LISTING_VIDEO_BUCKET_REGION: target.video?.workerRegion ?? "auto" };
    const resources = { database: { ...api, RAILWAY_SERVICE_ID: "database" }, storage: { ...api, RAILWAY_SERVICE_ID: "storage" }, redis: { ...api, RAILWAY_SERVICE_ID: "redis" } };
    const binding: DeployedBinding = { target: "staging", projectId: "disposable", environmentId: "disposable-staging",
      services: { api: "api", worker: "worker", database: "database", storage: "storage", redis: "redis" }, apiConfigHash: configurationHash(api), workerConfigHash: configurationHash(worker),
      resourceConfigHashes: { database: configurationHash(resources.database), storage: configurationHash(resources.storage), redis: configurationHash(resources.redis) },
      ownerId: "seller", viewerId: "viewer", scenarioSet: "videos", component: "scenario", compatibility: { apiCommit: "a".repeat(40), workerCommit: "a".repeat(40),
        behavior: version.behavior, schema: version.schemaHash, verifiedAt: new Date().toISOString(), ordinaryUploadAndPlayback: true } };
    deployedContext = deployedRichTarget(binding, api, worker, resources);
    deployedPlan = (await runDeployedRich(deployedContext, { mode: "plan" })).plan;
    const applied = await runDeployedRich(deployedContext, { mode: "apply", plan: deployedPlan });
    expect(applied.state).toBe("processing");
    const processing = (await db.query(`SELECT DISTINCT status FROM video_generations WHERE id LIKE 'b1131300-%'`)).rows;
    expect(processing).toEqual([{ status: "Processing" }]);
    const afterApply = await snapshot();
    const inflight = runRichScenarios(target);
    await expect(inflight).rejects.toThrow(/In-flight/);
    const refusal = await inflight.catch((error: unknown) => error instanceof Error ? error.message : String(error));
    await h.processPending();
    // Deep copies retain actual pre-worker observations, independently of test order.
    return structuredClone({ before, prior, inventory, plan, afterPlan, applied, processing, afterApply, refusal,
      afterWorker: await snapshot(), priorAfterWorker: await h.priorSnapshot(), inventoryAfterWorker: (await fullSnapshot()).slice(0, 6) });
  }
  it("plans zero draft writes at the five-draft cap, imports only Processing work, then refuses inflight reapply", () => {
    expect(imported.before[0]?.rows).toHaveLength(5);
    expect(imported.plan.planned).toMatchObject({ slots: 4, sources: 4, generations: 4, drafts: 0 });
    expect(imported.afterPlan).toEqual(imported.before);
    expect(imported.applied.state).toBe("processing");
    expect(imported.processing).toEqual([{ status: "Processing" }]);
    expect(imported.afterApply).toEqual(imported.before);
    expect(imported.refusal).toMatch(/In-flight/);
    expect(imported.afterWorker).toEqual(imported.before);
    expect(imported.priorAfterWorker).toEqual(imported.prior);
    expect(imported.inventoryAfterWorker).toEqual(imported.inventory);
  });
  it("deep-checks settled worker outputs and repeats apply without writes, with private authenticated playback", async () => {
    const before = await snapshot();
    const prior = await h.priorSnapshot();
    expect((await db.query(`SELECT status,"failureType" FROM video_generations WHERE id LIKE 'b1131300-%' ORDER BY id`)).rows).toEqual([
      { status: "Ready", failureType: null }, { status: "Ready", failureType: null }, { status: "Ready", failureType: null }, { status: "Failed", failureType: "SOURCE_INVALID" },
    ]);
    const checked = await runRichScenarios({ ...target, mode: "check" });
    expect(checked.state).toBe("installed");
    const settled = await fullSnapshot();
    const noOp = await runRichScenarios({ ...target, mode: "apply", planHash: checked.planHash });
    expect(noOp.writes).toBe(0);
    expect(await fullSnapshot()).toEqual(settled);
    expect(await snapshot()).toEqual(before);
    await h.assertProjectionAndPlayback();
    expect(await h.priorSnapshot()).toEqual(prior);
  });
  it("canonical readiness repeats the deep rich check without writes, then reports changed mapping", async () => {
    const api = createServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ service: "api", status: "ready", environment: "test",
        checks: { postgres: "ok", redis: "ok", minio: "ok" } }));
    });
    await new Promise<void>((done) => api.listen(0, "127.0.0.1", done));
    const port = (api.address() as { port: number }).port;
    const dir = await mkdtemp(join(tmpdir(), "canonical-rich-"));
    const envFile = join(dir, "api.env"); const workerFile = join(dir, "worker.env");
    const config = Object.entries({ APP_ENV: "test", NODE_ENV: "test", PORT: String(port),
      DATABASE_URL: target.databaseUrl, REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      MINIO_ENDPOINT: target.endpoint, MINIO_PUBLIC_URL: target.publicUrl, MINIO_ACCESS_KEY: target.accessKeyId,
      MINIO_SECRET_KEY: target.secretAccessKey, MINIO_REGION: target.video?.region ?? "us-east-1",
      LISTING_VIDEO_API_ORIGIN: `http://127.0.0.1:${port}`, LISTING_VIDEO_UPLOADS_ENABLED: "true",
      LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "seller", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "seller,viewer",
    }).map(([key, value]) => `${key}=${value}`).join("\n");
    await writeFile(envFile, config); await writeFile(workerFile, `${config}\nLISTING_VIDEO_BUCKET_REGION=${target.video?.workerRegion ?? "auto"}`);
    const check = async () => {
      try {
        const result = await promisify(execFile)(process.execPath, ["--import", "tsx", resolve(__dirname, "../local-fixture-readiness.ts"),
          "--api-origin", `http://127.0.0.1:${port}`, "--env-file", envFile,
          "--worker-env", workerFile, "--owner-id", "seller", "--viewer-id", "viewer"], { env: { PATH: process.env["PATH"] } });
        return { code: 0, output: result.stdout + result.stderr };
      } catch (error) {
        const result = error as { code: number; stdout: string; stderr: string };
        return { code: result.code, output: result.stdout + result.stderr };
      }
    };
    try {
      const before = await fullSnapshot();
      for (let count = 0; count < 2; count++) {
        const result = await check();
        expect(result.code, result.output).toBe(0);
        expect(result.output).toContain("READY (local environment only)");
        expect(result.output).toContain('"baselines"');
        expect(result.output).toContain('"privateDrafts"');
        expect(result.output).toContain('"writes": 0');
        expect(result.output).toContain("build/origin are unverified");
        expect(result.output).not.toContain(target.secretAccessKey);
      }
      expect(await fullSnapshot()).toEqual(before);
      await db.query("UPDATE users SET role='admin' WHERE id='viewer'");
      const changed = await fullSnapshot();
      const refused = await check();
      expect(refused.code, refused.output).toBe(1);
      expect(refused.output).toContain("Existing eligible nonprivileged owner/viewer mapping missing");
      expect(await fullSnapshot()).toEqual(changed);
      expect(await readFile(envFile, "utf8")).toBe(config);
    } finally {
      await db.query("UPDATE users SET role='buyer' WHERE id='viewer'");
      api.closeAllConnections(); await new Promise<void>((done) => api.close(() => done()));
      await rm(dir, { recursive: true, force: true });
    }
  }, 240_000);
  it("deep-checks the same deployed video inputs after real worker settlement and makes original-plan reapply write nothing", async () => {
    const before = await fullSnapshot();
    expect((await runDeployedRich(deployedContext, { mode: "check" })).state).toBe("installed");
    expect((await runDeployedRich(deployedContext, { mode: "apply", plan: deployedPlan })).writes).toBe(0);
    expect(await fullSnapshot()).toEqual(before);
  });
  it("refuses partial output, a changed active pointer, and a foreign slot without writes", async () => {
    const row = (await db.query('SELECT manifest FROM video_generations WHERE id=$1', ["b1131300-0000-4000-8000-000000000001"])).rows[0];
    const key = row.manifest.master.key;
    const original = await s3.send(new GetObjectCommand({ Bucket: "listing-videos", Key: key }));
    if (!original.Body) throw new Error("Stored master has no body");
    const bytes = await original.Body.transformToByteArray();
    const before = await fullSnapshot();
    await s3.send(new DeleteObjectCommand({ Bucket: "listing-videos", Key: key }));
    await expect(runRichScenarios(target)).rejects.toThrow(key);
    expect(await fullSnapshot()).toEqual(before);
    await s3.send(new PutObjectCommand({ Bucket: "listing-videos", Key: key, Body: bytes, ContentType: original.ContentType }));
    await db.query('UPDATE listing_videos SET "activeGenerationId"=NULL WHERE id=$1', ["b1131100-0000-4000-8000-000000000001"]);
    const changed = await fullSnapshot();
    await expect(runRichScenarios(target)).rejects.toThrow("Modified Ready");
    expect(await fullSnapshot()).toEqual(changed);
    await db.query('UPDATE listing_videos SET "activeGenerationId"=$1 WHERE id=$2', ["b1131300-0000-4000-8000-000000000001", "b1131100-0000-4000-8000-000000000001"]);
    await db.query(`UPDATE listing_videos SET "ownerId"='viewer' WHERE id=$1`, ["b1131100-0000-4000-8000-000000000001"]);
    const foreign = await fullSnapshot();
    await expect(runRichScenarios(target)).rejects.toThrow("Foreign/changed slot");
    expect(await fullSnapshot()).toEqual(foreign);
    await db.query(`UPDATE listing_videos SET "ownerId"='seller' WHERE id=$1`, ["b1131100-0000-4000-8000-000000000001"]);
  });
  it("owns an optional recovery copy at the five-draft cap and retires only its exact source while processing races cleanup", async () => {
    const recovery = { ...target, scenarioSet: "video-recovery" as const };
    const protectedBefore = await snapshot();
    const plan = await runRichScenarios(recovery);
    expect(plan.planned).toMatchObject({ drafts: 0, slots: 1, photos: { listings: 1, media: 10 } });
    expect("photoCopy" in plan && plan.photoCopy?.objects).toHaveLength(51);
    await runRichScenarios({ ...recovery, mode: "apply", planHash: plan.planHash });
    expect(await snapshot()).toEqual(protectedBefore);
    const sourceId = "b1131200-0000-4000-8000-000000000005";
    const generationId = "b1131300-0000-4000-8000-000000000005";
    await h.processInvalid({ sourceId, generationId, attempt: 1 });
    const failed = await runRichScenarios(recovery);
    expect(failed.state).toBe("installed");
    await expect(runRichScenarios({ ...recovery, retireSourceId: "b1131200-0000-4000-8000-000000000001" })).rejects.toThrow("Exact generation missing");
    // Choose another through the existing application/domain lifecycle, followed by a real multipart upload.
    const replacement = await h.replaceRecovery();
    await expect(runRichScenarios(recovery)).rejects.toThrow("Modified/consumed generation");
    const gate = h.delayNextPut();
    const processing = h.process(replacement);
    await gate.started;
    const retiring = { ...recovery, retireSourceId: replacement.sourceId };
    const retirePlan = await runRichScenarios(retiring);
    const retired = await runRichScenarios({ ...retiring, mode: "apply", planHash: retirePlan.planHash });
    expect(retired.state).toBe("retired");
    await h.clean();
    gate.release();
    await expect(processing).rejects.toThrow();
    await h.clean();
    expect((await db.query('SELECT status FROM video_upload_cleanups WHERE "sourceId"=$1', [replacement.sourceId])).rows).toEqual([{ status: "DONE" }]);
    expect((await s3.send(new ListObjectsV2Command({ Bucket: "listing-videos", Prefix: `video-sources/${replacement.sourceId}/` }))).Contents ?? []).toEqual([]);
    expect((await db.query('SELECT "activeGenerationId","pendingGenerationId" FROM listing_videos WHERE id=$1', ["b1131100-0000-4000-8000-000000000005"])).rows).toEqual([{ activeGenerationId: null, pendingGenerationId: null }]);
    expect((await db.query('SELECT status FROM video_upload_cleanups WHERE "sourceId"=$1', [sourceId])).rows).toEqual([{ status: "DONE" }]);
    await h.deleteRecovery();
    expect(await snapshot()).toEqual(protectedBefore);
    expect((await runRichScenarios(target)).writes).toBe(0);
  }, 240_000);
  async function harness(endpoint: string, redisUrl: string) {
    // Cross-app integration loads the existing implementation without changing either app's TS root.
    const workerRoot = resolve(__dirname, "../../../../apps/worker");
    const apiRoot = resolve(__dirname, "../../../../apps/api");
    const { PrismaService } = await import(resolve(__dirname, "../../dist/src/index.js"));
    const { ListingVideoProcessor } = await import(resolve(workerRoot, "src/video/ListingVideoProcessor"));
    const { VideoProcessingScheduler } = await import(resolve(workerRoot, "src/video/VideoProcessingScheduler"));
    const { S3VideoProcessingStorage } = await import(resolve(workerRoot, "src/video/VideoProcessingStorage"));
    const { Queue, Worker } = await import(resolve(workerRoot, "node_modules/bullmq/dist/cjs/index.js"));
    const { ConfigService } = await import(resolve(apiRoot, "node_modules/@nestjs/config/dist/index.js"));
    const { ConfigListingVideoAccess } = await import(resolve(apiRoot, "src/common/ConfigListingVideoAccess"));
    const { PrismaListingVideoReadRepository } = await import(resolve(apiRoot, "src/modules/listings/infrastructure/PrismaListingVideoReadRepository"));
    const { PrismaIdentityCheckAdapter } = await import(resolve(apiRoot, "src/modules/identity/infrastructure/PrismaIdentityCheckAdapter"));
    const { BucketVideoStorage } = await import(resolve(apiRoot, "src/modules/listings/infrastructure/BucketVideoStorage"));
    const { PrismaVideoServingRepository } = await import(resolve(apiRoot, "src/modules/listings/infrastructure/PrismaVideoServingRepository"));
    const { PrismaSessionRepository } = await import(resolve(apiRoot, "src/modules/identity/infrastructure/PrismaSessionRepository"));
    const { RefreshTokenDigestAdapter } = await import(resolve(apiRoot, "src/modules/identity/infrastructure/RefreshTokenDigestAdapter"));
    const { ServeListingVideo } = await import(resolve(apiRoot, "src/modules/listings/application/ServeListingVideo"));
    const prisma = new PrismaService();
    let beforePut: (() => Promise<void>) | undefined;
    class ControlledOutputs extends S3VideoProcessingStorage {
      async put(key: string, body: Buffer, contentType: string, etag?: string) {
        const hook = beforePut; beforePut = undefined; if (hook) await hook();
        return super.put(key, body, contentType, etag);
      }
    }
    const StorageClass = ControlledOutputs as unknown as new (storage: S3Client, bucket: string) => InstanceType<typeof ControlledOutputs>;
    const workerStorage = new S3Client({ endpoint, forcePathStyle: true, region: target.video?.workerRegion, credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
    const outputs = new StorageClass(workerStorage, "listing-videos");
    const processor = new ListingVideoProcessor(prisma, outputs);
    const queue = new Queue("rich-video", { connection: { url: redisUrl } });
    const scheduler = new VideoProcessingScheduler(prisma, queue);
    const config = new ConfigService({ APP_ENV: "test", MINIO_ENDPOINT: endpoint, MINIO_PUBLIC_URL: endpoint, MINIO_REGION: target.video?.region, MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin",
      LISTING_VIDEO_VIEW_TESTER_USER_IDS: "seller,viewer", LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "seller", LISTING_VIDEO_UPLOADS_ENABLED: true,
      LISTING_VIDEO_API_ORIGIN: "http://localhost:3006", JWT_ACCESS_SECRET: "disposable-rich-test" });
    const { PrismaVideoUploadRepository } = await import(resolve(apiRoot, "src/modules/listings/infrastructure/PrismaVideoUploadRepository"));
    const { PrismaListingDraftRepository } = await import(resolve(apiRoot, "src/modules/listings/infrastructure/PrismaListingDraftRepository"));
    const { PrismaListingRepository } = await import(resolve(apiRoot, "src/modules/listings/infrastructure/PrismaListingRepository"));
    const { VideoUploadSessions } = await import(resolve(apiRoot, "src/modules/listings/application/VideoUploadSessions"));
    const { DeleteListing } = await import(resolve(apiRoot, "src/modules/listings/application/DeleteListing"));
    let now = new Date();
    const access = new ConfigListingVideoAccess(config);
    const lifecycle = new VideoUploadSessions(new PrismaVideoUploadRepository(prisma), new BucketVideoStorage(config), access,
      new PrismaListingDraftRepository(prisma), new PrismaListingRepository(prisma), () => now);
    const deleteListing = new DeleteListing(new PrismaListingRepository(prisma), prisma, { emit: async () => undefined });
    const identity = new PrismaIdentityCheckAdapter(prisma);
    const read = new PrismaListingVideoReadRepository(prisma, access, identity);
    const serving = new ServeListingVideo(new PrismaVideoServingRepository(prisma), new BucketVideoStorage(config), identity,
      new PrismaSessionRepository(prisma, new RefreshTokenDigestAdapter()), { now: () => new Date() }, access, config);
    return {
      async priorVideo() {
        await prisma.listing.create({ data: { id: "prior-listing", sellerId: "seller", status: "active", brandId: "brand", modelId: "model", cityId: "city", priceAmount: 123 } });
        const { readFile } = await import("node:fs/promises");
        const body = await readFile(resolve(__dirname, "synthetic-video/v1/portrait.mp4"));
        const opened = await lifecycle.open({ userId: "seller", target: { type: "listing", id: "prior-listing" }, contentType: "video/mp4", sizeBytes: body.length, coverOffsetMs: 500 });
        const uploaded = await fetch(opened.parts[0].uploadUrl, { method: "PUT", body });
        expect(uploaded.status).toBe(200); await uploaded.arrayBuffer();
        await lifecycle.complete({ userId: "seller", sessionId: opened.sessionId });
        await processor.process({ sourceId: opened.sessionId, generationId: opened.generationId, attempt: 1 });
      },
      priorSnapshot: () => prisma.listingVideo.findFirst({ where: { listingId: "prior-listing" }, include: { sources: true, generations: true } }),
      process: (job: { sourceId: string; generationId: string; attempt: number }) => processor.process(job),
      async processInvalid(job: { sourceId: string; generationId: string; attempt: number }) { await expect(processor.process(job)).rejects.toThrow("invalid"); },
      delayNextPut() {
        let entered!: () => void; let release!: () => void;
        const started = new Promise<void>((done) => { entered = done; });
        const gate = new Promise<void>((done) => { release = done; });
        beforePut = async () => { entered(); await gate; };
        return { started, release };
      },
      async replaceRecovery() {
        const target = { type: "listing", id: "b1131000-0000-4000-8000-000000000005" };
        await lifecycle.remove({ userId: "seller", target });
        const { readFile } = await import("node:fs/promises");
        const body = await readFile(resolve(__dirname, "synthetic-video/v1/portrait.mp4"));
        const opened = await lifecycle.open({ userId: "seller", target, contentType: "video/mp4", sizeBytes: body.length, coverOffsetMs: 500 });
        const response = await fetch(opened.parts[0].uploadUrl, { method: "PUT", body });
        expect(response.status).toBe(200); await response.arrayBuffer();
        await lifecycle.complete({ userId: "seller", sessionId: opened.sessionId });
        return { sourceId: opened.sessionId, generationId: opened.generationId, attempt: 1 };
      },
      async clean() { now = new Date(now.getTime() + 2 * 60 * 60 * 1000); await lifecycle.retryCleanup(100); },
      deleteRecovery: () => deleteListing.execute({ userId: "seller", listingId: "b1131000-0000-4000-8000-000000000005" }),
      async processPending() {
        await scheduler.enqueuePending();
        const jobs = await queue.getJobs(["waiting"]);
        expect(jobs).toHaveLength(4);
        const terminal = new Promise<void>((done, reject) => {
          let count = 0;
          const worker = new Worker("rich-video", async (job: { data: { sourceId: string; generationId: string; attempt: number } }) => processor.process(job.data), { connection: { url: redisUrl }, concurrency: 1 });
          const timer = setTimeout(() => { void worker.close(true); reject(new Error("Real worker did not settle all four imported jobs")); }, 45_000);
          const settled = () => { if (++count === 4) { clearTimeout(timer); void worker.close().then(done, reject); } };
          worker.on("completed", settled); worker.on("failed", settled); worker.on("error", reject);
        });
        await terminal;
        expect((await prisma.videoGeneration.findMany({ where: { id: { startsWith: "b1131300-" } }, orderBy: { id: "asc" }, select: { status: true, failureType: true } }))).toEqual([
          { status: "Ready", failureType: null }, { status: "Ready", failureType: null }, { status: "Ready", failureType: null }, { status: "Failed", failureType: "SOURCE_INVALID" },
        ]);
      },
      async assertProjectionAndPlayback() {
        const draft = { type: "draft", id: "b1130000-0000-4000-8000-000000000003" };
        expect((await read.getForTarget(draft, "seller"))?.video).toMatchObject({ galleryIndex: 1, durationMs: 6000 });
        expect(await read.getForTarget(draft, "viewer")).toBeNull();
        expect((await read.getForTarget({ type: "draft", id: "b1130000-0000-4000-8000-000000000002" }, "seller"))?.pendingVideo).toMatchObject({ status: "failed", failureType: "SOURCE_INVALID", canReprocess: false });
        await prisma.session.create({ data: { id: "seller-session", userId: "seller", refreshTokenHash: "disposable-test", expiresAt: new Date(Date.now() + 60_000) } });
        await prisma.session.create({ data: { id: "viewer-session", userId: "viewer", refreshTokenHash: "disposable-viewer-test", expiresAt: new Date(Date.now() + 60_000) } });
        for (const [actor, audience, type, id] of [
          [{ sub: "seller", sid: "seller-session" }, "owner-preview", "draft", draft.id],
          [{ sub: "viewer", sid: "viewer-session" }, "viewer", "listing", "b1126000-0000-4000-8000-000000000001"],
        ] as const) {
          const playback = await serving.control(actor, audience, type, id, true);
          expect(playback.status).toBe("ready");
          const url = new URL(playback.url);
          const parts = url.pathname.split("/");
          const result = await serving.file({ audience, videoId: playback.video.id, generationId: playback.video.generationId, resource: parts.at(-1), token: url.searchParams.get("grant"), head: false });
          expect(result.status).toBe(200); expect(result.body.toString()).toContain("#EXTM3U");
          await expect(serving.control({ sub: "viewer", sid: "viewer-session" }, "owner-preview", "draft", draft.id, true)).rejects.toThrow();
        }
      },
      close: async () => { workerStorage.destroy(); await queue.close(); await prisma.onModuleDestroy(); },
    };
  }

});
