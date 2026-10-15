import type { AuditLogRepository, AuditLogRow } from "../../domain/ports/AuditLogRepository";

export class FakeAuditLogRepository implements AuditLogRepository {
  rows: AuditLogRow[] = [];
  fail = false;

  async findMany(params: {
    action?: string | undefined;
    allowedActions?: readonly string[];
    targetType?: string | undefined;
    targetId?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogRow[]; total: number }> {
    let filtered = this.rows;
    if (params.allowedActions) filtered = filtered.filter((row) => params.allowedActions!.includes(row.action));
    if (params.action) {
      filtered = filtered.filter((r) => r.action === params.action);
    }
    if (params.targetType) {
      filtered = filtered.filter((r) => r.targetType === params.targetType);
    }
    if (params.targetId) {
      filtered = filtered.filter((r) => r.targetId === params.targetId);
    }
    const sorted = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = sorted.length;
    const start = (params.page - 1) * params.pageSize;
    const items = sorted.slice(start, start + params.pageSize);
    return { items, total };
  }

  async create(data: Parameters<AuditLogRepository["create"]>[0]): Promise<AuditLogRow> {
    if (this.fail) throw new Error("Audit unavailable");
    const row = { ...data, id: `audit-${this.rows.length}`, details: data.details ?? null, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
}
