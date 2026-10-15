import { Inject, Injectable, BadRequestException } from "@nestjs/common";

import { AdminSchemas, AdminTablePaginationRequestSchema } from "@auto-tm/contracts";

import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";
import { AUDIT_LOG_REPOSITORY } from "../domain/ports/AuditLogRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import { IDENTITY_READ_PORT, type IdentityReadPort } from "../../identity/identity.public";

export interface ListAuditEntriesInput {
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface ListAuditEntriesResult {
  items: Array<{
    id: string;
    createdAt: Date;
    action: string;
    actorSummary: {
      id?: string;
      label: string;
    };
    targetType: string;
    targetId: string;
    targetLabel?: string | undefined;
    reasonPreview?: string | undefined;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class ListAuditEntries {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: AuditLogRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listingsRead: ListingsReadPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
  ) {}

  async execute(input: ListAuditEntriesInput): Promise<ListAuditEntriesResult> {
    const validated = this.validate(input);

    const { items, total } = await this.auditRepo.findMany({
      allowedActions: Object.values(AdminSchemas.AdminAuditAction),
      action: validated.action,
      targetType: validated.targetType,
      targetId: validated.targetId,
      page: validated.page,
      pageSize: validated.pageSize,
    });

    const [actorMap, targetMap] = await Promise.all([
      this.resolveActors(items),
      this.resolveTargets(items),
    ]);

    const totalPages = Math.ceil(total / validated.pageSize);

    return {
      items: items.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        actorSummary: actorMap.get(row.id) ?? { label: "Deleted admin" },
        targetType: row.targetType,
        targetId: row.targetId,
        targetLabel: targetMap.get(this.targetKey(row.targetType, row.targetId)),
        reasonPreview: this.extractReasonPreview(row.details),
      })),
      total,
      page: validated.page,
      pageSize: validated.pageSize,
      totalPages,
    };
  }

  private validate(input: ListAuditEntriesInput): {
    action: string | undefined;
    targetType: string | undefined;
    targetId: string | undefined;
    page: number;
    pageSize: number;
  } {
    const paginationResult = this.safeParse(AdminTablePaginationRequestSchema, {
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 50,
    });

    const action = input.action;
    const targetType = input.targetType;
    const targetId = input.targetId;

    const validActions: string[] = Object.values(AdminSchemas.AdminAuditAction);
    if (action !== undefined && !validActions.includes(action)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid action filter",
      });
    }

    const validTargetTypes = ["listing", "user", "content_report"];
    if (targetType !== undefined && !validTargetTypes.includes(targetType)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid targetType filter",
      });
    }

    return {
      action,
      targetType,
      targetId,
      page: paginationResult.page,
      pageSize: paginationResult.pageSize,
    };
  }

  private safeParse<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
    try {
      return schema.parse(data);
    } catch {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid pagination",
      });
    }
  }

  private async resolveActors(
    rows: AuditLogRow[],
  ): Promise<Map<string, { id?: string; label: string }>> {
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
    const users = actorIds.length > 0 ? await this.identityRead.findUsersByIds(actorIds as string[]) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const map = new Map<string, { id?: string; label: string }>();
    for (const row of rows) {
      if (row.actorId) {
        const user = userMap.get(row.actorId);
        if (user) {
          map.set(row.id, { id: user.id, label: user.displayName ?? `Admin ${user.id.slice(0, 8)}` });
        } else {
          map.set(row.id, { label: "Deleted admin" });
        }
      } else if (row.action === AdminSchemas.AdminAuditAction.AdminBootstrapPromote) {
        map.set(row.id, { label: "Operator script" });
      } else {
        map.set(row.id, { label: "Deleted admin" });
      }
    }

    return map;
  }

  private async resolveTargets(
    rows: AuditLogRow[],
  ): Promise<Map<string, string>> {
    const listingIds: string[] = [];
    const userIds: string[] = [];

    for (const r of rows) {
      if (r.targetType === "listing") {
        listingIds.push(r.targetId);
      } else if (r.targetType === "user") {
        userIds.push(r.targetId);
      }
    }

    const [listings, users] = await Promise.all([
      listingIds.length > 0 ? this.listingsRead.getListingAdminSummaries(listingIds) : Promise.resolve([]),
      userIds.length > 0 ? this.identityRead.findUsersByIds(userIds) : Promise.resolve([]),
    ]);

    const map = new Map<string, string>();

    for (const l of listings) {
      const label = l.year ? `${l.year} ${l.brandName} ${l.modelName}` : `${l.brandName} ${l.modelName}`;
      map.set(this.targetKey("listing", l.id), label);
    }

    for (const u of users) {
      map.set(this.targetKey("user", u.id), u.displayName ?? `User ${u.id.slice(0, 8)}`);
    }

    return map;
  }

  private extractReasonPreview(details: Record<string, unknown> | null): string | undefined {
    if (!details) return undefined;
    const reason = details["reason"];
    if (typeof reason !== "string") return undefined;
    // One-line preview: replace newlines with spaces, trim
    const preview = reason.replace(/\r?\n/g, " ").trim();
    return preview.length > 0 ? preview : undefined;
  }

  private targetKey(targetType: string, targetId: string): string {
    return `${targetType}:${targetId}`;
  }
}
