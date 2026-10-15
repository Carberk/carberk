import type { StaffAuthorityRepository, StaffAuthoritySnapshot, StaffGrantChange } from "../../domain/ports/StaffAuthorityRepository";
import type { StaffSubject } from "../../domain/ports/StaffAuthorityPort";
export class InMemoryStaffAuthority implements StaffAuthorityRepository {
  snapshot: StaffAuthoritySnapshot | null = null;
  async current(_input: StaffSubject) { return this.snapshot; }
  async change(_input: StaffGrantChange, _now: Date): Promise<void> { throw new Error("Not implemented"); }
}
