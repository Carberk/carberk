import { describe, expect, it } from "vitest";

import { MinimizedNativeDiagnosticSchema, validateNativeDiagnostic } from "./native-diagnostic-telemetry";

const manifest = {
 release: "candidate-abc123", dist: "42", environment: "synthetic" as const,
 manifest_id: "a".repeat(64), abi: "arm64-v8a" as const,
 modules: [{ alias: "m1", build_id: "0123456789abcdef", app_owned: true }],
};
const now = Date.parse("2026-10-24T12:00:00.000Z");
const event = () => ({
 schema_version: 1, platform: "android_native", event_id: "1".repeat(32),
 timestamp: "2026-10-24T12:00:00.000Z", environment: "synthetic",
 release: "candidate-abc123", dist: "42", manifest_id: "a".repeat(64), abi: "arm64-v8a",
 signal: { number: 11, code: 0 }, crashing_tid: 7,
 modules: [{ alias: "m1", build_id: "0123456789abcdef" }],
 frames: [{ module: "m1", rel_pc: "ffffffffffffffff" }],
});
describe("separate minimized native diagnostic boundary", () => {
 it("preserves full uint64 relative PCs and zero signal code against exact protected inputs", () => {
  expect(validateNativeDiagnostic(event(), manifest, now)).toEqual(event());
 });
 it("rejects raw fields at every object boundary instead of stripping them", () => {
  for (const value of [
   { ...event(), abort_message: "private" },
   { ...event(), signal: { number: 11, code: 0, fault_address: "private" } },
   { ...event(), frames: [{ module: "m1", rel_pc: "1", pc: "private" }] },
   { ...event(), modules: [{ alias: "m1", build_id: "0123456789abcdef", path: "private" }] },
  ]) expect(validateNativeDiagnostic(value, manifest, now)).toBeNull();
 });
 it("refuses wrong build, ABI, environment, manifest or module identity and system-only stacks", () => {
  for (const patch of [{ release: "old" }, { dist: "43" }, { abi: "x86" }, { environment: "production" }, { manifest_id: "b".repeat(64) }, { modules: [{ alias: "m1", build_id: "ffffffff" }] }]) {
   expect(validateNativeDiagnostic({ ...event(), ...patch }, manifest, now)).toBeNull();
  }
  expect(validateNativeDiagnostic(event(), { ...manifest, modules: [{ ...manifest.modules[0], app_owned: false }] }, now)).toBeNull();
 });
 it("retains the original five minute age boundary and future tolerance", () => {
  expect(validateNativeDiagnostic(event(), manifest, now + 300_000)).toEqual(event());
  expect(validateNativeDiagnostic(event(), manifest, now + 300_001)).toBeNull();
  expect(validateNativeDiagnostic(event(), manifest, now - 5_000)).toEqual(event());
  expect(validateNativeDiagnostic(event(), manifest, now - 5_001)).toBeNull();
  expect(validateNativeDiagnostic(event(), manifest, NaN)).toBeNull();
 });
 it("rejects missing, duplicate, unused and ambiguous module associations", () => {
  expect(MinimizedNativeDiagnosticSchema.safeParse({ ...event(), modules: [] }).success).toBe(false);
  expect(validateNativeDiagnostic({ ...event(), frames: [{ module: "m2", rel_pc: "1" }] }, manifest, now)).toBeNull();
  expect(validateNativeDiagnostic({ ...event(), modules: [...event().modules, ...event().modules] }, manifest, now)).toBeNull();
  expect(validateNativeDiagnostic(event(), { ...manifest, modules: [...manifest.modules, ...manifest.modules] }, now)).toBeNull();
  expect(validateNativeDiagnostic({ ...event(), modules: [...event().modules, { alias: "m2", build_id: "abcd" }] }, manifest, now)).toBeNull();
 });
 it("bounds numeric fields, frames, modules, IDs and architecture-specific hex width", () => {
  for (const rel_pc of ["0x1", "-1", "1.1", "10000000000000000", "ABC", "00"]) expect(validateNativeDiagnostic({ ...event(), frames: [{ module: "m1", rel_pc }] }, manifest, now)).toBeNull();
  expect(validateNativeDiagnostic({ ...event(), frames: Array.from({ length: 51 }, () => event().frames[0]) }, manifest, now)).toBeNull();
  expect(validateNativeDiagnostic({ ...event(), signal: { number: 0, code: 0 } }, manifest, now)).toBeNull();
  expect(validateNativeDiagnostic({ ...event(), signal: { number: 11, code: 2147483648 } }, manifest, now)).toBeNull();
  expect(validateNativeDiagnostic({ ...event(), modules: [{ alias: "m1", build_id: "abc" }] }, manifest, now)).toBeNull();
 });
});
