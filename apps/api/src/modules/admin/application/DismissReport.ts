import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { MODERATION_UNIT_OF_WORK, type ModerationUnitOfWork } from "./ports/ModerationUnitOfWork";
import { AdminSchemas } from "@auto-tm/contracts";

import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";

export interface DismissReportInput {
  reportId: string;
  adminUserId: string;
  reason: string;
}

export interface DismissReportResult {
  reportId: string;
  status: "dismissed";
  reviewedAt: string;
  auditLogId: string;
}

@Injectable()
export class DismissReport {
  constructor(
    @Inject(MODERATION_UNIT_OF_WORK)
    private readonly moderation: ModerationUnitOfWork,
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
  ) {}

  async execute(input: DismissReportInput): Promise<DismissReportResult> {
    const report = await this.reportRepo.findById(input.reportId);

    if (!report) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Report not found",
      });
    }

    if (report.status !== "pending") {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Report has already been resolved",
        details: {
          reason: AdminSchemas.AdminErrorReason.ReportAlreadyResolved,
          reportStatus: report.status,
        },
      });
    }

    const reviewedAt = new Date();

    const result = await this.moderation.run(async (tx) => {
      await tx.reports.updateStatus(
        report.id,
        {
          status: "dismissed",
          reviewedById: input.adminUserId,
          reviewedAt,
        },
      );

      const auditRow = await tx.audit.create(
        {
          actorId: input.adminUserId,
          action: AdminSchemas.AdminAuditAction.ContentReportResolve,
          targetType: "content_report",
          targetId: report.id,
          details: {
            reason: input.reason,
            reportedTargetType: report.targetType,
            reportedTargetId: report.targetId,
            before: { status: report.status },
            after: { status: "dismissed" },
          },
        },
      );

      return {
        reportId: report.id,
        status: "dismissed" as const,
        reviewedAt: reviewedAt.toISOString(),
        auditLogId: auditRow.id,
      };
    });

    return result;
  }
}
