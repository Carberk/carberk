import { describe, expect, it } from "vitest";

import { buildSyntheticDiagnostic, DiagnosticEventSchema } from "./diagnostic-telemetry";

const trusted = { eventId: "12345678123442348234123456789012", occurredAt: "2026-10-18T12:00:00.000Z", release: "carberk-abc123", build: "42", component: "mobile" as const, platform: "javascript" as const, action: "publish" as const, category: "unavailable" as const, files: { "app:///index.android.bundle": "app:///index.android.bundle" } };
const canary = "private+123@example.com secret-otp-193480 bearer-token";
describe("minimal diagnostic capture before cache or transport", () => {
 it("retains only exact admitted build frames and trusted attribution, never SDK-added canary fields", () => {
  const event = buildSyntheticDiagnostic({ message: canary, user: { email: canary }, request: { headers: { authorization: canary } }, breadcrumbs: [{ message: canary }], contexts: { device: { name: canary } }, attachments: [canary], exception: { values: [{ type: canary, value: canary, stacktrace: { frames: [{ filename: "app:///index.android.bundle", lineno: 41, colno: 9, vars: { canary } }, { filename: `file:///${canary}`, lineno: 1 }] } }] } }, trusted);
  expect(event).toMatchObject({ event_id: trusted.eventId, environment: "synthetic", release: "carberk-abc123", exception: { values: [{ type: "unavailable", value: "Controlled technical failure", stacktrace: { frames: [{ filename: "app:///index.android.bundle", lineno: 41, colno: 9 }] } }] } });
  expect(JSON.stringify(event)).not.toContain(canary); expect(event).not.toHaveProperty("user"); expect(event).not.toHaveProperty("request");
 });
 it("refuses native envelopes at the JS boundary and refuses expected business rejections", () => {
  expect(buildSyntheticDiagnostic({ platform: "cocoa" }, trusted)).toBeNull();
  expect(buildSyntheticDiagnostic({}, { ...trusted, category: "expected_rejection" })).toBeNull();
 });
 it("bounds frames and rejects extensions to the emitted wire contract", () => {
  const event = buildSyntheticDiagnostic({ exception: { values: [{ stacktrace: { frames: Array.from({ length: 1000 }, () => ({ filename: "app:///index.android.bundle", lineno: 2 })) } }] } }, trusted);
  expect(event?.exception.values[0]?.stacktrace.frames).toHaveLength(50);
  expect(DiagnosticEventSchema.safeParse({ ...event, user: { id: "private" } }).success).toBe(false);
 });
});
