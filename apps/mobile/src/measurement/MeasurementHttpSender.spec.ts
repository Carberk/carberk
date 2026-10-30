import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";

import { MeasurementHttpSender } from "./MeasurementHttpSender";
import { MeasurementQueue } from "./MeasurementQueue";
import { FakeMeasurementPorts } from "./application/testing/FakeMeasurementPorts";

const event: MeasurementSchemas.MeasurementEvent = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", visitId: "00000000-0000-4000-8000-000000000002", occurredAt: "2026-10-15T00:00:00.000Z",
 purpose: "product_improvement", eventName: "listing_detail_opened", context: { platform: "android", release: "1.0", build: "1", locale: "en" }, payload: { listingId: "00000000-0000-4000-8000-000000000003" } };
describe("bounded real first-party HTTP queue delivery", () => {
 it("sends actual validated queue events with credentials outside the payload and clears acknowledged storage", async () => {
  const received: unknown[] = [], authorization: string[] = [];
  server.use(http.post("https://firstparty.test/api/v1/measurement/events", async ({ request }) => {
   authorization.push(request.headers.get("authorization") ?? ""); received.push(await request.json()); return new HttpResponse(null, { status: 204 });
  }));
  const ports = new FakeMeasurementPorts();
  const sender = new MeasurementHttpSender("https://firstparty.test/api/v1", async () => "Bearer mg_synthetic-capability", () => ports.nowMs);
  const queue = new MeasurementQueue({ ...ports, now: () => ports.now(), random: () => ports.random(), read: () => ports.read(), write: (value) => ports.write(value), send: (events, eligible) => sender.send(events, eligible) });
  queue.setEligibility({ generation: "synthetic-generation", purposes: ["product_improvement"] }); queue.emit(event); await queue.flush();
  expect(received).toEqual([{ events: [event] }]); expect(authorization).toEqual(["Bearer mg_synthetic-capability"]); expect(ports.stored).toBeNull();
 });
 it("honors Retry-After and never retries schema/authorization refusal", async () => {
  const sender = new MeasurementHttpSender("https://firstparty.test/api/v1", async () => "Bearer synthetic", () => Date.parse("2026-10-15T00:00:00Z"));
  server.use(http.post("https://firstparty.test/api/v1/measurement/events", () => new HttpResponse(null, { status: 429, headers: { "Retry-After": "60" } })));
  expect(await sender.send([event], () => true)).toEqual({ kind: "retry", retryAfterMs: 60000 });
  server.use(http.post("https://firstparty.test/api/v1/measurement/events", () => new HttpResponse(null, { status: 400 })));
  expect(await sender.send([event], () => true)).toEqual({ kind: "permanent" });
 });
 it("fences a switch during credential resolution and refuses URL credentials/query fragments", async () => {
  let eligible = true;
  const sender = new MeasurementHttpSender("https://firstparty.test/api/v1", async () => { eligible = false; return "Bearer raw"; }, () => 0);
  expect(await sender.send([event], () => eligible)).toEqual({ kind: "permanent" });
  expect(() => new MeasurementHttpSender("https://firstparty.test/api/v1?token=raw", async () => null, () => 0)).toThrow("Invalid measurement origin");
 });
});
