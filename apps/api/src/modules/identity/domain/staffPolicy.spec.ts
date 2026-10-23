import { describe, expect, it } from "vitest";
import { assertStaffGrantChange } from "./staffPolicy";
import type { StaffAuthoritySnapshot, StaffGrantChange } from "./ports/StaffAuthorityRepository";
const now = new Date("2026-10-15T00:00:00Z");
const actor: StaffAuthoritySnapshot = { userId: "founder", sessionUserId: "founder", role: "buyer", suspended: false, deleting: false, expiresAt: new Date("2026-10-16T00:00:00Z"), elevatedUntil: new Date("2026-10-15T12:00:00Z"), capabilities: ["staff.manage", "founder.control"] };
const change: StaffGrantChange = { userId: "founder", sessionId: "session", targetUserId: "staff", capability: "support.operations", reason: "Named coverage", grant: true };
describe("explicit staff grant transitions", () => {
 it("permits elevated named grant and revoke authority with a reason", () => {
  expect(() => assertStaffGrantChange(actor, change, now)).not.toThrow();
  expect(() => assertStaffGrantChange(actor, { ...change, grant: false }, now)).not.toThrow();
 });
 it.each(["history.export", "history.payment.history", "founder.refund.approve", "founder.admission", "founder.recovery", "analytics.aggregate", "analytics.investigate", "staff.manage"])("reserves %s grants for explicit founder control", (capability) => {
  expect(() => assertStaffGrantChange({ ...actor, capabilities: ["staff.manage"] }, { ...change, capability }, now)).toThrow();
  expect(() => assertStaffGrantChange(actor, { ...change, capability }, now)).not.toThrow();
 });
 it.each([
  { targetUserId: "founder" }, { reason: " " }, { capability: "universal.admin" }, { capability: "founder.control" },
 ])("rejects unsupported/self-directed/no-reason transition %j", (patch) => {
  expect(() => assertStaffGrantChange(actor, { ...change, ...patch }, now)).toThrow();
 });
 it("allows a different elevated founder to revoke founder control without permitting HTTP root grants", () => {
  expect(() => assertStaffGrantChange(actor, { ...change, capability: "founder.control", grant: false }, now)).not.toThrow();
  expect(() => assertStaffGrantChange({ ...actor, capabilities: ["staff.manage"] }, { ...change, capability: "founder.control", grant: false }, now)).toThrow();
 });
 it("never derives staff management from marketplace admin role", () => {
  expect(() => assertStaffGrantChange({ ...actor, role: "admin", capabilities: [] }, change, now)).toThrow();
 });
 it("refuses expired elevation even with explicit founder grant", () => {
  expect(() => assertStaffGrantChange({ ...actor, elevatedUntil: now }, change, now)).toThrow();
 });
});
