import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MODERATION_UNIT_OF_WORK, type ModerationUnitOfWork } from "./ports/ModerationUnitOfWork";
import { AdminSchemas } from "@auto-tm/contracts";

import {
  IDENTITY_READ_PORT,
  type IdentityReadPort,
} from "../../identity/identity.public";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";

export interface RemoveUserPhotoInput {
  userId: string;
  adminUserId: string;
  reason: string;
  reportId?: string | undefined;
}

export interface RemoveUserPhotoResult {
  targetId: string;
  targetState: { avatarKey: null; avatarIndex: number };
  reportId?: string | undefined;
  reportStatus?: "actioned" | undefined;
  auditLogId: string;
}

/**
 * A moderator removes a User's Profile Photo, so the User's Assigned Avatar
 * shows again. The photo's release (which retires its upload and records the
 * storage deletion), the report's resolution and the audit entry commit in one
 * transaction. The User is not suspended and may set another photo; a
 * suspended User's photo can be removed too.
 */
@Injectable()
export class RemoveUserPhoto {
  constructor(
    @Inject(MODERATION_UNIT_OF_WORK)
    private readonly moderation: ModerationUnitOfWork,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
  ) {}

  async execute(input: RemoveUserPhotoInput): Promise<RemoveUserPhotoResult> {
    const user = await this.identityRead.findUserById(input.userId);
    if (!user) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "User not found" });
    }

    if (user.role === "admin") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin targets cannot be moderated",
        details: { reason: AdminSchemas.AdminErrorReason.AdminTargetNotModeratable },
      });
    }
    if (user.id === input.adminUserId) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Self-moderation is not allowed",
        details: { reason: AdminSchemas.AdminErrorReason.SelfModerationNotAllowed },
      });
    }

    let report: Awaited<ReturnType<ContentReportRepository["findById"]>> = null;
    if (input.reportId) {
      report = await this.reportRepo.findById(input.reportId);
      if (!report) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Report not found" });
      }
      if (report.targetType !== "user" || report.targetId !== input.userId) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "Report does not match the target user",
          details: { reason: AdminSchemas.AdminErrorReason.ReportTargetMismatch },
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
    }

    const noPhoto = () =>
      new ConflictException({
        code: "CONFLICT",
        message: report ? "Report target is no longer actionable" : "User has no profile photo",
        details: {
          reason: report
            ? AdminSchemas.AdminErrorReason.ReportTargetNotActionable
            : AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
          targetState: { avatarKey: null },
        },
      });
    if (user.avatarKey === null) throw noPhoto();

    return this.moderation.run(async (tx) => {
      const { removedKey } = await tx.photos.release(input.userId);
      if (removedKey === null) throw noPhoto();

      let reportStatus: "actioned" | undefined;
      if (report) {
        await tx.reports.updateStatus(
          report.id,
          { status: "actioned", reviewedById: input.adminUserId, reviewedAt: new Date() },
        );
        reportStatus = "actioned";
      }

      const auditRow = await tx.audit.create(
        {
          actorId: input.adminUserId,
          action: AdminSchemas.AdminAuditAction.UserPhotoRemove,
          targetType: "user",
          targetId: input.userId,
          details: {
            reason: input.reason,
            avatarIndex: user.avatarIndex,
            ...(report ? { reportId: report.id } : {}),
            before: { avatarKey: removedKey, ...(report ? { reportStatus: "pending" } : {}) },
            after: { avatarKey: null, ...(report ? { reportStatus: "actioned" } : {}) },
          },
        },
      );

      return {
        targetId: input.userId,
        targetState: { avatarKey: null, avatarIndex: user.avatarIndex },
        reportId: report ? report.id : undefined,
        reportStatus,
        auditLogId: auditRow.id,
      };
    });
  }
}
