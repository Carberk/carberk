import "reflect-metadata";

import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BUSINESS_AUTHORITY_PORT } from "../../identity/identity.public";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { VideoEligibility } from "../application/VideoEligibility";
import { InMemoryVideoActorAuthority } from "../application/testing/InMemoryVideoActorAuthority";
import { VideoCapabilitiesController } from "./VideoCapabilitiesController";

const userId = "00000000-0000-4000-8000-000000000010";
describe("current server-owned video capabilities", () => {
  let app: NestFastifyApplication, token: string;
  const identity = new InMemoryVideoActorAuthority(); let uploads = true;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: "synthetic-video-capabilities" })], controllers: [VideoCapabilitiesController], providers: [
      { provide: APP_GUARD, useClass: JwtAuthGuard }, VideoEligibility,
      { provide: BUSINESS_AUTHORITY_PORT, useValue: identity },
      { provide: ConfigService, useValue: { get: (key: string) => key === "VIDEO_TESTER_USER_IDS" ? [userId] : key === "VIDEO_UPLOADS_ENABLED" ? uploads : true } },
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    token = module.get(JwtService).sign({ sub: userId, sid: "synthetic-current-session" }); await app.listen(0, "127.0.0.1");
  });
  afterAll(async () => { await app?.close(); });
  it("advertises only current tester rights and preserves viewing through the upload stop switch", async () => {
    const get = () => supertest(app.getHttpServer()).get("/api/v1/listing-video/capabilities").set("authorization", `Bearer ${token}`);
    const allowed = await get().expect(200); expect(allowed.body).toEqual({ canUpload: true, canView: true }); expect(allowed.headers["cache-control"]).toBe("private, no-store");
    uploads = false; expect((await get().expect(200)).body).toEqual({ canUpload: false, canView: true });
    identity.active = false; expect((await get().expect(200)).body).toEqual({ canUpload: false, canView: false });
  });
});
