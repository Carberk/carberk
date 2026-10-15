import "reflect-metadata";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { MeasurementController } from "./MeasurementController";
import { AcceptClientMeasurementBatch } from "../application/AcceptClientMeasurementBatch";
import { AcceptMeasurement } from "../application/AcceptMeasurement";
import { FakeMeasurementLedger } from "../application/testing/FakeMeasurementLedger";
import type { MeasurementSubjectPort } from "../application/AcceptClientMeasurementBatch";

const event = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z", visitId: "00000000-0000-4000-8000-000000000002",
 purpose: "product_improvement", eventName: "listing_detail_opened", context: { platform: "android", release: "1.0", build: "1", locale: "ru" }, payload: { listingId: "00000000-0000-4000-8000-000000000003" } };
const ledger = new FakeMeasurementLedger();
const subjects: MeasurementSubjectPort = { resolve: async (input) => input.authenticatedUserId === "buyer" || input.guestCapability === `mg_${"a".repeat(43)}` ? {
 origin: "client", environment: "staging", population: "synthetic", subject: { kind: input.authenticatedUserId ? "account" : "guest", pseudonym: "b".repeat(64), generation: "generation-http" },
} : null };

describe("first-party measurement HTTP", () => {
 let app: NestFastifyApplication; let request: ReturnType<typeof supertest>; let jwt: JwtService;
 beforeAll(async () => {
  const accept = new AcceptMeasurement(ledger, () => new Date("2026-10-15T00:00:00Z"), { enabled: true, environment: "staging", purposes: ["product_improvement"], evidenceRef: "synthetic-http", realCollectionApproved: false });
  const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: "synthetic-measurement-http-905" })], controllers: [MeasurementController],
   providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: AcceptClientMeasurementBatch, useValue: new AcceptClientMeasurementBatch(subjects, accept, () => Date.parse("2026-10-15T00:00:00Z")) }],
  }).compile();
  jwt = module.get(JwtService); app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
 });
 afterAll(async () => { await app?.close(); });
 it("offers foreground bootstrap with no actor/body credential injection and no caching", async () => {
  const response = await request.post("/api/v1/measurement/bootstrap").send({}).expect(201);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toMatchObject({ visitId: "00000000-0000-4000-8000-000000000002", generation: "generation-http", purposes: ["product_improvement"] });
  await request.post("/api/v1/measurement/bootstrap").send({ userId: "buyer", token: "SENSITIVE_SENTINEL" }).expect(400);
 });
 it("uses verified JWT or scoped guest capability, never body actor metadata", async () => {
  const response = await request.post("/api/v1/measurement/events").set("authorization", `Bearer ${jwt.sign({ sub: "buyer" })}`).send({ events: [event] }).expect(204);
  expect(response.text).toBe(""); expect(ledger.records[0]?.authority.subject.kind).toBe("account");
  await request.post("/api/v1/measurement/events").set("authorization", `Bearer mg_${"a".repeat(43)}`).send({ events: [{ ...event, eventId: "00000000-0000-4000-8000-000000000004" }] }).expect(204);
  expect(ledger.records[1]?.authority.subject.kind).toBe("guest");
 });
 it("rejects missing credentials, injected metadata, server outcome guesses and excessive batch size generically", async () => {
  await request.post("/api/v1/measurement/events").send({ events: [event] }).expect(401);
  const auth = `Bearer ${jwt.sign({ sub: "buyer" })}`;
  const response = await request.post("/api/v1/measurement/events").set("authorization", auth).send({ events: [{ ...event, token: "SENSITIVE_SENTINEL" }] }).expect(400);
  expect(JSON.stringify(response.body)).not.toContain("SENSITIVE_SENTINEL");
  await request.post("/api/v1/measurement/events").set("authorization", auth).send({ events: Array.from({ length: 51 }, () => event) }).expect(400);
  await request.post("/api/v1/measurement/events").set("authorization", auth).send({ events: [event], content: "x".repeat(131072) }).expect(400);
 });
 it("bounds identity resolution so collector outage cannot hold an HTTP request", async () => {
  const accept = new AcceptMeasurement(ledger, () => new Date("2026-10-15T00:00:00Z"));
  const batch = new AcceptClientMeasurementBatch({ resolve: () => new Promise(() => undefined) }, accept, () => 0);
  vi.useFakeTimers();
  try {
   const receipt = batch.execute({ events: [event] }, { authenticatedUserId: "buyer" });
   await vi.advanceTimersByTimeAsync(251);
   expect(await Promise.race([receipt, Promise.resolve("still_waiting")])).toBe("unavailable");
  } finally { vi.useRealTimers(); }
 });
 it("does not expose revoked identity or event counts, and isolates ledger outage", async () => {
  const auth = `Bearer ${jwt.sign({ sub: "buyer" })}`; ledger.revoked.add("generation-http");
  await request.post("/api/v1/measurement/events").set("authorization", auth).send({ events: [event] }).expect(204);
  ledger.unavailable = true; await request.post("/api/v1/measurement/events").set("authorization", auth).send({ events: [event] }).expect(503); ledger.unavailable = false;
 });
});
