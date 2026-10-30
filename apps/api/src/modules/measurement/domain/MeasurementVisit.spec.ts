import { describe, expect, it } from "vitest";
import { MeasurementVisit, type MeasurementVisitState } from "./MeasurementVisit";
const previous: MeasurementVisitState = { id: "old", principalId: "guest-generation", startedAt: new Date("2026-10-15T00:00:00Z"), foregroundAt: new Date("2026-10-15T00:10:00Z"), endedAt: null };
describe("measurement foreground visits", () => {
 it("keeps current visit within thirty minutes while account switches always separate it", () => {
  const renewed = MeasurementVisit.foreground(previous, "guest-generation", new Date("2026-10-15T00:39:59Z"), "fresh");
  expect(renewed.id).toBe("old"); expect(renewed.startedAt.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  expect(renewed.foregroundAt.toISOString()).toBe("2026-10-15T00:39:59.000Z");
  expect(MeasurementVisit.foreground(previous, "account-generation", new Date("2026-10-15T00:11:00Z"), "fresh").id).toBe("fresh");
 });
 it("starts a fresh visit after exact idle limit, closed visit or clock rollback", () => {
  expect(MeasurementVisit.foreground(previous, "guest-generation", new Date("2026-10-15T00:40:00Z"), "idle").id).toBe("idle");
  expect(MeasurementVisit.foreground({ ...previous, endedAt: new Date("2026-10-15T00:11:00Z") }, "guest-generation", new Date("2026-10-15T00:12:00Z"), "closed").id).toBe("closed");
  expect(MeasurementVisit.foreground(previous, "guest-generation", new Date("2026-10-14T23:00:00Z"), "rollback").id).toBe("rollback");
 });
 it("allows delayed original-visit facts without advancing foreground time or rebinding actors", () => {
  expect(MeasurementVisit.permits(previous, "guest-generation", new Date("2026-10-15T00:12:00Z"))).toBe(true);
  expect(MeasurementVisit.permits(previous, "new-account-generation", new Date("2026-10-15T00:12:00Z"))).toBe(false);
  expect(MeasurementVisit.permits(previous, "guest-generation", new Date("2026-10-14T23:59:59Z"))).toBe(false);
  expect(MeasurementVisit.permits(previous, "guest-generation", new Date("2026-10-15T00:40:00Z"))).toBe(false);
  expect(previous.foregroundAt.toISOString()).toBe("2026-10-15T00:10:00.000Z");
 });
 it("refuses facts after logout while accepting facts captured before that boundary", () => {
  const closed = { ...previous, endedAt: new Date("2026-10-15T00:11:00Z") };
  expect(MeasurementVisit.permits(closed, "guest-generation", new Date("2026-10-15T00:10:59Z"))).toBe(true);
  expect(MeasurementVisit.permits(closed, "guest-generation", new Date("2026-10-15T00:11:01Z"))).toBe(false);
 });
});
