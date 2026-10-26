import { withAvatarPreparation, AvatarContactScopeChanged, AVATAR_CONTACT_UUID_FACTORY } from "../../../common/avatar-contact-preparation";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { AdminSchemas } from "@auto-tm/contracts";

import {
  IDENTITY_CLOCK_PORT,
  type ClockPort,
  IDENTITY_READ_PORT,
  PROFILE_PHOTO_PORT,
  type IdentityReadPort,
  type ProfilePhotoPort,
} from "../../identity/identity.public";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";
import type { AuditLogRepository } from "../domain/ports/AuditLogRepository";
import { AUDIT_LOG_REPOSITORY } from "../domain/ports/AuditLogRepository";

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
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
    @Inject(PROFILE_PHOTO_PORT)
    private readonly photos: ProfilePhotoPort,
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: AuditLogRepository,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(AVATAR_CONTACT_UUID_FACTORY) private readonly uuid: () => string,
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

    const reviewedAt = this.clock.now();
    const audit = {
      id: this.uuid(),
      actorId: input.adminUserId,
      action: AdminSchemas.AdminAuditAction.UserPhotoRemove,
      targetType: "user",
      targetId: input.userId,
      details: (removedKey: string | null) => ({
        reason: input.reason,
        avatarIndex: user.avatarIndex,
        ...(report ? { reportId: report.id } : {}),
        before: { avatarKey: removedKey, ...(report ? { reportStatus: "pending" } : {}) },
        after: { avatarKey: null, ...(report ? { reportStatus: "actioned" } : {}) },
      }),
    };
    try {
      return await this.prisma.$transaction(async (tx) => withAvatarPreparation(tx, input.userId, undefined, {
        audit, report: report ? { id: report.id, reviewedAt } : undefined,
      }, async (present) => {
        if (!present) throw noPhoto();
        const currentUser = await tx.user.findUnique({ where: { id: input.userId } });
        if (currentUser?.role === "admin") {
          throw new ForbiddenException({ code: "FORBIDDEN", message: "Admin targets cannot be moderated",
            details: { reason: AdminSchemas.AdminErrorReason.AdminTargetNotModeratable } });
        }
        if (report) {
          const currentReport = await tx.contentReport.findUnique({ where: { id: report.id } });
          if (!currentReport) throw new NotFoundException({ code: "NOT_FOUND", message: "Report not found" });
          if (currentReport.targetType !== "user" || currentReport.targetId !== input.userId) {
            throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Report does not match the target user",
              details: { reason: AdminSchemas.AdminErrorReason.ReportTargetMismatch } });
          }
          if (currentReport.status !== "pending") {
            throw new ConflictException({ code: "CONFLICT", message: "Report has already been resolved",
              details: { reason: AdminSchemas.AdminErrorReason.ReportAlreadyResolved, reportStatus: currentReport.status } });
          }
        }
        // The release takes the User's row lock, so it sees the photo as it is
        // now. If the owner removed it since the read above, nothing was done
        // and the throw rolls this transaction back with no audit entry.
        const { removedKey } = await this.photos.release(input.userId, tx);
        if (removedKey === null) throw noPhoto();

        let reportStatus: "actioned" | undefined;
        if (report) {
          await this.reportRepo.updateStatus(
            report.id,
            { status: "actioned", reviewedById: input.adminUserId, reviewedAt },
            tx,
          );
          reportStatus = "actioned";
        }

        const auditRow = await this.auditRepo.create(
          { ...audit, details: audit.details(removedKey) },
          tx,
        );

        return {
          targetId: input.userId,
          targetState: { avatarKey: null, avatarIndex: user.avatarIndex },
          reportId: report ? report.id : undefined,
          reportStatus,
          auditLogId: auditRow.id,
        };
      }));
    } catch (error) {
      if (error instanceof AvatarContactScopeChanged && error.removedUserId === input.userId) throw noPhoto();
      throw error;
    }
  }
}
