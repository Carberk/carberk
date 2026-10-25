export interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogRepository {
  findMany(params: {
    allowedActions?: readonly string[];
    action?: string | undefined;
    targetType?: string | undefined;
    targetId?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogRow[]; total: number }>;
  create(
    data: {
      id?: string;
      actorId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      details?: Record<string, unknown> | null;
    },
    tx?: unknown,
  ): Promise<AuditLogRow>;
}

export const AUDIT_LOG_REPOSITORY = Symbol("AuditLogRepository");
