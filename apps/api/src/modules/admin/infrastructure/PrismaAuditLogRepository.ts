import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, Prisma } from "@auto-tm/db";

import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findMany(params: {
    action?: string;
    allowedActions?: readonly string[];
    targetType?: string;
    targetId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogRow[]; total: number }> {
    const where: Record<string, unknown> = params.allowedActions ? { AND: [{ action: { in: [...params.allowedActions] } }] } : {};
    if (params.action) {
      where["action"] = params.action;
    }
    if (params.targetType) {
      where["targetType"] = params.targetType;
    }
    if (params.targetId) {
      where["targetId"] = params.targetId;
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details: r.details as Record<string, unknown> | null,
        createdAt: r.createdAt,
      })),
      total,
    };
  }

  async create(
    data: {
      actorId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      details?: Record<string, unknown> | null;
    },
    tx?: unknown,
  ): Promise<AuditLogRow> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const row = await client.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        details: data.details ? (data.details as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    return {
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      details: row.details as Record<string, unknown> | null,
      createdAt: row.createdAt,
    };
  }
}
