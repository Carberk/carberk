import "reflect-metadata";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { InMemoryStaffAuthority } from "../application/testing/InMemoryStaffAuthority";
import { STAFF_AUTHORITY_REPOSITORY } from "../domain/ports/StaffAuthorityRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { ReadOperationsHealth } from "../../operations/application/ReadOperationsHealth";

import { OperationsController } from "../../operations/presentation/OperationsController";

const now = new Date("2026-10-18T00:00:00Z");
const repository = new InMemoryStaffAuthority();
describe("operational HTTP health current staff authority", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let raw: string | null;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: "synthetic-operations-http-919" })],
      controllers: [OperationsController], providers: [CheckStaffAuthority,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: STAFF_AUTHORITY_REPOSITORY, useValue: repository },
        { provide: IDENTITY_TOKENS.ClockPort, useValue: { now: () => now } },
        { provide: ReadOperationsHealth, inject: [CheckStaffAuthority], useFactory: (authority: CheckStaffAuthority) => new ReadOperationsHealth(authority, async () => raw, () => now) },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    token = module.get(JwtService).sign({ sub: "person", sid: "session", role: "admin" });
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    repository.snapshot = { userId: "person", sessionUserId: "person", role: "buyer", suspended: false, deleting: false,
      expiresAt: new Date(now.getTime() + 60_000), elevatedUntil: new Date(now.getTime() + 60_000), capabilities: ["analytics.aggregate"] };
    raw = JSON.stringify({ version: 1, observedAt: now.toISOString(), api: "healthy", collector: "unknown", worker: "healthy", queues: [], incident: null });
  });
  const get = () => request.get("/api/v1/operations/health").set("authorization", `Bearer ${token}`);
  it("requires JWT, current capability and elevation, and releases only no-store safe snapshots", async () => {
    await request.get("/api/v1/operations/health").expect(401);
    const response = await get().expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.state).toBe("available");
    if (!repository.snapshot) throw new Error("Missing authority fixture");
    repository.snapshot.capabilities = [];
    await get().expect(403);
    repository.snapshot.capabilities = ["analytics.aggregate"];
    repository.snapshot.elevatedUntil = now;
    await get().expect(403);
  });
  it("denies a revoked Session despite a formerly valid admin bearer", async () => {
    await get().expect(200);
    repository.snapshot = null;
    await get().expect(403);
  });
  it("returns unavailable rather than treating missing watchdog evidence as healthy", async () => {
    raw = null;
    expect((await get().expect(200)).body).toEqual({ state: "unavailable", snapshot: null });
  });
});
