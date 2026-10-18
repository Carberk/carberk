import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "../../test/msw";

import { SyntheticDiagnosticCapture } from "./SyntheticDiagnosticCapture";
import { syntheticSdkAdapter } from "./syntheticSdkAdapter";

const now = Date.parse("2026-10-18T12:00:00Z");
const context = { eventId: "12345678123442348234123456789012", occurredAt: new Date(now).toISOString(), release: "candidate-abc123", build: "42", component: "mobile" as const, platform: "javascript" as const, action: "publish" as const, category: "unavailable" as const, files: {} };
describe("controlled diagnostic capture through the real first-party boundary", () => {
 it("sends only minimized JS fields with credentials outside the body and defaults closed", async () => {
  const bodies: string[] = [], auth: (string | null)[] = [];
  server.use(http.post("https://firstparty.test/api/v1/diagnostic-telemetry/events", async ({ request }) => { bodies.push(await request.text()); auth.push(request.headers.get("authorization")); return HttpResponse.json({ accepted: true }, { status: 202 }); }));
  const current = async () => ({ generation: "fixture", expiresAt: now + 60_000, authorization: "Bearer synthetic" });
  const disabled = new SyntheticDiagnosticCapture("https://firstparty.test/api/v1", current, () => now);
  expect(await disabled.capture({ message: "canary" }, context, "fixture")).toBe("disabled");
  const client = new SyntheticDiagnosticCapture("https://firstparty.test/api/v1", current, () => now, true);
  const sdk = syntheticSdkAdapter(client, () => ({ context, generation: "fixture" }));
  expect(await sdk.beforeSend({ message: "canary", user: { email: "canary" } })).toBeNull();
  expect(sdk).toMatchObject({ enableNative: false, autoInitializeNativeSdk: false, enableNdk: false, defaultIntegrations: false, attachScreenshot: false, attachViewHierarchy: false });
  expect(auth).toEqual(["Bearer synthetic"]); expect(bodies).toHaveLength(1); expect(bodies[0]).not.toContain("canary"); expect(bodies[0]).not.toContain("Bearer");
 });
 it("refuses old generations, expired admission and native SDK events", async () => {
  const client = new SyntheticDiagnosticCapture("https://firstparty.test/api/v1", async () => ({ generation: "new", expiresAt: now + 1, authorization: "Bearer synthetic" }), () => now, true);
  expect(await client.capture({}, context, "old")).toBe("denied");
  expect(await client.capture({ platform: "cocoa" }, context, "new")).toBe("invalid");
  expect(await new SyntheticDiagnosticCapture("https://firstparty.test/api/v1", async () => ({ generation: "new", expiresAt: now, authorization: "Bearer synthetic" }), () => now, true).capture({}, context, "new")).toBe("denied");
 });
 it("drops offline capture without persistent raw cache or blocking core work and rejects unsafe destinations", async () => {
  server.use(http.post("https://firstparty.test/api/v1/diagnostic-telemetry/events", () => HttpResponse.error()));
  const client = new SyntheticDiagnosticCapture("https://firstparty.test/api/v1", async () => ({ generation: "fixture", expiresAt: now + 60_000, authorization: "Bearer synthetic" }), () => now, true);
  expect(await client.capture({}, context, "fixture")).toBe("unavailable"); client.reset();
  expect(await client.capture({}, context, "fixture")).toBe("denied");
  expect(() => new SyntheticDiagnosticCapture("https://firstparty.test/api/v1?secret=raw", async () => null)).toThrow("Invalid diagnostic origin");
 });
});
