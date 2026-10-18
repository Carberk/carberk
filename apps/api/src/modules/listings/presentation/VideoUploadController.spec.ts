import "reflect-metadata";

import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { OwnedVideoUploadProtocol, OWNED_VIDEO_UPLOAD_PROTOCOL } from "../application/OwnedVideoUploadProtocol";
import { VideoEligibility } from "../application/VideoEligibility";
import { InMemoryOwnedVideoSessionLedger } from "../application/testing/InMemoryOwnedVideoSessionLedger";
import { InMemoryVideoObjectStorage } from "../application/testing/InMemoryVideoObjectStorage";
import { VideoUploadController } from "./VideoUploadController";
const url = "/api/v1/listing-video-upload-sessions";
const userId = "00000000-0000-4000-8000-000000000010";
const body = { protocolVersion: 1, target: { kind: "listing", id: "00000000-0000-4000-8000-000000000011" }, prepared: { sizeBytes: 1000, sha256: "a".repeat(64) }, posterMs: 0, idempotencyKey: "first-video" };
describe("V1 owned video HTTP protocol", () => {
  let app: NestFastifyApplication, token: string;
  let request: ReturnType<typeof supertest>;
  const ledger = new InMemoryOwnedVideoSessionLedger();
  const storage = new InMemoryVideoObjectStorage();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: "synthetic-video-protocol" })], controllers: [VideoUploadController], providers: [
      { provide: APP_GUARD, useClass: JwtAuthGuard }, VideoEligibility,
      { provide: ConfigService, useValue: { get: (key: string) => key === "VIDEO_TESTER_USER_IDS" ? [userId] : true } },
      { provide: OWNED_VIDEO_UPLOAD_PROTOCOL, useValue: new OwnedVideoUploadProtocol(ledger, storage) },
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    token = module.get(JwtService).sign({ sub: userId, sid: "auth-session" });
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });
  afterAll(async () => { await app?.close(); });
  it("requires verified authentication and forbids client upload/key authority", async () => {
    const denied = await request.post(url).send(body).expect(401);
    expect(denied.headers["cache-control"]).toBe("private, no-store");
    await request.post(url).set("authorization", `Bearer ${token}`).send({ ...body, uploadId: "arbitrary" }).expect(400);
  });
  it("exposes create, status, renewal, persisted pause/resume and processing completion on the agreed namespace", async () => {
    const create = await request.post(url).set("authorization", `Bearer ${token}`).send(body).expect(201);
    expect(create.headers["cache-control"]).toBe("private, no-store");
    expect(create.body).toMatchObject({ version: 1, state: "UPLOADING", partBytes: 5242880, partCount: 1 });
    expect(create.body.sourceKey).toBeUndefined();
    const sessionUrl = `${url}/${create.body.sessionId}`;
    await request.get(sessionUrl).set("authorization", `Bearer ${token}`).expect(200);
    await request.post(`${sessionUrl}/pause`).set("authorization", `Bearer ${token}`).send({}).expect(200);
    await request.post(`${sessionUrl}/resume`).set("authorization", `Bearer ${token}`).send({}).expect(200);
    const credentials = await request.post(`${sessionUrl}/part-credentials`).set("authorization", `Bearer ${token}`).send({ partNumbers: [1] }).expect(200);
    expect(credentials.body.parts[0].partNumber).toBe(1);
    const complete = await request.post(`${sessionUrl}/complete`).set("authorization", `Bearer ${token}`).send({}).expect(200);
    expect(complete.body.state).toBe("PROCESSING");
  });
  it("keeps infrastructure failure retryable without exposing database details", async () => {
    ledger.reserveError = new Error("synthetic database adapter failure private-key");
    try {
      const response = await request.post(url).set("authorization", `Bearer ${token}`).send(body).expect(503);
      expect(response.body).toMatchObject({ code: "VIDEO_SERVICE_UNAVAILABLE", statusCode: 503 });
      expect(JSON.stringify(response.body)).not.toContain("private-key");
      expect(response.headers["cache-control"]).toBe("private, no-store");
    } finally { ledger.reserveError = null; }
  });

});
