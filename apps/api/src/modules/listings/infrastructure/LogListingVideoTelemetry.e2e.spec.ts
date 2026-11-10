import type { Env } from "../../../env.schema";
import "reflect-metadata";

import { Writable } from "node:stream";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { LoggerModule, Logger } from "nestjs-pino";
import supertest from "supertest";

import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { requestLoggingOptions } from "../../../common/requestLogging";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { LISTING_VIDEO_TELEMETRY_PORT } from "../domain/ports/ListingVideoTelemetryPort";
import { VideoTelemetryController } from "../presentation/VideoTelemetryController";
import { LogListingVideoTelemetry } from "./LogListingVideoTelemetry";

const TESTER = "11111111-1111-4111-8111-111111111111";

describe("Listing video telemetry log line", () => {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({ write(chunk, _enc, done) { lines.push(JSON.parse(String(chunk))); done(); } });
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({ pinoHttp: [requestLoggingOptions("info", null), stream] }),
        JwtModule.register({ global: true, secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me", signOptions: { expiresIn: "1h" } }),
      ],
      controllers: [VideoTelemetryController],
      providers: [
        { provide: ConfigListingVideoAccess, useValue: new ConfigListingVideoAccess(new ConfigService<Env, true>({ LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "", LISTING_VIDEO_VIEW_TESTER_USER_IDS: TESTER })) },
        { provide: LISTING_VIDEO_TELEMETRY_PORT, useClass: LogListingVideoTelemetry },
      ],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    await app.listen(0, "127.0.0.1");
  });

  afterAll(async () => { await app.close(); });

  it("logs the measurement alone, without the tester's request, address or device", async () => {
    await supertest(app.getHttpServer())
      .post("/api/v1/listings/video-telemetry")
      .set("Authorization", `Bearer ${mintUserJwt(TESTER)}`)
      .set("User-Agent", "Carberk/1.0 iPhone17,1")
      .send({ event: "playback_started", audience: "viewer", quality: "360", startupMs: 2_400 })
      .expect(204);

    const line = lines.find((entry) => entry["event"] === "listing_video.playback_started");
    expect(line).toMatchObject({ event: "listing_video.playback_started", audience: "viewer", quality: "360", startupMs: 2_400 });
    expect(line).not.toHaveProperty("req");
    const text = JSON.stringify(line);
    for (const leak of ["req", "remoteAddress", "127.0.0.1", "iPhone17", "Bearer", TESTER]) expect(text).not.toContain(leak);
  });
});
