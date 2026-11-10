import { Inject, Injectable, BadRequestException } from "@nestjs/common";

import { AdminSchemas, AdminTablePaginationRequestSchema } from "@auto-tm/contracts";

import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import { IDENTITY_READ_PORT, type IdentityReadPort } from "../../identity/identity.public";

export interface ListReportsInput {
  status?: string | undefined;
  targetType?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface ListReportsResult {
  items: Array<{
    id: string;
    status: string;
    createdAt: Date;
    reason: string;
    targetType: string;
    targetId: string;
    targetSummary: {
      available: boolean;
      label: string;
      targetType: string;
      targetId: string;
      hasVideo?: boolean;
    };
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class ListReports {
  constructor(
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listingsRead: ListingsReadPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
  ) {}

  async execute(input: ListReportsInput): Promise<ListReportsResult> {
    const validated = this.validate(input);

    const { items, total } = await this.reportRepo.findMany({
      status: validated.status,
      targetType: validated.targetType,
      page: validated.page,
      pageSize: validated.pageSize,
    });

    const targetSummaries = await this.resolveTargetSummaries(items);

    const totalPages = Math.ceil(total / validated.pageSize);

    return {
      items: items.map((report) => ({
        id: report.id,
        status: report.status,
        createdAt: report.createdAt,
        reason: report.reason,
        targetType: report.targetType,
        targetId: report.targetId,
        targetSummary: targetSummaries.get(this.targetKey(report.targetType, report.targetId)) ?? {
          available: false,
          label: "Unavailable target",
          targetType: report.targetType,
          targetId: report.targetId,
        },
      })),
      total,
      page: validated.page,
      pageSize: validated.pageSize,
      totalPages,
    };
  }

  private validate(input: ListReportsInput): {
    status: string | undefined;
    targetType: string | undefined;
    page: number;
    pageSize: number;
  } {
    const paginationResult = this.safeParse(AdminTablePaginationRequestSchema, {
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 50,
    });

    const status = input.status ?? "pending";
    const targetType = input.targetType;

    if (!Object.values(AdminSchemas.ContentReportStatus).includes(status as AdminSchemas.ContentReportStatus)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid status filter",
      });
    }

    if (
      targetType !== undefined &&
      !["listing", "user", "message"].includes(targetType)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid targetType filter",
      });
    }

    return {
      status,
      targetType,
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

  private async resolveTargetSummaries(
    reports: Array<{
      targetType: string;
      targetId: string;
      messageContext: { messageId: string; conversationId: string; deletedAt: Date | null } | null;
    }>,
  ): Promise<Map<string, { available: boolean; label: string; targetType: string; targetId: string; hasVideo?: boolean }>> {
    const listingIds: string[] = [];
    const userIds: string[] = [];

    for (const r of reports) {
      if (r.targetType === "listing") {
        listingIds.push(r.targetId);
      } else if (r.targetType === "user") {
        userIds.push(r.targetId);
      }
    }

    const [listings, users] = await Promise.all([
      this.listingsRead.getListingAdminSummaries(listingIds),
      this.identityRead.findUsersByIds(userIds),
    ]);

    const map = new Map<string, { available: boolean; label: string; targetType: string; targetId: string; hasVideo?: boolean }>();

    for (const l of listings) {
      const label = l.year
        ? `${l.year} ${l.brandName} ${l.modelName}`
        : `${l.brandName} ${l.modelName}`;
      map.set(this.targetKey("listing", l.id), {
        available: true,
        label,
        targetType: "listing",
        targetId: l.id,
        hasVideo: l.hasVideo ?? false,
      });
    }

    for (const u of users) {
      map.set(this.targetKey("user", u.id), {
        available: true,
        label: u.displayName ?? `User ${u.id.slice(0, 8)}`,
        targetType: "user",
        targetId: u.id,
      });
    }

    for (const r of reports) {
      if (r.targetType === "message") {
        const ctx = r.messageContext;
        const label = ctx
          ? ctx.deletedAt
            ? "Сообщение удалено"
            : "Сообщение"
          : "Сообщение удалено или недоступно";
        map.set(this.targetKey("message", r.targetId), {
          available: ctx != null,
          label,
          targetType: "message",
          targetId: r.targetId,
        });
      }
    }

    return map;
  }

  private targetKey(targetType: string, targetId: string): string {
    return `${targetType}:${targetId}`;
  }
}
