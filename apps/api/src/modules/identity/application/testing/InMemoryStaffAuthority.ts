import type { StaffAuthorityRepository, StaffAuthoritySnapshot, StaffGrantChange } from "../../domain/ports/StaffAuthorityRepository";
import type { StaffSubject } from "../../domain/ports/StaffAuthorityPort";
export class InMemoryStaffAuthority implements StaffAuthorityRepository {
  readonly changes: StaffGrantChange[] = [];
  snapshot: StaffAuthoritySnapshot | null = null;
  readonly transactionSnapshots = new WeakMap<object, StaffAuthoritySnapshot | null>();
  async current(_input: StaffSubject, transaction?: unknown) {
    return typeof transaction === "object" && transaction !== null && this.transactionSnapshots.has(transaction)
      ? this.transactionSnapshots.get(transaction) ?? null : this.snapshot;
  }
  async change(input: StaffGrantChange, _now: Date): Promise<void> { this.changes.push(input); }
}
