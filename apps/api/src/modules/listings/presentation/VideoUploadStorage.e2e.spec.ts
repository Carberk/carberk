import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { PrismaService } from "@auto-tm/db";
import { VideoUploadsSchemas } from "@auto-tm/contracts";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import { VideoUploadSessions, VIDEO_UPLOAD_NOW } from "../application/VideoUploadSessions";
import { VIDEO_STORAGE_PORT } from "../domain/ports/VideoStoragePort";
import { VIDEO_UPLOAD_REPOSITORY } from "../domain/ports/VideoUploadRepository";
import { VIDEO_UPLOAD_ACCESS_PORT } from "../domain/ports/VideoUploadAccessPort";
import { LISTING_DRAFT_REPOSITORY } from "../domain/ports/ListingDraftRepository";
import { LISTING_REPOSITORY } from "../domain/ports/ListingRepository";
import { BucketVideoStorage } from "../infrastructure/BucketVideoStorage";
import { ConfigVideoUploadAccess } from "../infrastructure/ConfigVideoUploadAccess";
import { PrismaVideoUploadRepository } from "../infrastructure/PrismaVideoUploadRepository";
import { PrismaListingDraftRepository } from "../infrastructure/PrismaListingDraftRepository";
import { PrismaListingRepository } from "../infrastructure/PrismaListingRepository";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { GetTargetVideoStatus } from "../application/GetTargetVideoStatus";
import { LISTING_VIDEO_READ_PORT } from "../domain/ports/ListingVideoReadPort";
import { PrismaListingVideoReadRepository } from "../infrastructure/PrismaListingVideoReadRepository";
import { VideoUploadsController } from "./VideoUploadsController";

const enabled = process.env["VIDEO_STORAGE_E2E"] === "1" || process.env["GITHUB_ACTIONS"] === "true";

describe.skipIf(!enabled)("video upload API on Postgres and real storage (#1041)", () => {
  const suite = defineE2eSuite(`video-${randomUUID().slice(0, 8)}`);
  const owner = randomUUID();
  const other = randomUUID();
  const foreign = randomUUID();
  const sources = new Map<string, { objectKey: string; multipartUploadId: string }>();
  let now = new Date("2026-11-06T00:00:00.000Z");
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let storage: BucketVideoStorage;
  let queue: Queue;
  let uploadsEnabled = true;
  let testerIds = [owner, other];
  let beforeComplete: (() => Promise<void>) | undefined;
  class ControlledStorage extends BucketVideoStorage {
    override async completeMultipart(input: Parameters<BucketVideoStorage["completeMultipart"]>[0]): Promise<void> {
      const hook = beforeComplete;
      beforeComplete = undefined;
      if (hook) await hook();
      return super.completeMultipart(input);
    }
  }
  const auth = (id: string = owner) => ({ Authorization: `Bearer ${mintUserJwt(id)}` });

  async function start() {
    const env = EnvSchema.parse({ ...process.env,
      LISTING_VIDEO_UPLOADS_ENABLED: String(uploadsEnabled),
      LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: testerIds.join(","),
    });
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me" })],
      controllers: [VideoUploadsController],
      providers: [
        PrismaService, VideoUploadSessions, GetTargetVideoStatus,
        { provide: LISTING_VIDEO_READ_PORT, useClass: PrismaListingVideoReadRepository },
        { provide: getQueueToken("video-transcode"), useValue: queue },
        { provide: ConfigService, useValue: new ConfigService(env) },
        { provide: VIDEO_STORAGE_PORT, useClass: ControlledStorage },
        { provide: VIDEO_UPLOAD_REPOSITORY, useClass: PrismaVideoUploadRepository },
        { provide: VIDEO_UPLOAD_ACCESS_PORT, useClass: ConfigVideoUploadAccess },
        { provide: LISTING_DRAFT_REPOSITORY, useClass: PrismaListingDraftRepository },
        { provide: LISTING_REPOSITORY, useClass: PrismaListingRepository },
        { provide: VIDEO_UPLOAD_NOW, useValue: () => now },
        { provide: IDENTITY_CHECK_PORT, useValue: {
          isSuspended: async (id: string) => Boolean((await prisma.user.findUnique({ where: { id } }))?.suspendedAt),
          isDeletionScheduled: async (id: string) => Boolean((await prisma.user.findUnique({ where: { id } }))?.deletionScheduledAt),
        } },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    prisma = app.get(PrismaService);
    storage = app.get(VIDEO_STORAGE_PORT);
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  }

  beforeAll(async () => {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) throw new Error("Video handoff integration tests require REDIS_URL");
    queue = new Queue("video-transcode", { connection: { url: redisUrl }, prefix: `test-video-upload-${randomUUID()}` });
    await start();
    await seedSuiteCatalog(prisma, suite);
    for (const id of [owner, other, foreign]) await prisma.user.create({ data: { id } });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    // Exact keys returned by our own persisted sessions only. No bucket sweep.
    for (const source of sources.values()) {
      await storage.abortMultipart({ key: source.objectKey, uploadId: source.multipartUploadId });
      await storage.deleteObject(source.objectKey);
      expect(await storage.headObject(source.objectKey)).toBeNull();
      await expect(storage.listParts({ key: source.objectKey, uploadId: source.multipartUploadId })).rejects.toMatchObject({ name: "NoSuchUpload" });
    }
    if (!prisma) return;
    const owned = await prisma.videoSource.findMany({ where: { userId: { in: [owner, other, foreign] } } });
    await prisma.videoUploadCleanup.deleteMany({ where: { sourceId: { in: owned.map((source) => source.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other, foreign] } } });
    await prisma.city.deleteMany({ where: { id: suite.catalog.cityId } });
    await prisma.region.deleteMany({ where: { id: suite.catalog.regionId } });
    await prisma.model.deleteMany({ where: { id: suite.catalog.modelId } });
    await prisma.brand.deleteMany({ where: { id: suite.catalog.brandId } });
    await app.close();
  });

  async function draft(userId: string = owner) {
    return prisma.listingDraft.create({ data: { userId, payload: {} } });
  }

  async function open(draftId: string, key: string = randomUUID(), userId: string = owner, type: "draft" | "listing" = "draft") {
    const response = await request.post("/api/v1/listings/video-uploads").set(auth(userId))
      .set("Idempotency-Key", key).send({ target: { type, id: draftId }, contentType: "video/mp4", sizeBytes: 6 * 1024 * 1024, coverOffsetMs: 500 });
    if (response.status === 201) {
      const source = await prisma.videoSource.findUniqueOrThrow({ where: { id: response.body.sessionId } });
      sources.set(source.id, source);
      expect(VideoUploadsSchemas.OpenVideoUploadResponseSchema.safeParse(response.body).success).toBe(true);
    }
    return response;
  }

  async function put(part: { uploadUrl: string; sizeBytes: number }) {
    const response = await fetch(part.uploadUrl, { method: "PUT", body: Buffer.alloc(part.sizeBytes, 7) });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  }

  async function concurrentOpens(targetId: string, keys: [string, string]) {
    let ready!: (pid: number) => void;
    let release!: () => void;
    const acquired = new Promise<number>((resolve) => { ready = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const lock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner} FOR UPDATE`;
      const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      ready(connection!.pid);
      await gate;
    }, { timeout: 15_000 });
    const pid = await acquired;
    const responses = Promise.all(keys.map((key) => open(targetId, key)));
    try {
      const deadline = Date.now() + 3_000;
      for (;;) {
        const [state] = await prisma.$queryRaw<{ waiting: bigint }[]>`
          SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> ${pid}::int
            AND cardinality(pg_blocking_pids(pid)) > 0`;
        if (Number(state?.waiting) >= 2) break;
        if (Date.now() >= deadline) throw new Error("Both reservations did not reach the database lock");
      }
    } finally {
      release();
      await lock;
    }
    return responses;
  }

  const path = (sessionId: string) => `/api/v1/listings/video-uploads/${sessionId}`;

  it("refuses non-testers and makes foreign/unknown targets and sessions unavailable", async () => {
    const own = await draft();
    const foreignDraft = await draft(other);
    expect((await open(own.id, randomUUID(), foreign)).status).toBe(403);
    expect((await open(foreignDraft.id)).status).toBe(404);
    expect((await open(randomUUID())).status).toBe(404);
    const response = await open(own.id);
    expect(response.status).toBe(201);
    await request.get(path(response.body.sessionId)).set(auth(other)).expect(404);
    await request.post(`${path(response.body.sessionId)}/complete`).set(auth(other)).expect(404);
    await request.post(`${path(response.body.sessionId)}/cancel`).set(auth(other)).expect(404);
  });

  it("resumes after API restart, completes twice as one generation, and retains its completed source after expiry", async () => {
    const target = await draft();
    const key = randomUUID();
    const opened = await open(target.id, key);
    expect(opened.status).toBe(201);
    await put(opened.body.parts[0]);
    await app.close();
    await start();
    const resumed = await request.get(path(opened.body.sessionId)).set(auth()).expect(200);
    expect(resumed.body.confirmedParts).toEqual([{ partNumber: 1, sizeBytes: 5242880 }]);
    expect(resumed.body.parts.map((part: { partNumber: number }) => part.partNumber)).toEqual([2]);
    await put(resumed.body.parts[0]);
    const first = await request.post(`${path(opened.body.sessionId)}/complete`).set(auth()).expect(201);
    const second = await request.post(`${path(opened.body.sessionId)}/complete`).set(auth()).expect(201);
    expect(first.body.state).toBe("PROCESSING");
    expect(second.body.generationId).toBe(first.body.generationId);
    expect((await open(target.id, key)).body.state).toBe("PROCESSING");
    await request.post(`${path(opened.body.sessionId)}/cancel`).set(auth()).expect(409);
    now = new Date("2026-11-14T00:00:00.000Z");
    await app.get(VideoUploadSessions).expireDue();
    const status = await request.get(path(opened.body.sessionId)).set(auth()).expect(200);
    expect(status.body.state).toBe("PROCESSING");
    expect(await storage.headObject(sources.get(opened.body.sessionId)!.objectKey)).toMatchObject({ sizeBytes: 6291456 });
  });

  it("cancels uploaded parts and permits exactly one new pending selection under concurrent opens", async () => {
    const target = await draft();
    const opened = await open(target.id);
    await put(opened.body.parts[0]);
    await request.post(`${path(opened.body.sessionId)}/cancel`).set(auth()).expect(201);
    await request.post(`${path(opened.body.sessionId)}/cancel`).set(auth()).expect(201);
    const source = sources.get(opened.body.sessionId)!;
    expect(await storage.headObject(source.objectKey)).toBeNull();
    await expect(storage.listParts({ key: source.objectKey, uploadId: source.multipartUploadId })).rejects.toMatchObject({ name: "NoSuchUpload" });
    const responses = await concurrentOpens(target.id, [randomUUID(), randomUUID()]);
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it("reprocesses the same stored source after automatic exhaustion and serializes concurrent Try again", async () => {
    const target = await draft();
    const opened = await open(target.id);
    for (const part of opened.body.parts) await put(part);
    await request.post(`${path(opened.body.sessionId)}/complete`).set(auth()).expect(201);
    expect((await queue.getJob(`${opened.body.generationId}-1`))?.data).toEqual({ sourceId: opened.body.sessionId, generationId: opened.body.generationId, attempt: 1 });
    // The worker owns failure/exhaustion; the API owns the seller's retry.
    await prisma.videoGeneration.update({ where: { id: opened.body.generationId }, data: { status: "Failed", processingAttempt: 3, processingRetryCount: 2, failureType: "TRANSIENT" } });
    const responses = await Promise.all([1, 2].map(() => request.post(`${path(opened.body.sessionId)}/reprocess`).set(auth())));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict?.body.code).toBe("VIDEO_UPLOAD_CONFLICT");
    const session = await app.get<PrismaVideoUploadRepository>(VIDEO_UPLOAD_REPOSITORY).findSession(opened.body.sessionId);
    expect(session?.generation).toMatchObject({ status: "Processing", processingAttempt: 4, processingRetryCount: 0 });
    expect(session?.source.id).toBe(opened.body.sessionId);
    expect((await queue.getJob(`${opened.body.generationId}-4`))?.data).toEqual({ sourceId: opened.body.sessionId, generationId: opened.body.generationId, attempt: 4 });
    expect(await storage.headObject(sources.get(opened.body.sessionId)!.objectKey)).toMatchObject({ sizeBytes: 6291456 });
  });

  it("a cancelled video leaves the existing Draft discard path usable", async () => {
    const target = await draft();
    const opened = await open(target.id);
    await request.post(`${path(opened.body.sessionId)}/cancel`).set(auth()).expect(201);
    const drafts = new PrismaListingDraftRepository(prisma);
    await drafts.delete(target.id);
    expect(await drafts.findById(target.id)).toBeNull();
  });

  it("concurrent idempotent opens share one canonical session", async () => {
    const target = await draft();
    const key = randomUUID();
    const responses = await concurrentOpens(target.id, [key, key]);
    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    expect(responses[0]!.body.sessionId).toBe(responses[1]!.body.sessionId);
  });

  it("expired replay returns no URLs and cleanup survives without another seller request", async () => {
    const target = await draft();
    const key = randomUUID();
    const opened = await open(target.id, key);
    await put(opened.body.parts[0]);
    now = new Date("2026-11-22T00:00:00.000Z");
    await app.get(VideoUploadSessions).expireDue();
    const replay = await open(target.id, key);
    expect(replay.body.state).toBe("EXPIRED");
    expect(replay.body.parts).toEqual([]);
    const source = sources.get(opened.body.sessionId)!;
    await expect(storage.listParts({ key: source.objectKey, uploadId: source.multipartUploadId })).rejects.toMatchObject({ name: "NoSuchUpload" });
  });

  it("completion wins a real overlap with cancel and expiry without losing its source", async () => {
    const target = await draft();
    const opened = await open(target.id);
    for (const part of opened.body.parts) await put(part);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    beforeComplete = async () => { entered(); await gate; };
    const completion = request.post(`${path(opened.body.sessionId)}/complete`).set(auth()).then((res) => res);
    await started;
    try {
      await request.post(`${path(opened.body.sessionId)}/cancel`).set(auth()).expect(409);
      now = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
      await app.get(VideoUploadSessions).expireDue();
    } finally {
      release();
    }
    expect((await completion).status).toBe(201);
    const status = await request.get(path(opened.body.sessionId)).set(auth()).expect(200);
    expect(status.body.state).toBe("PROCESSING");
    expect(await storage.headObject(sources.get(opened.body.sessionId)!.objectKey)).toMatchObject({ sizeBytes: 6291456 });
  });

  it("rechecks a Listing's eligibility before renewal and adoption", async () => {
    const listing = await prisma.listing.create({ data: {
      sellerId: owner, status: "active", brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId, cityId: suite.catalog.cityId,
      priceAmount: 10000, priceCurrency: "TMT",
    } });
    const opened = await open(listing.id, randomUUID(), owner, "listing");
    expect(opened.status).toBe(201);
    for (const part of opened.body.parts) await put(part);
    // Moderation belongs to Admin; this fixture changes only this suite's row.
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "banned" } });
    await request.get(path(opened.body.sessionId)).set(auth()).expect(404);
    await request.post(`${path(opened.body.sessionId)}/complete`).set(auth()).expect(404);
  });

  it("the new-upload switch stops new sessions but existing tester sessions resume; revoked testers lose authority", async () => {
    const target = await draft();
    const opened = await open(target.id);
    await app.close();
    uploadsEnabled = false;
    await start();
    await request.get(path(opened.body.sessionId)).set(auth()).expect(200);
    expect((await open(target.id)).status).toBe(403);
    await app.close();
    testerIds = [other];
    await start();
    await request.get(path(opened.body.sessionId)).set(auth()).expect(404);
    await request.post(`${path(opened.body.sessionId)}/complete`).set(auth()).expect(404);
  });
});
