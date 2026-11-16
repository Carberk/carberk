import type { ListingAuditEntry, ListingAuditLog } from "../ports/ListingAuditLog";

export class FakeListingAuditLog implements ListingAuditLog {
  auditLogs: ListingAuditEntry[] = [];

  async record(entry: ListingAuditEntry): Promise<void> {
    this.auditLogs.push(entry);
  }
}
