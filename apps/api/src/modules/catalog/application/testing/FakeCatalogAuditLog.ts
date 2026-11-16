import type { CatalogAuditEntry, CatalogAuditLog } from "../ports/CatalogAuditLog";

export class FakeCatalogAuditLog implements CatalogAuditLog {
  entries: CatalogAuditEntry[] = [];

  async record(entry: CatalogAuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
