import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { syntheticMeasurementAdmission } from "./SyntheticMeasurementAdmission";
const credential = `ms_${"a".repeat(43)}`;
const hash = createHash("sha256").update(credential).digest("hex");
describe("operator-scoped synthetic measurement admission", () => {
 it("refuses public callers, expired proof and production regardless of supplied header", () => {
  expect(syntheticMeasurementAdmission({ environment: "staging", hash, expiresAt: "2026-10-16T00:00:00Z" }, undefined, new Date("2026-10-15T00:00:00Z"))).toBe(false);
  expect(syntheticMeasurementAdmission({ environment: "staging", hash, expiresAt: "2026-10-16T00:00:00Z" }, credential, new Date("2026-10-16T00:00:00Z"))).toBe(false);
  expect(syntheticMeasurementAdmission({ environment: "production", hash, expiresAt: "2026-10-16T00:00:00Z" }, credential, new Date("2026-10-15T00:00:00Z"))).toBe(false);
 });
 it("admits only an exact protected scoped proof, never an arbitrary synthetic label", () => {
  expect(syntheticMeasurementAdmission({ environment: "staging", hash, expiresAt: "2026-10-15T01:00:00Z" }, credential, new Date("2026-10-15T00:00:00Z"))).toBe(true);
  expect(syntheticMeasurementAdmission({ environment: "staging", hash, expiresAt: "2026-10-15T01:00:00Z" }, `ms_${"b".repeat(43)}`, new Date("2026-10-15T00:00:00Z"))).toBe(false);
 });
});
