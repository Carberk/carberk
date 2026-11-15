import "reflect-metadata";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { UploadsSchemas } from "@auto-tm/contracts";
import supertest from "supertest";

import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import { PresignUpload } from "../application/PresignUpload";
import { RenewPhotoUpload } from "../application/RenewPhotoUpload";
import { InMemoryMediaWorld } from "../application/testing/InMemoryMediaWorld";
import { MEDIA_STORAGE_PORT } from "../domain/ports/MediaStoragePort";
import { MEDIA_UPLOAD_REPOSITORY } from "../domain/ports/MediaUploadRepository";
import { UploadsController } from "./UploadsController";

// Database/storage facts alone are faked; HTTP, both guards, use cases and error filter are real.
const database = new InMemoryMediaWorld();
let app: NestFastifyApplication, request: ReturnType<typeof supertest>, token: string;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ global: true, secret: "renewal-contract-test-secret" })],
    controllers: [UploadsController], providers: [PresignUpload, RenewPhotoUpload,
      { provide: MEDIA_STORAGE_PORT, useValue: database.storage },
      { provide: MEDIA_UPLOAD_REPOSITORY, useValue: database.uploadRepo },
      { provide: IDENTITY_CHECK_PORT, useValue: { isSuspended: async () => false, isDeletionScheduled: async () => false } },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const reflector = app.get(Reflector), jwt = app.get(JwtService);
  app.useGlobalGuards(new JwtAuthGuard(reflector, jwt), new AccountDeletionPendingGuard(reflector, app.get(IDENTITY_CHECK_PORT)));
  app.useGlobalFilters(new GlobalErrorFilter());
  await app.listen(0, "127.0.0.1");
  request = supertest(app.getHttpServer()); token = jwt.sign({ sub: "owner", role: "buyer" });
});
afterAll(async () => { await app?.close(); });

it.each([
  [{}, "VALIDATION_FAILED"],
  [{ key: "pending/11111111-1111-4111-8111-111111111111/original.webp", contentType: "image/webp", sizeBytes: 86 }, "UPLOAD_NOT_AVAILABLE"],
])("returns a contract-valid refusal for %j", async (body, code) => {
  for (const requestId of [null, "11111111-1111-4111-8111-111111111111"]) {
    const call = request.post("/api/v1/uploads/renew").set("Authorization", `Bearer ${token}`).send(body);
    if (requestId) call.set("X-Request-Id", requestId);
    const response = await call.expect(400);
    expect(response.body.code).toBe(code);
    expect(response.body.requestId).toBe(requestId ?? "unknown");
    expect(UploadsSchemas.RenewPhotoUploadRefusalSchema.parse(response.body)).toEqual(response.body);
    expect(response.body.uploadUrl).toBeUndefined();
  }
});
