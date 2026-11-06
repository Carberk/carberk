import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";

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
const SIZE = 6 * 1024 * 1024;

describe("VideoUploadsController e2e", () => {
  const storage = new FakeVideoStorage();
  const repo = new InMemoryVideoUploadRepository();
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;

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
        VideoUploadSessions,
        { provide: VIDEO_STORAGE_PORT, useValue: storage },
        { provide: VIDEO_UPLOAD_REPOSITORY, useValue: repo },
        {
          provide: VIDEO_UPLOAD_ACCESS_PORT,
          useValue: { canResumeVideo: (userId: string) => userId === OWNER, canUploadVideo: (userId: string) => userId === OWNER },
        },
        {
          provide: LISTING_DRAFT_REPOSITORY,
          useValue: {
            findById: async (id: string) =>
              id === DRAFT_ID ? { id, userId: OWNER } : null,
          },
        },
        { provide: LISTING_REPOSITORY, useValue: { findById: async () => null } },
        {
          provide: IDENTITY_CHECK_PORT,
          useValue: {
            isSuspended: async () => false,
            isAdmin: async () => false,
            isInDealership: async () => false,
            isDeletionScheduled: async () => false,
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
});
