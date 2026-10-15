import { describe, expect, it } from "vitest";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { MeasurementQueue } from "./MeasurementQueue";
import { FakeMeasurementPorts } from "./application/testing/FakeMeasurementPorts";

const event = (sequence = 1): MeasurementSchemas.MeasurementEvent => ({ version: 1, eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
 occurredAt: "2026-10-15T00:00:00.000Z", purpose: "product_improvement", eventName: "listing_detail_opened",
 context: { platform: "android", locale: "en", release: "1.0", build: "1" }, payload: { listingId: "00000000-0000-4000-8000-000000000003" } });
function ready() { const ports = new FakeMeasurementPorts(); const queue = new MeasurementQueue(ports); queue.setEligibility({ generation: "opaque-generation-1", purposes: ["product_improvement"] }); return { ports, queue }; }

describe("bounded nonblocking first-party queue", () => {
 it("defaults off and never stores or transmits an event until purpose eligibility exists", async () => {
  const ports = new FakeMeasurementPorts(); const queue = new MeasurementQueue(ports);
  queue.emit(event()); await queue.flush(); expect(ports.stored).toBeNull(); expect(ports.delivered).toEqual([]);
 });
 it("validates actual emitter inputs and refuses client guesses of committed outcomes", async () => {
  const { ports, queue } = ready();
  queue.emit({ ...event(), payload: { listingId: "phone:secret" } } as MeasurementSchemas.MeasurementEvent);
  queue.emit({ ...event(), eventName: "listing_published", payload: { listingId: event().payload.listingId, cityId: event().payload.listingId } } as MeasurementSchemas.MeasurementEvent);
  queue.emit(event()); await queue.flush(); expect(ports.delivered.flat()).toEqual([event()]);
 });
 it("deduplicates event IDs and bounds batches and oldest-drop queue capacity", async () => {
  const { ports, queue } = ready();
  for (let i = 1; i <= 1002; i++) queue.emit(event(i));
  queue.emit(event(1002)); await queue.flush();
  expect(ports.delivered[0]).toHaveLength(50); expect(ports.delivered[0]?.[0]?.eventId).toBe("00000000-0000-4000-8000-000000000003");
  expect(ports.stored?.events).toHaveLength(950);
 });
 it("keeps transient failure bounded, respects retry delay and discards permanently refused events", async () => {
  const { ports, queue } = ready(); ports.response = { kind: "retry", retryAfterMs: 60000 };
  queue.emit(event()); await queue.flush(); expect(ports.stored?.events).toHaveLength(1);
  await queue.flush(); expect(ports.delivered).toHaveLength(1);
  ports.nowMs += 60000; ports.response = { kind: "permanent" }; await queue.flush(); expect(ports.stored).toBeNull();
 });
 it("rejects expired/future events and clears buffered data when collection stops or account switches", async () => {
  const { ports, queue } = ready();
  queue.emit({ ...event(), occurredAt: "2026-10-01T00:00:00.000Z" });
  queue.emit({ ...event(), occurredAt: "2026-10-16T00:00:00.000Z" }); await queue.flush(); expect(ports.delivered).toEqual([]);
  queue.emit(event()); queue.setEligibility({ generation: "different-account-generation", purposes: ["product_improvement"] });
  await queue.flush(); expect(ports.delivered).toEqual([]); expect(ports.stored).toBeNull();
  queue.emit(event()); queue.setEligibility(null); await queue.flush(); expect(ports.stored).toBeNull();
 });
 it("does not reattach old persisted queues after restore or a deletion generation change", async () => {
  const { ports, queue } = ready(); ports.response = { kind: "retry" }; queue.emit(event()); await queue.flush();
  const restored = new MeasurementQueue(ports); restored.setEligibility({ generation: "after-delete-restored", purposes: ["product_improvement"] });
  ports.response = { kind: "accepted" }; await restored.flush(); expect(ports.delivered).toHaveLength(1); expect(ports.stored).toBeNull();
 });
 it("bounds retries and survives unavailable transport and storage without surfacing exceptions", async () => {
  const { ports, queue } = ready(); ports.throwTransport = true; ports.throwStorage = true; queue.emit(event());
  for (let i = 0; i < 13; i++) { await queue.flush(); ports.nowMs += 3600000; }
  expect(ports.delivered.length).toBeLessThanOrEqual(12);
 });
});
