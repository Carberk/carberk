import type { Env } from "../../../env.schema";
import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";

import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { LISTING_VIDEO_TELEMETRY_PORT } from "../domain/ports/ListingVideoTelemetryPort";
import { RecordingListingVideoTelemetry } from "../application/testing/RecordingListingVideoTelemetry";
import { VideoTelemetryController } from "./VideoTelemetryController";

const UPLOADER = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const PATH = "/api/v1/listings/video-telemetry";
const STARTED = { event: "playback_started", audience: "viewer", quality: "auto", startupMs: 1_850 };

describe("Listing video telemetry endpoint", () => {
  const telemetry = new RecordingListingVideoTelemetry();
  const config = new ConfigService<Env, true>({
    LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: UPLOADER,
    LISTING_VIDEO_VIEW_TESTER_USER_IDS: VIEWER,
    LISTING_VIDEO_UPLOADS_ENABLED: false,
  });
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me", signOptions: { expiresIn: "1h" } })],
      controllers: [VideoTelemetryController],
      providers: [
        { provide: ConfigListingVideoAccess, useValue: new ConfigListingVideoAccess(config) },
        { provide: LISTING_VIDEO_TELEMETRY_PORT, useValue: telemetry },
      ],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { telemetry.events.length = 0; });

  const send = (userId: string, body: unknown) =>
    request.post(PATH).set("Authorization", `Bearer ${mintUserJwt(userId)}`).send(body as object);

  it("needs a signed-in User", async () => {
    await request.post(PATH).send(STARTED).expect(401);
    expect(telemetry.events).toEqual([]);
  });

  it("records a view tester's playback start and an upload tester's interruption, without who sent them", async () => {
    await send(VIEWER, STARTED).expect(204);
    await send(UPLOADER, { event: "upload_interrupted", reason: "network", confirmedBytes: 5_242_880, totalBytes: 11_200_000 }).expect(204);
    // The upload switch is off: existing tester sessions are still measured.
    expect(telemetry.events).toEqual([
      { event: "playback_started", audience: "viewer", quality: "auto", startupMs: 1_850 },
      { event: "upload_interrupted", reason: "network", confirmedBytes: 5_242_880, totalBytes: 11_200_000 },
    ]);
  });

  it("records a viewer who left before the first frame", async () => {
    await send(VIEWER, { event: "playback_abandoned", audience: "viewer", waitedMs: 3_200 }).expect(204);
    expect(telemetry.events).toEqual([{ event: "playback_abandoned", audience: "viewer", waitedMs: 3_200 }]);
  });

  it("refuses an event carrying a grant URL and records nothing", async () => {
    const res = await send(VIEWER, { ...STARTED, url: "https://api.example/files/master.m3u8?grant=secret" }).expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(res.body)).not.toContain("grant=secret");
    expect(telemetry.events).toEqual([]);
  });

  it("accepts but drops events from Users outside the video tester lists", async () => {
    await send(OTHER, STARTED).expect(204);
    expect(telemetry.events).toEqual([]);
  });
});
