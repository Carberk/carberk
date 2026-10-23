import "reflect-metadata";
import { BadRequestException, Controller, Get, ServiceUnavailableException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { TechnicalMetrics } from "../infrastructure/TechnicalMetrics";

import { TechnicalHttpMetrics } from "./TechnicalHttpMetrics";

@Controller()
class Endpoints {
  @Get("ok") ok() { return { synthetic: true }; }
  @Get("rejected") rejected() { throw new BadRequestException(); }
  @Get("api/v1/diagnostic-telemetry/events") unavailableCollector() { throw new ServiceUnavailableException(); }
  @Get("readyz") ready() { return { status: "ready" }; }
}
const guard: CanActivate = { canActivate(context: ExecutionContext) {
  if (context.switchToHttp().getRequest<FastifyRequest>().headers["x-synthetic-fail"] === "true") throw new Error("private must not enter metric output");
  return true;
} };
describe("actual HTTP operational counters boundary", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  const records: { status: number; elapsed: number }[] = [];
  beforeAll(async () => {
    vi.stubEnv("OPERATIONS_ENABLED", "true");
    const module = await Test.createTestingModule({ controllers: [Endpoints], providers: [TechnicalHttpMetrics,
      { provide: APP_GUARD, useValue: guard },
      { provide: TechnicalMetrics, useValue: { record: (status: number, elapsed: number) => { records.push({ status, elapsed }); } } },
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  it("counts completed responses including guard failures without retaining request or exception content", async () => {
    await request.get("/ok?private=not-a-metric").expect(200);
    await request.get("/rejected").expect(400);
    await request.get("/ok").set("x-synthetic-fail", "true").expect(500);
    await request.get("/readyz").expect(200);
    await request.get("/api/v1/diagnostic-telemetry/events").expect(503);
    expect(records.map(record => record.status)).toEqual([200, 400, 500]);
    expect(records.every(record => Number.isFinite(record.elapsed) && record.elapsed >= 0)).toBe(true);
    expect(records.every(record => Object.keys(record).sort().join(",") === "elapsed,status")).toBe(true);
  });
});
