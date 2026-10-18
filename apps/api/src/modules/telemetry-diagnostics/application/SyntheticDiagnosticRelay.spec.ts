import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { DiagnosticTelemetrySchemas as D } from "@auto-tm/contracts";

import { GlitchTipDiagnosticTransport } from "../infrastructure/GlitchTipDiagnosticTransport";
import { SyntheticDiagnosticRelay, type DiagnosticAdmission } from "./SyntheticDiagnosticRelay";

const now = Date.parse("2026-10-18T12:00:00.000Z"), sid = "11111111-1111-4111-8111-111111111111";
const config: DiagnosticAdmission = { enabled: true, sessionIds: [sid], expiresAt: new Date(now + 60_000).toISOString(), release: "candidate-abc123", build: "42" };
const event = () => D.buildSyntheticDiagnostic({ message: "private-contact-canary", request: { headers: { authorization: "token-canary" } } }, { eventId: "12345678123442348234123456789012", occurredAt: new Date(now).toISOString(), release: config.release, build: config.build, platform: "javascript", component: "mobile", action: "publish", category: "unavailable", files: {} });
const subject = { userId: "user", sessionId: sid };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function collector(status = 200) {
 const received: string[] = []; const server = createServer(async (request, response) => {
  let body = ""; for await (const chunk of request) body += String(chunk); received.push(body);
  response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify({ id: "12345678123442348234123456789012" }));
 }); servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
 const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test collector");
 return { received, transport: new GlitchTipDiagnosticTransport(`http://127.0.0.1:${address.port}/api/1/store/`, "a".repeat(32), true) };
}
describe("synthetic diagnostic admission and real collector transport", () => {
 it("delivers only strict minimized candidate events through actual HTTP", async () => {
  const c = await collector(); const relay = new SyntheticDiagnosticRelay(config, async () => undefined, c.transport, () => now);
  expect(await relay.execute(subject, event())).toBe("delivered");
  expect(c.received).toHaveLength(1); expect(JSON.parse(c.received[0] ?? "null")).toEqual(event());
  expect(c.received[0]).not.toContain("canary");
 });
 it("keeps disabled, unknown-session, expired, old-release and raw SDK payloads out of storage", async () => {
  const c = await collector(); const relay = new SyntheticDiagnosticRelay(config, async () => undefined, c.transport, () => now);
  expect(await new SyntheticDiagnosticRelay({ ...config, enabled: false }, async () => undefined, c.transport, () => now).execute(subject, event())).toBe("denied");
  expect(await relay.execute({ ...subject, sessionId: "other" }, event())).toBe("denied");
  expect(await new SyntheticDiagnosticRelay({ ...config, expiresAt: new Date(now).toISOString() }, async () => undefined, c.transport, () => now).execute(subject, event())).toBe("denied");
  expect(await relay.execute(subject, { ...event(), release: "old" })).toBe("invalid");
  expect(await relay.execute(subject, { ...event(), request: { body: "canary" } })).toBe("invalid");
  expect(c.received).toEqual([]);
 });
 it("reports collector unavailability without retry queue and refuses redirects or credential-bearing targets", async () => {
  const c = await collector(503); const relay = new SyntheticDiagnosticRelay(config, async () => undefined, c.transport, () => now);
  expect(await relay.execute(subject, event())).toBe("unavailable");
  expect(() => new GlitchTipDiagnosticTransport("https://user:secret@collector.test/api/1/store/", "a".repeat(32))).toThrow("Invalid diagnostic collector configuration");
 });
 it("bounds collector work and rechecks current authority after delivery", async () => {
  const c = await collector(); let current = true;
  const relay = new SyntheticDiagnosticRelay(config, async () => { if (!current) throw new Error("revoked"); }, { send: async value => { const result = await c.transport.send(value); current = false; return result; } }, () => now);
  expect(await relay.execute(subject, event())).toBe("denied"); expect(c.received).toHaveLength(1);
  expect(await relay.execute(subject, event())).toBe("denied"); expect(c.received).toHaveLength(1);
 });
});
