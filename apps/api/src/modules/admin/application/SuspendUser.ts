import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService, userEligibilitySourceCommand, withDiagnosticSourceCommand } from "@auto-tm/db";
import { AdminSchemas } from "@auto-tm/contracts";

import {
  IDENTITY_ADMIN_PORT,
  IDENTITY_READ_PORT,
  type IdentityAdminPort,
  type IdentityReadPort,
} from "../../identity/identity.public";
import { MESSAGE_MODERATION_READ_PORT, type MessageModerationReadPort } from "../../conversations/domain/ports/MessageModerationReadPort";
import { reportedMessageSenderId } from "../domain/reportedMessageSenderId";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";
import type { AuditLogRepository } from "../domain/ports/AuditLogRepository";
import { AUDIT_LOG_REPOSITORY } from "../domain/ports/AuditLogRepository";

export interface SuspendUserInput {
  userId: string;
  adminUserId: string;
  reason: string;
  reportId?: string | undefined;
}

export interface SuspendUserResult {
  targetId: string;
  targetState: {
    suspendedAt: Date;
    suspendedById: string;
    suspensionReason: string;
  };
  reportId?: string | undefined;
  reportStatus?: "actioned" | undefined;
  auditLogId: string;
}

@Injectable()
export class SuspendUser {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
    @Inject(IDENTITY_ADMIN_PORT)
    private readonly identityAdmin: IdentityAdminPort,
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: AuditLogRepository,
    @Inject(MESSAGE_MODERATION_READ_PORT)
    private readonly messageRead: MessageModerationReadPort,
  ) {}

  async execute(input: SuspendUserInput): Promise<SuspendUserResult> {
    // 1. Resolve user (required for both direct and report-backed)
    const user = await this.identityRead.findUserById(input.userId);

    if (!user || user.deleted) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 2. Admin/self policy (checked before mutation/report/audit)
    if (user.role === "admin") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin targets cannot be moderated",
        details: {
          reason: AdminSchemas.AdminErrorReason.AdminTargetNotModeratable,
        },
      });
    }

    if (user.id === input.adminUserId) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Self-moderation is not allowed",
        details: {
          reason: AdminSchemas.AdminErrorReason.SelfModerationNotAllowed,
        },
      });
    }

    // 3. Report-backed validation (if reportId provided)
    let report: Awaited<ReturnType<ContentReportRepository["findById"]>> = null;
    if (input.reportId) {
      report = await this.reportRepo.findById(input.reportId);

      if (!report) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      const matchesUser = report.targetType === "user" && report.targetId === input.userId;
      const message = report.targetType === "message"
        ? await this.messageRead.getReportedMessage(report.targetId)
        : null;
      const matchesMessageSender = report.targetType === "message" &&
        reportedMessageSenderId(report, message) === input.userId;
      if (!matchesUser && !matchesMessageSender) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "Report does not match the target user",
          details: {
            reason: AdminSchemas.AdminErrorReason.ReportTargetMismatch,
          },
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

      // Revalidate target actionability at report-action time
      if (user.suspendedAt != null) {
        throw new ConflictException({
          code: "CONFLICT",
          message: "Report target is no longer actionable",
          details: {
            reason: AdminSchemas.AdminErrorReason.ReportTargetNotActionable,
            targetState: { suspendedAt: user.suspendedAt },
          },
        });
      }
    } else {
      // Direct suspend: revalidate current target state
      if (user.suspendedAt != null) {
        throw new ConflictException({
          code: "CONFLICT",
          message: "User is already suspended",
          details: {
            reason: AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
            targetState: { suspendedAt: user.suspendedAt },
          },
        });
      }
    }

    // 4. Execute mutation + audit in one transaction
    const auditId = randomUUID(), reviewedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const command = await userEligibilitySourceCommand(tx, { userId: input.userId, actorUserId: input.adminUserId,
        suspendedAt: reviewedAt, reason: input.reason,
        intent: { auditId, reason: input.reason, ...(report ? { report: { id: report.id, reviewedAt: reviewedAt.toISOString() } } : {}) } });
      return withDiagnosticSourceCommand(tx, command, async receipt => {
        const locked = await tx.user.findUnique({ where: { id: input.userId } });
        if (!locked || locked.role !== user.role || locked.suspendedAt?.getTime() !== user.suspendedAt?.getTime()
          || locked.suspendedById !== user.suspendedById || locked.suspensionReason !== user.suspensionReason) throw new Error("diagnostic_source_graph_changed");
      const suspendResult = await this.identityAdmin.suspendUser(
        input.userId,
        input.adminUserId,
        input.reason,
        tx,
        receipt,
        reviewedAt,
      );

      // Action the report if provided
      let reportStatus: "actioned" | undefined;
      if (report) {
        await this.reportRepo.updateStatus(
          report.id,
          {
            status: "actioned",
            reviewedById: input.adminUserId,
            reviewedAt,
          },
          tx,
        );
        reportStatus = "actioned";
      }

      // Write audit log
      const auditDetails: Record<string, unknown> = {
        reason: input.reason,
        before: {
          suspendedAt: user.suspendedAt,
          suspendedById: user.suspendedById,
          suspensionReason: user.suspensionReason,
        },
        after: {
          suspendedAt: suspendResult.suspendedAt,
          suspendedById: suspendResult.suspendedById,
          suspensionReason: suspendResult.suspensionReason,
        },
      };
      if (report) {
        auditDetails["reportId"] = report.id;
        if (report.targetType === "message") auditDetails["messageId"] = report.targetId;
        (auditDetails["before"] as Record<string, unknown>)["reportStatus"] = "pending";
        (auditDetails["after"] as Record<string, unknown>)["reportStatus"] = "actioned";
      }

      const auditRow = await this.auditRepo.create(
        {
          id: auditId,
          actorId: input.adminUserId,
          action: AdminSchemas.AdminAuditAction.UserSuspend,
          targetType: "user",
          targetId: input.userId,
          details: auditDetails,
        },
        tx,
      );

      return {
        targetId: input.userId,
        targetState: {
          suspendedAt: suspendResult.suspendedAt,
          suspendedById: suspendResult.suspendedById,
          suspensionReason: suspendResult.suspensionReason,
        },
        reportId: report ? report.id : undefined,
        reportStatus,
        auditLogId: auditRow.id,
      };
      });
    });

    return result;
  }
}
