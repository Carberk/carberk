import { StaffSchemas } from "@auto-tm/contracts";
import type { StaffAuthoritySnapshot, StaffGrantChange } from "./ports/StaffAuthorityRepository";
import { StaffAuthorityDenied, type StaffSubject } from "./ports/StaffAuthorityPort";

export function assertCurrentStaffSession(actor: StaffAuthoritySnapshot | null, subject: StaffSubject, now: Date): asserts actor is StaffAuthoritySnapshot {
  if (!actor || actor.userId !== subject.userId || actor.sessionUserId !== subject.userId || actor.expiresAt <= now) throw new StaffAuthorityDenied("SESSION_REQUIRED");
  if (actor.suspended || actor.deleting) throw new StaffAuthorityDenied("USER_INACTIVE");
}
export function assertStaffElevation(actor: StaffAuthoritySnapshot, now: Date): void {
  if (!actor.elevatedUntil || actor.elevatedUntil <= now) throw new StaffAuthorityDenied("ELEVATION_REQUIRED");
}
const founderControlled = new Set(["founder.control", "history.export", "history.payment.history", "founder.refund.approve", "founder.admission", "founder.recovery", "analytics.aggregate", "analytics.investigate", "staff.manage"]);
export function assertStaffGrantChange(actor: StaffAuthoritySnapshot, input: StaffGrantChange, now: Date): void {
  assertCurrentStaffSession(actor, input, now);
  assertStaffElevation(actor, now);
  if (!actor.capabilities.includes("staff.manage") || input.targetUserId === input.userId || !input.reason.trim() || input.reason.length > 1000 || !StaffSchemas.StaffCapabilitySchema.safeParse(input.capability).success || (input.capability === "founder.control" && input.grant) || (founderControlled.has(input.capability) && !actor.capabilities.includes("founder.control"))) throw new StaffAuthorityDenied("GRANT_FORBIDDEN");
}
