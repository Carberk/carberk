import type { StaffAuthorityRepository, StaffAuthoritySnapshot, StaffGrantChange } from "../../domain/ports/StaffAuthorityRepository";
import type { StaffSubject } from "../../domain/ports/StaffAuthorityPort";
export class InMemoryStaffAuthority implements StaffAuthorityRepository {
  readonly changes: StaffGrantChange[] = [];
  snapshot: StaffAuthoritySnapshot | null = null;
  async current(_input: StaffSubject) { return this.snapshot; }
  async change(input: StaffGrantChange, _now: Date): Promise<void> { this.changes.push(input); }
}
