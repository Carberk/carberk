import type { StaffAuthoritySnapshot, StaffGrantChange } from "./ports/StaffAuthorityRepository";
import { StaffAuthorityDenied } from "./ports/StaffAuthorityPort";
export function assertStaffGrantChange(_actor: StaffAuthoritySnapshot, _input: StaffGrantChange, _now: Date): void {
  throw new StaffAuthorityDenied("GRANT_FORBIDDEN");
}
