import { describe, expect, it } from "vitest";

import { StaffCapabilitySchema, StaffGrantChangeSchema, StaffSummarySchema } from "./staff";
describe("purpose-scoped staff contracts", () => {
 it("keeps concrete distinct capabilities and rejects arbitrary authority", () => {
  expect(StaffCapabilitySchema.parse("diagnostics.reviewer")).toBe("diagnostics.reviewer");
  expect(StaffCapabilitySchema.safeParse("universal.admin").success).toBe(false);
 });
 it("requires an exact named target, action and nonempty bounded reason", () => {
  const input = { targetUserId: "550e8400-e29b-41d4-a716-446655440000", capability: "support.operations", reason: "Coverage", grant: true };
  expect(StaffGrantChangeSchema.safeParse(input).success).toBe(true);
  expect(StaffGrantChangeSchema.safeParse({ ...input, reason: " " }).success).toBe(false);
  expect(StaffGrantChangeSchema.safeParse({ ...input, targetUserId: "all" }).success).toBe(false);
 });
 it("exposes only capabilities and the existing elevation shape", () => {
  expect(StaffSummarySchema.parse({ capabilities: ["analytics.aggregate"], elevated: false, secret: "discarded" })).toEqual({ capabilities: ["analytics.aggregate"], elevated: false });
 });
});
