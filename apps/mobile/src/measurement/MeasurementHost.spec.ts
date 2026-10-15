import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { server } from "../../test/msw";
import { MeasurementHost, type MeasurementHostPorts } from "./MeasurementHost";
const visitId = "00000000-0000-4000-8000-000000000002";
const event: MeasurementSchemas.MeasurementEvent = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", visitId, occurredAt: "2026-10-15T00:00:00Z", purpose: "product_improvement", eventName: "listing_detail_opened", context: { platform: "android", release: "1.0", build: "1", locale: "ru" }, payload: { listingId: "00000000-0000-4000-8000-000000000003" } };
function setup() {
 let identity: string | null = null; let queue: unknown = null; let actorKey = "guest";
 const ports: MeasurementHostPorts = { now: () => Date.parse("2026-10-15T00:00:00Z"), random: () => 0.5,
  identity: async () => ({ actorKey, authorization: actorKey === "guest" ? null : "Bearer account" }), readIdentity: async () => identity,
  writeIdentity: async (value) => { identity = value; }, readQueue: async () => queue, writeQueue: async (value) => { queue = value; }, syntheticProof: async () => `ms_${"s".repeat(43)}` };
 return { ports, actor: (value: string) => { actorKey = value; }, storedQueue: () => queue, storedIdentity: () => identity };
}
describe("persisted measurement host and actor lifecycle", () => {
 it("defaults off without storage/network and uses bootstrap visits and protected credentials separately", async () => {
  const state = setup(); const off = new MeasurementHost("https://host.test/api/v1", state.ports); await off.foreground(); expect(off.currentVisit()).toBeNull(); expect(state.storedIdentity()).toBeNull();
  const received: unknown[] = [];
  server.use(http.post("https://host.test/api/v1/measurement/bootstrap", async ({ request }) => {
   expect(request.headers.get("x-measurement-synthetic")).toBe(`ms_${"s".repeat(43)}`);
   return HttpResponse.json({ visitId, generation: "guest-generation", purposes: ["product_improvement"], guestCapability: `mg_${"a".repeat(43)}` });
  }), http.post("https://host.test/api/v1/measurement/events", async ({ request }) => { received.push(await request.json()); expect(request.headers.get("authorization")).toBe(`Bearer mg_${"a".repeat(43)}`); return new HttpResponse(null, { status: 204 }); }));
  const host = new MeasurementHost("https://host.test/api/v1", state.ports, true); await host.foreground(); host.emit(event); host.flush(); await host.queue.flush();
  expect(received).toEqual([{ events: [event] }]); expect(state.storedQueue()).toBeNull();
  expect(state.storedIdentity()).toContain("guest-generation"); expect(JSON.stringify(received)).not.toContain("mg_");
 });
 it("fences late bootstrap completion after its deadline even if fetch ignores AbortController", async () => {
  const state = setup(); let release: (() => void) | undefined;
  server.use(http.post("https://host.test/api/v1/measurement/bootstrap", async () => {
   await new Promise<void>((resolve) => { release = resolve; });
   return HttpResponse.json({ visitId, generation: "stale-generation", purposes: ["product_improvement"], guestCapability: `mg_${"a".repeat(43)}` });
  }));
  const host = new MeasurementHost("https://host.test/api/v1", state.ports, true);
  const opening = host.foreground();
  // Simulate auth invalidation while a native fetch cannot yet be cancelled.
  await new Promise((resolve) => setTimeout(resolve, 10)); host.invalidate(); release?.(); await opening;
  expect(host.currentVisit()).toBeNull(); expect(state.storedIdentity()).toBeNull();
 });
 it("purges persisted old facts and identity immediately at logout so a same-account return cannot hydrate them", async () => {
  const state = setup();
  await state.ports.writeIdentity(JSON.stringify({ visitId, generation: "old-generation", purposes: ["product_improvement"], actorKey: "same-account" }));
  await state.ports.writeQueue({ generation: "old-generation", events: [event], attempts: 1, retryAt: 0 });
  const host = new MeasurementHost("https://host.test/api/v1", state.ports, true); host.invalidate();
  await Promise.resolve();
  expect(state.storedIdentity()).toBeNull(); expect(state.storedQueue()).toBeNull();
 });
 it("clears pending old actor facts synchronously and never sends them with a new account credential", async () => {
  const state = setup(); let delivered = 0;
  server.use(http.post("https://host.test/api/v1/measurement/bootstrap", () => HttpResponse.json({ visitId, generation: "guest-generation", purposes: ["product_improvement"], guestCapability: `mg_${"a".repeat(43)}` })), http.post("https://host.test/api/v1/measurement/events", () => { delivered++; return new HttpResponse(null, { status: 204 }); }));
  const host = new MeasurementHost("https://host.test/api/v1", state.ports, true); await host.foreground(); host.emit(event); state.actor("other-account"); host.invalidate();
  expect(host.currentVisit()).toBeNull(); await host.queue.flush(); expect(delivered).toBe(0); expect(state.storedQueue()).toBeNull();
 });
});
