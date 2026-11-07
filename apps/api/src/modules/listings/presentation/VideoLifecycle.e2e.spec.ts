import "reflect-metadata";

import { execFile, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PrismaService } from "@auto-tm/db";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { EnvSchema } from "../../../env.schema";
import { VideoUploadSessions } from "../application/VideoUploadSessions";
import { BucketVideoStorage } from "../infrastructure/BucketVideoStorage";
import { PrismaVideoUploadRepository } from "../infrastructure/PrismaVideoUploadRepository";
import { PrismaListingDraftRepository } from "../infrastructure/PrismaListingDraftRepository";
import { PrismaListingRepository } from "../infrastructure/PrismaListingRepository";
import { PrismaListingVideoReadRepository } from "../infrastructure/PrismaListingVideoReadRepository";
import type { VideoUploadTarget } from "../domain/VideoUpload";

const enabled = process.env["VIDEO_STORAGE_E2E"] === "1" || process.env["GITHUB_ACTIONS"] === "true";
const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
const hasFfmpeg = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status === 0;
const exec = promisify(execFile);

function barrier() {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { started, release, wait: async () => { entered(); await gate; } };
}

describe.skipIf(!enabled || !hasFfmpeg)("video lifecycle on Postgres and MinIO (#1042)", () => {
  const suite = defineE2eSuite(`video-lifecycle-${randomUUID().slice(0, 8)}`);
  const users: string[] = [];
  const sourceIds: string[] = [];
  const listingIds: string[] = [];
  let prisma: PrismaService;
  let s3: S3Client;
  let storage: BucketVideoStorage;
  interface ProcessingStorage {
    bucket: string;
    initialize(key: string, type: string): Promise<string>;
    put(key: string, bytes: Buffer, type: string, etag?: string): Promise<void>;
    head(key: string): Promise<{ sizeBytes: number } | null>;
  }
  let StorageClass: new (s3: S3Client, bucket: string) => ProcessingStorage;
  let Processor: new (prisma: PrismaService, storage: ProcessingStorage) => { process(job: { sourceId: string; generationId: string; attempt: number }): Promise<void> };
  let Transcoder: new (processor: InstanceType<typeof Processor>) => { process(job: { data: { sourceId: string; generationId: string; attempt: number }; attemptsStarted: number }): Promise<void> };
  let Purge: new (prisma: PrismaService) => { execute(input: { now: Date }): Promise<unknown> };
  let outputs: ProcessingStorage;
  let repo: PrismaVideoUploadRepository;
  let drafts: PrismaListingDraftRepository;
  let listings: PrismaListingRepository;
  let sessions: VideoUploadSessions;
  let fixtureDir: string;
  let body: Buffer;
  let now = new Date();
  let beforePut: (() => Promise<void>) | undefined;
  let beforeInitialize: (() => Promise<void>) | undefined;
  let beforeComplete: (() => Promise<void>) | undefined;
  let completionUncertain = false;

  class ControlledStorage extends BucketVideoStorage {
    override async completeMultipart(input: Parameters<BucketVideoStorage["completeMultipart"]>[0]) {
      if (completionUncertain) throw new Error("TimeoutError");
      const hook = beforeComplete; beforeComplete = undefined;
      if (hook) await hook();
      return super.completeMultipart(input);
    }
  }

  beforeAll(async () => {
    // Integration crosses two separately compiled Nest apps, as the Admin API
    // bridge tests do. Dynamic loading keeps their TypeScript roots separate.
    const workerRoot = resolve(__dirname, "../../../../../worker/src");
    ({ ListingVideoProcessor: Processor } = await import(join(workerRoot, "video/ListingVideoProcessor")));
    ({ VideoTranscodeProcessor: Transcoder } = await import(join(workerRoot, "queues/video-transcode.processor")));
    ({ S3VideoProcessingStorage: StorageClass } = await import(join(workerRoot, "video/VideoProcessingStorage")));
    ({ PurgeExpiredAccounts: Purge } = await import(join(workerRoot, "jobs/PurgeExpiredAccounts")));
  class ControlledOutputs extends StorageClass {
    override async initialize(key: string, type: string) {
      const hook = beforeInitialize; beforeInitialize = undefined;
      if (hook) await hook();
      return super.initialize(key, type);
    }
    override async put(key: string, bytes: Buffer, type: string, etag?: string) {
      const hook = beforePut; beforePut = undefined;
      if (hook) await hook();
      return super.put(key, bytes, type, etag);
    }
  }
    prisma = new PrismaService();
    await seedSuiteCatalog(prisma, suite);
    const env = EnvSchema.parse(process.env);
    storage = new ControlledStorage(new ConfigService(env));
    s3 = new S3Client({ endpoint: env.MINIO_ENDPOINT, region: env.MINIO_REGION, forcePathStyle: true, maxAttempts: 1,
      credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY } });
    outputs = new ControlledOutputs(s3, storage.bucket);
    repo = new PrismaVideoUploadRepository(prisma);
    drafts = new PrismaListingDraftRepository(prisma);
    listings = new PrismaListingRepository(prisma);
    sessions = new VideoUploadSessions(repo, storage, { canUploadVideo: () => true, canResumeVideo: () => true }, drafts, listings, () => now);
    fixtureDir = await mkdtemp(join(tmpdir(), "video-lifecycle-"));
    const path = join(fixtureDir, "source.mp4");
    await exec(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", path]);
    body = await readFile(path);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    for (const sourceId of sourceIds) {
      const work = await prisma.videoUploadCleanup.findUnique({ where: { sourceId } });
      if (work?.multipartUploadId) await storage.abortMultipart({ key: work.objectKey, uploadId: work.multipartUploadId }).catch(() => undefined);
      for (const key of await storage.listObjects(`video-sources/${sourceId}/`)) await storage.deleteObject(key);
    }
    await prisma.videoUploadCleanup.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await prisma.videoOutputReservation.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await prisma.city.deleteMany({ where: { id: suite.catalog.cityId } });
    await prisma.region.deleteMany({ where: { id: suite.catalog.regionId } });
    await prisma.model.deleteMany({ where: { id: suite.catalog.modelId } });
    await prisma.brand.deleteMany({ where: { id: suite.catalog.brandId } });
    await prisma.onModuleDestroy(); s3.destroy();
    await rm(fixtureDir, { recursive: true, force: true });
  });

  async function target(type: "listing" | "draft" = "listing") {
    const userId = randomUUID(); users.push(userId);
    await prisma.user.create({ data: { id: userId } });
    if (type === "draft") {
      const draft = await prisma.listingDraft.create({ data: { userId, payload: {} } });
      return { userId, target: { type, id: draft.id } as VideoUploadTarget };
    }
    const listing = await prisma.listing.create({ data: { sellerId: userId, status: "active", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 10_000, priceCurrency: "TMT" } });
    listingIds.push(listing.id);
    return { userId, target: { type, id: listing.id } as VideoUploadTarget };
  }

  async function upload(input: Awaited<ReturnType<typeof target>>, complete = true, bytes = body) {
    const opened = await sessions.open({ ...input, contentType: "video/mp4", sizeBytes: bytes.length, coverOffsetMs: 500 });
    sourceIds.push(opened.sessionId);
    const part = opened.parts[0]!;
    const response = await fetch(part.uploadUrl, { method: "PUT", body: bytes });
    expect(response.status).toBe(200); await response.arrayBuffer();
    if (complete) await sessions.complete({ userId: input.userId, sessionId: opened.sessionId });
    return { sourceId: opened.sessionId, generationId: opened.generationId, attempt: 1 };
  }

  async function slot(input: Awaited<ReturnType<typeof target>>) { return repo.findSlotForTarget(input.userId, input.target); }
  async function publicGeneration(input: Awaited<ReturnType<typeof target>>) {
    return (await new PrismaListingVideoReadRepository(prisma).getForListings([input.target.id])).get(input.target.id)?.video?.generationId;
  }
  async function clean() {
    // Exercise the retry interface with a deterministic clock, including work
    // recorded by DB CURRENT_TIMESTAMP and worker retirement.
    now = new Date(Math.max(Date.now(), now.getTime()) + 2 * 60 * 60 * 1000);
    await sessions.retryCleanup(1000);
  }
  async function gone(sourceId: string) {
    expect(await storage.listObjects(`video-sources/${sourceId}/`)).toEqual([]);
    expect(await prisma.videoUploadCleanup.findUnique({ where: { sourceId } })).toMatchObject({ status: "DONE" });
  }
  const processJob = (job: Awaited<ReturnType<typeof upload>>) => new Processor(prisma, outputs).process(job);

  it("keeps A until B is fully Ready, atomically switches, cleans all A assets and ignores repeated A jobs", async () => {
    const input = await target();
    const a = await upload(input); await processJob(a);
    expect(await slot(input)).toMatchObject({ activeGenerationId: a.generationId, pendingGenerationId: null });
    expect(await publicGeneration(input)).toBe(a.generationId);
    const aKeys = await storage.listObjects(`video-sources/${a.sourceId}/`);
    expect(aKeys.some((key) => key.endsWith(".ts"))).toBe(true);
    expect(aKeys.some((key) => key.endsWith("master.m3u8"))).toBe(true);
    const b = await upload(input);
    const gate = barrier(); beforePut = gate.wait;
    const processing = processJob(b);
    await gate.started;
    try {
      expect(await slot(input)).toMatchObject({ activeGenerationId: a.generationId, pendingGenerationId: b.generationId });
      expect(await publicGeneration(input)).toBe(a.generationId);
      await expect(processJob(b)).rejects.toThrow("duplicate delivery");
      expect(await prisma.videoGeneration.findUnique({ where: { id: b.generationId } })).toMatchObject({ status: "Processing", processingAttempt: 1 });
      await clean(); expect(await storage.listObjects(`video-sources/${a.sourceId}/`)).toEqual(aKeys);
    } finally { gate.release(); }
    await processing;
    expect(await slot(input)).toMatchObject({ activeGenerationId: b.generationId, pendingGenerationId: null });
    expect(await publicGeneration(input)).toBe(b.generationId);
    await clean(); await gone(a.sourceId);
    await processJob(a); await processJob(b);
    expect(await slot(input)).toMatchObject({ activeGenerationId: b.generationId });
    expect(await storage.listObjects(`video-sources/${b.sourceId}/`)).not.toEqual([]);
  });

  it("cancelling an inflight replacement keeps A and fences every late B write and repeated cancel", async () => {
    const input = await target();
    const a = await upload(input); await processJob(a);
    const b = await upload(input);
    const gate = barrier(); beforePut = gate.wait;
    const processing = processJob(b).catch((error: unknown) => error);
    await gate.started;
    try {
      await sessions.cancel({ userId: input.userId, sessionId: b.sourceId });
      await sessions.cancel({ userId: input.userId, sessionId: b.sourceId });
      expect(await slot(input)).toMatchObject({ activeGenerationId: a.generationId, pendingGenerationId: null });
      await clean(); await gone(b.sourceId);
    } finally { gate.release(); }
    expect(await processing).toBeInstanceOf(Error);
    await processJob(b); await gone(b.sourceId);
    expect(await storage.headObject(`video-sources/${a.sourceId}/source.mp4`)).not.toBeNull();
  });

  it("rechecks a ban at Ready publication and preserves the active generation", async () => {
    const input = await target();
    const a = await upload(input); await processJob(a);
    const b = await upload(input);
    const gate = barrier(); beforePut = gate.wait;
    const processing = processJob(b).catch((error: unknown) => error);
    await gate.started;
    try { await prisma.listing.update({ where: { id: input.target.id }, data: { status: "banned" } }); }
    finally { gate.release(); }
    expect(await processing).toMatchObject({ message: "Video target is ineligible" });
    expect(await slot(input)).toMatchObject({ activeGenerationId: a.generationId, pendingGenerationId: b.generationId });
    expect(await prisma.videoGeneration.findUnique({ where: { id: b.generationId } })).toMatchObject({ status: "Processing", processingAttempt: 2 });
  });

  it("preserves A on pending failure and cancellation, and removes A plus an inflight replacement without resurrection", async () => {
    const input = await target();
    const a = await upload(input); await processJob(a);
    const broken = await upload(input, true, Buffer.from("invalid mp4"));
    await expect(processJob(broken)).rejects.toThrow("invalid");
    expect(await slot(input)).toMatchObject({ activeGenerationId: a.generationId, pendingGenerationId: broken.generationId });
    await sessions.cancel({ userId: input.userId, sessionId: broken.sourceId });
    expect(await slot(input)).toMatchObject({ activeGenerationId: a.generationId, pendingGenerationId: null });
    await clean(); await gone(broken.sourceId);
    const b = await upload(input);
    const gate = barrier(); beforePut = gate.wait;
    const processing = processJob(b).catch((error: unknown) => error);
    await gate.started;
    try {
      await sessions.remove(input);
      expect(await slot(input)).toMatchObject({ activeGenerationId: null, pendingGenerationId: null });
      expect(await publicGeneration(input)).toBeUndefined();
      await clean(); await gone(a.sourceId); await gone(b.sourceId);
    } finally { gate.release(); }
    expect(await processing).toBeInstanceOf(Error);
    await processJob(b); await gone(b.sourceId);
    expect(await slot(input)).toMatchObject({ activeGenerationId: null, pendingGenerationId: null });
  });

  it.each(["listing", "draft", "purge"] as const)("%s deletion drains inflight initialization, deletes partial outputs and leaves photos intact", async (action) => {
    const input = await target(action === "draft" ? "draft" : "listing");
    const photo = `photos/${input.userId}/keep.webp`;
    await outputs.put(photo, Buffer.from("photo"), "image/webp");
    const job = await upload(input);
    const gate = barrier(); beforeInitialize = gate.wait;
    const processing = processJob(job).catch((error: unknown) => error);
    await gate.started;
    let deleting: Promise<unknown>;
    if (action === "listing") deleting = listings.softDelete(input.target.id, now);
    else if (action === "draft") deleting = drafts.delete(input.target.id);
    else {
      await prisma.user.update({ where: { id: input.userId }, data: { deletionScheduledAt: now } });
      deleting = new Purge(prisma).execute({ now });
    }
    try {
      const deadline = Date.now() + 3000;
      for (;;) {
        const [state] = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
        if (Number(state?.waiting) > 0) break;
        if (Date.now() > deadline) throw new Error("Deletion never reached the inflight generation lock");
      }
    } finally { gate.release(); }
    await deleting; await processing;
    await clean(); await gone(job.sourceId);
    await processJob(job); await gone(job.sourceId);
    expect(await outputs.head(photo)).toMatchObject({ sizeBytes: 5 });
    await storage.deleteObject(photo);
  });

  it("settles a delayed multipart completion before cleanup and its later delivery cannot recreate the source", async () => {
    const input = await target();
    const job = await upload(input, false);
    const gate = barrier(); beforeComplete = gate.wait;
    const completing = sessions.complete({ userId: input.userId, sessionId: job.sourceId }).catch((error: unknown) => error);
    await gate.started;
    try {
      await sessions.remove(input);
      await clean(); await gone(job.sourceId);
    } finally { gate.release(); }
    await completing; await clean(); await gone(job.sourceId);
    expect(await slot(input)).toMatchObject({ activeGenerationId: null, pendingGenerationId: null });
  });

  it("retains durable cleanup through an uncertain initialization and removes its late unmanifested object", async () => {
    const input = await target();
    const job = await upload(input);
    let deliver!: () => Promise<string>;
    class UncertainStorage extends StorageClass {
      override async initialize(key: string, type: string): Promise<string> {
        deliver = () => super.initialize(key, type);
        throw new Error("TimeoutError");
      }
    }
    await expect(new Processor(prisma, new UncertainStorage(s3, storage.bucket)).process(job)).rejects.toThrow("TimeoutError");
    await sessions.remove(input); await clean();
    expect(await storage.listObjects(`video-sources/${job.sourceId}/`)).toEqual([]);
    expect(await prisma.videoUploadCleanup.findUnique({ where: { sourceId: job.sourceId } })).toMatchObject({ status: "PENDING" });
    await deliver(); await clean(); await gone(job.sourceId);
  });

  it("keeps uncertain completion cleanup pending when Remove is followed by Cancel", async () => {
    const input = await target();
    const job = await upload(input, false);
    completionUncertain = true;
    try {
      await expect(sessions.complete({ userId: input.userId, sessionId: job.sourceId })).rejects.toThrow("TimeoutError");
      await sessions.remove(input); await clean();
      await sessions.cancel({ userId: input.userId, sessionId: job.sourceId });
      expect(await prisma.videoUploadCleanup.findUnique({ where: { sourceId: job.sourceId } })).toMatchObject({ status: "PENDING", completionPending: true });
    } finally { completionUncertain = false; }
    await clean(); await gone(job.sourceId);
  });

  it("recovers a stalled delivery into a fresh attempt and fences its late writes", async () => {
    const input = await target();
    const job = await upload(input);
    const gate = barrier(); beforePut = gate.wait;
    const connection = new Redis(process.env["REDIS_URL"]!, { maxRetriesPerRequest: null });
    const name = `video-recovery-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    const transcoder = new Transcoder(new Processor(prisma, outputs));
    let firstRun: Promise<void> | undefined;
    const first = new Worker(name, (delivery) => { firstRun = transcoder.process(delivery); return firstRun; }, { connection, lockDuration: 300, skipLockRenewal: true, stalledInterval: 100 });
    first.on("error", () => undefined); // The deliberately abandoned lock is lost.
    let recovery: Worker | undefined;
    try {
      await queue.add("process", job, { jobId: `${job.generationId}-1`, attempts: 1 });
      await gate.started;
      await first.close(true);
      recovery = new Worker(name, (delivery) => transcoder.process(delivery), { connection, stalledInterval: 100 });
      recovery.on("error", () => undefined);
      const completed = () => new Promise<void>((resolve, reject) => { recovery!.once("completed", () => resolve()); recovery!.once("failed", (_job, error) => reject(error)); });
      await completed();
      expect(await repo.findSession(job.sourceId)).toMatchObject({ generation: { status: "Processing", processingAttempt: 2 } });
      gate.release(); await firstRun?.catch(() => undefined);
      const ready = completed();
      await queue.add("process", { ...job, attempt: 2 }, { jobId: `${job.generationId}-2`, attempts: 1 });
      await ready;
      expect(await publicGeneration(input)).toBe(job.generationId);
      expect((await storage.listObjects(`video-sources/${job.sourceId}/`)).some((key) => key.includes("/processing/2/"))).toBe(true);
      await sessions.remove(input); await clean(); await gone(job.sourceId);
    } finally {
      gate.release(); await firstRun?.catch(() => undefined);
      await first.close(true); await recovery?.close(true);
      await queue.obliterate({ force: true }); await queue.close(); connection.disconnect();
    }
  });
});
