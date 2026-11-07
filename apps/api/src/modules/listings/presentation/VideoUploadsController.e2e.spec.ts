import type { Env } from "../../../env.schema";
import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";

import { GetTargetVideoStatus } from "../application/GetTargetVideoStatus";
import { LISTING_VIDEO_READ_PORT } from "../domain/ports/ListingVideoReadPort";
import { FakeListingVideoReadPort } from "../application/testing/FakeListingVideoReadPort";
import { VideoUploadsController } from "./VideoUploadsController";
import { VideoUploadSessions, VIDEO_UPLOAD_NOW } from "../application/VideoUploadSessions";
import { VIDEO_STORAGE_PORT } from "../domain/ports/VideoStoragePort";
import { VIDEO_UPLOAD_REPOSITORY } from "../domain/ports/VideoUploadRepository";
import { VIDEO_UPLOAD_ACCESS_PORT } from "../domain/ports/VideoUploadAccessPort";
import { LISTING_DRAFT_REPOSITORY } from "../domain/ports/ListingDraftRepository";
import { LISTING_REPOSITORY } from "../domain/ports/ListingRepository";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import {
  FakeVideoStorage,
  InMemoryVideoUploadRepository,
} from "../application/testing/InMemoryVideoWorld";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const LISTING_ID = "44444444-4444-4444-8444-444444444444";
const SIZE = 6 * 1024 * 1024;

describe("VideoUploadsController e2e", () => {
  const storage = new FakeVideoStorage();
  const repo = new InMemoryVideoUploadRepository();
  const config = new ConfigService<Env, true>({ LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: OWNER, LISTING_VIDEO_VIEW_TESTER_USER_IDS: "", LISTING_VIDEO_UPLOADS_ENABLED: true });
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let published = false;
  let suspended = false;
  let deletionScheduled = false;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
      controllers: [VideoUploadsController],
      providers: [
        VideoUploadSessions, GetTargetVideoStatus,
        { provide: LISTING_VIDEO_READ_PORT, useClass: FakeListingVideoReadPort },
        { provide: VIDEO_STORAGE_PORT, useValue: storage },
        { provide: VIDEO_UPLOAD_REPOSITORY, useValue: repo },
        {
          provide: VIDEO_UPLOAD_ACCESS_PORT,
          useValue: new ConfigListingVideoAccess(config),
        },
        {
          provide: LISTING_DRAFT_REPOSITORY,
          useValue: {
            findById: async (id: string) =>
              id === DRAFT_ID && !published ? { id, userId: OWNER } : null,
          },
        },
        { provide: LISTING_REPOSITORY, useValue: { findById: async (id: string) => published && id === LISTING_ID ? { id, sellerId: OWNER, status: "published", deletedAt: null } : null } },
        {
          provide: IDENTITY_CHECK_PORT,
          useValue: {
            isSuspended: async () => suspended,
            isAdmin: async () => false,
            isInDealership: async () => false,
            isDeletionScheduled: async () => deletionScheduled,
            holdsSignInPhone: async () => false,
          },
        },
        { provide: VIDEO_UPLOAD_NOW, useValue: () => new Date("2026-11-06T00:00:00.000Z") },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    repo.sessions.clear();
    published = false;
    suspended = false;
    deletionScheduled = false;
    storage.completeCalls = 0;
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", OWNER);
    config.set("LISTING_VIDEO_VIEW_TESTER_USER_IDS", "");
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", true);
  });

  const openBody = {
    target: { type: "draft", id: DRAFT_ID },
    contentType: "video/mp4",
    sizeBytes: SIZE,
    coverOffsetMs: 500,
  };

  it("returns 401 without Bearer [REDACTED]", async () => {
    await request.post("/api/v1/listings/video-uploads").send(openBody).expect(401);
  });

  it("refuses a signed-in non-tester", async () => {
    const res = await request
      .post("/api/v1/listings/video-uploads")
      .set("Authorization", `Bearer ${mintUserJwt(OTHER)}`)
      .send(openBody)
      .expect(403);
    expect(res.body.code).toBe("LISTING_VIDEO_UNAVAILABLE");
  });

  it.each([false, true])("view-only membership never grants sessions (switch=%s)", async (enabled) => {
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", "");
    config.set("LISTING_VIDEO_VIEW_TESTER_USER_IDS", OWNER);
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", enabled);
    await request.post("/api/v1/listings/video-uploads").set("Authorization", `Bearer ${mintUserJwt(OWNER)}`).send(openBody).expect(403);
  });

  it("switch-off refuses new sessions but retains owned status/cancel; removal from upload testers refuses direct recovery", async () => {
    const auth = `Bearer ${mintUserJwt(OWNER)}`;
    const opened = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send(openBody).expect(201);
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", false);
    const refused = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send(openBody).expect(403);
    expect(refused.body.code).toBe("LISTING_VIDEO_UNAVAILABLE");
    await request.get(`/api/v1/listings/video-uploads/${opened.body.sessionId}`).set("Authorization", auth).expect(200);
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", "");
    for (const action of ["", "/complete", "/cancel", "/reprocess"]) {
      const url = `/api/v1/listings/video-uploads/${opened.body.sessionId}${action}`;
      const response = action ? request.post(url) : request.get(url);
      await response.set("Authorization", auth).expect(404);
    }
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", OWNER);
    await request.post(`/api/v1/listings/video-uploads/${opened.body.sessionId}/cancel`).set("Authorization", auth).expect(201);
  });

  it("opens, resumes, completes exactly once and cancels only before completion", async () => {
    const opened = await request
      .post("/api/v1/listings/video-uploads")
      .set("Authorization", `Bearer ${mintUserJwt(OWNER)}`)
      .set("Idempotency-Key", "e2e-open-1")
      .send(openBody)
      .expect(201);
    expect(opened.body.state).toBe("UPLOADING");
    expect(opened.body.parts).toHaveLength(2);

    const replay = await request
      .post("/api/v1/listings/video-uploads")
      .set("Authorization", `Bearer ${mintUserJwt(OWNER)}`)
      .set("Idempotency-Key", "e2e-open-1")
      .send(openBody)
      .expect(201);
    expect(replay.body.sessionId).toBe(opened.body.sessionId);

    const session = await repo.findSession(opened.body.sessionId);
    storage.putPart(session!.source.objectKey, 1, 5 * 1024 * 1024);

    const foreign = await request
      .get(`/api/v1/listings/video-uploads/${opened.body.sessionId}`)
      .set("Authorization", `Bearer ${mintUserJwt(OTHER)}`)
      .expect(404);
    expect(foreign.body.code).toBe("VIDEO_UPLOAD_NOT_AVAILABLE");

    const status = await request
      .get(`/api/v1/listings/video-uploads/${opened.body.sessionId}`)
      .set("Authorization", `Bearer ${mintUserJwt(OWNER)}`)
      .expect(200);
    expect(status.body.confirmedParts).toEqual([
      { partNumber: 1, sizeBytes: 5 * 1024 * 1024 },
    ]);
    expect(status.body.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([2]);

    storage.putPart(session!.source.objectKey, 2, 1024 * 1024);
    const completed = await request
      .post(`/api/v1/listings/video-uploads/${opened.body.sessionId}/complete`)
      .set("Authorization", `Bearer ${mintUserJwt(OWNER)}`)
      .expect(201);
    expect(completed.body.state).toBe("PROCESSING");
    const completedAgain = await request
      .post(`/api/v1/listings/video-uploads/${opened.body.sessionId}/complete`)
      .set("Authorization", `Bearer ${mintUserJwt(OWNER)}`)
      .expect(201);
    expect(completedAgain.body.generationId).toBe(completed.body.generationId);
    expect(storage.completeCalls).toBe(1);

    const cancelCompleted = await request
      .post(`/api/v1/listings/video-uploads/${opened.body.sessionId}/cancel`)
      .set("Authorization", `Bearer ${mintUserJwt(OWNER)}`)
      .expect(409);
    expect(cancelCompleted.body.code).toBe("VIDEO_UPLOAD_CONFLICT");
  });

  it("raw-target remove requires upload membership, even when the caller can view video; the switch never blocks removal", async () => {
    const auth = `Bearer ${mintUserJwt(OWNER)}`;
    const opened = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send(openBody).expect(201);
    const remove = "/api/v1/listings/video-uploads/remove";
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", false);
    await request.post(remove).send(openBody.target).expect(401);
    await request.post(remove).set("Authorization", `Bearer ${mintUserJwt(OTHER)}`).send(openBody.target).expect(404);
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", "");
    config.set("LISTING_VIDEO_VIEW_TESTER_USER_IDS", OWNER);
    await request.post(remove).set("Authorization", auth).send(openBody.target).expect(404);
    expect((await repo.findSession(opened.body.sessionId))?.slot.pendingGenerationId).toBe(opened.body.generationId);
    config.set("LISTING_VIDEO_UPLOAD_TESTER_USER_IDS", OWNER);
    const removed = await request.post(remove).set("Authorization", auth).send(openBody.target).expect(201);
    expect(removed.body).toEqual({ state: "REMOVED" });
    expect((await repo.findSession(opened.body.sessionId))?.slot.pendingGenerationId).toBeNull();
  });

  it("resumes the canonical Listing after publish while uploads are off, including an identical original-Draft replay", async () => {
    const auth = `Bearer ${mintUserJwt(OWNER)}`;
    const opened = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).set("Idempotency-Key", "published-replay").send(openBody).expect(201);
    const session = (await repo.findSession(opened.body.sessionId))!;
    // Publication moves the slot, retaining source/session identity and openingDraftId.
    session.slot.target = { type: "listing", id: LISTING_ID };
    published = true;
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", false);
    const status = await request.get(`/api/v1/listings/video-uploads/${opened.body.sessionId}`).set("Authorization", auth).expect(200);
    expect(status.body.target).toEqual(session.slot.target);
    const replay = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).set("Idempotency-Key", "published-replay").send(openBody).expect(201);
    expect(replay.body).toMatchObject({ sessionId: opened.body.sessionId, target: session.slot.target });
    await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send({ ...openBody, target: session.slot.target }).expect(403);
    await request.post("/api/v1/listings/video-uploads/remove").set("Authorization", auth).send(session.slot.target).expect(201);
  });

  it.each(["suspended", "deletion scheduled"])("refuses new and existing video controls for an account that is %s", async (state) => {
    const auth = `Bearer ${mintUserJwt(OWNER)}`;
    const opened = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send(openBody).expect(201);
    suspended = state === "suspended";
    deletionScheduled = state === "deletion scheduled";
    await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send(openBody).expect(403);
    await request.post("/api/v1/listings/video-uploads/remove").set("Authorization", auth).send(openBody.target).expect(403);
    for (const action of ["", "/complete", "/cancel", "/reprocess"]) {
      const url = `/api/v1/listings/video-uploads/${opened.body.sessionId}${action}`;
      await (action ? request.post(url) : request.get(url)).set("Authorization", auth).expect(403);
    }
  });
  it("completes and reprocesses an owned stored source while new uploads are off", async () => {
    const auth = `Bearer ${mintUserJwt(OWNER)}`;
    const opened = await request.post("/api/v1/listings/video-uploads").set("Authorization", auth).send(openBody).expect(201);
    const session = (await repo.findSession(opened.body.sessionId))!;
    storage.putPart(session.source.objectKey, 1, 5 * 1024 * 1024);
    storage.putPart(session.source.objectKey, 2, 1024 * 1024);
    config.set("LISTING_VIDEO_UPLOADS_ENABLED", false);
    await request.post(`/api/v1/listings/video-uploads/${opened.body.sessionId}/complete`).set("Authorization", auth).expect(201);
    session.generation.status = "Failed";
    session.generation.failureType = "TRANSIENT";
    const retried = await request.post(`/api/v1/listings/video-uploads/${opened.body.sessionId}/reprocess`).set("Authorization", auth).expect(201);
    expect(retried.body).toMatchObject({ sessionId: opened.body.sessionId, generationId: opened.body.generationId, state: "PROCESSING", parts: [] });
    for (const action of ["", "/complete", "/cancel", "/reprocess"]) {
      const url = `/api/v1/listings/video-uploads/${opened.body.sessionId}${action}`;
      await (action ? request.post(url) : request.get(url)).expect(401);
    }
  });

});
