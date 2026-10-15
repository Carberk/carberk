import { expect, it } from "vitest";
import { serviceAttachmentDue, supportCaseDue } from "./serviceRetention";
const now = new Date("2026-10-15T12:00:00Z");
it("uses the current closure boundary and never purges a reopened Support case", () => {
 const boundary = new Date(now.getTime() - 90 * 86400000);
 expect(supportCaseDue({ status: "closed", closedAt: boundary }, now)).toBe(true);
 expect(supportCaseDue({ status: "closed", closedAt: new Date(boundary.getTime() + 1) }, now)).toBe(false);
 expect(supportCaseDue({ status: "open", closedAt: boundary }, now)).toBe(false);
});
it("applies History attachment schedules without inheriting the Support period", () => {
 const retained = { schedule: { kind: "until", until: "2027-01-01T00:00:00Z" }, hold: null };
 expect(serviceAttachmentDue(retained, now)).toBe(false);
 expect(serviceAttachmentDue({ ...retained, schedule: { kind: "until", until: now.toISOString() } }, now)).toBe(true);
 expect(serviceAttachmentDue({ schedule: { kind: "permitted_knowledge", reviewAt: "2020-01-01T00:00:00Z" }, hold: null }, now)).toBe(false);
});
it("preserves a specific active hold and refuses to guess when category policy is missing", () => {
 const expired = { schedule: { kind: "until", until: "2020-01-01T00:00:00Z" }, hold: { until: "2027-01-01T00:00:00Z" } };
 expect(serviceAttachmentDue(expired, now)).toBe(false);
 expect(serviceAttachmentDue({ ...expired, hold: { until: "2020-01-01T00:00:00Z" } }, now)).toBe(true);
 expect(serviceAttachmentDue({}, now)).toBe(false);
});
