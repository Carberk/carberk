import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";

import { AdminSchemas } from "@auto-tm/contracts";
import { MESSAGE_MODERATION_READ_PORT, type MessageModerationReadPort, type ReportedMessage } from "../../conversations/domain/ports/MessageModerationReadPort";
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from "../domain/ports/AuditLogRepository";

import { reportedMessageSenderId } from "../domain/reportedMessageSenderId";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import { IDENTITY_READ_PORT, type IdentityReadPort, type IdentityUserSummary } from "../../identity/identity.public";

export interface GetReportDetailInput {
  reportId: string;
  adminUserId: string;
}

export interface GetReportDetailResult {
  id: string;
  status: string;
  reason: string;
  details: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reporter: {
    available: boolean;
    label: string;
    userId?: string;
  };
  reviewer?: {
    available: boolean;
    label: string;
    userId?: string | undefined;
  } | undefined;
  target: {
    targetType: string;
    available: boolean;
    label: string;
    targetId: string;
    title?: string | undefined;
    year?: number | undefined;
    make?: string | undefined;
    model?: string | undefined;
    status?: string | undefined;
    hasVideo?: boolean | undefined;
    role?: string | undefined;
    avatarKey?: string | null | undefined;
    avatarIndex?: number | undefined;
    conversationId?: string | undefined;
    listingId?: string | undefined;
    senderId?: string | undefined;
    messageCreatedAt?: Date | undefined;
    messageBody?: string | undefined;
    messageDeletedAt?: Date | null | undefined;
    messageHasAttachment?: boolean | undefined;
    sender?: { available: boolean; label: string; userId?: string; role?: string } | undefined;
  };
  targetModerationState?: {
    status?: string | undefined;
    suspendedAt: Date | null;
    suspendedById: string | null;
    suspensionReason: string | null;
  } | undefined;
  reportsSubmittedByReporterCount?: number | undefined;
  pendingReportsOnTargetCount: number;
}

@Injectable()
export class GetReportDetail {
  constructor(
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listingsRead: ListingsReadPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
    @Inject(MESSAGE_MODERATION_READ_PORT)
    private readonly messageRead: MessageModerationReadPort,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: GetReportDetailInput): Promise<GetReportDetailResult> {
    if (!input.adminUserId) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Admin actor is required" });
    }
    const report = await this.reportRepo.findById(input.reportId);
    if (!report) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Report not found",
      });
    }

    let message: ReportedMessage | null = null;
    let sender: IdentityUserSummary | null = null;
    if (report.targetType === "message") {
      // Store staff access before releasing sensitive content. No text in audit.
      await this.auditRepo.create({
        actorId: input.adminUserId,
        action: AdminSchemas.AdminAuditAction.ReportedMessageRead,
        targetType: "message",
        targetId: report.targetId,
        details: { reportId: report.id, messageId: report.targetId },
      });
      message = await this.messageRead.getReportedMessage(report.targetId);
      const senderId = reportedMessageSenderId(report, message);
      sender = senderId ? await this.identityRead.findUserById(senderId) : null;
    }

    const [
      reporter,
      reviewer,
      listings,
      users,
      pendingReportsOnTargetCount,
      reportsSubmittedByReporterCount,
    ] = await Promise.all([
      report.reporterUserId
        ? this.identityRead.findUserById(report.reporterUserId)
        : Promise.resolve(null),
      report.reviewedById
        ? this.identityRead.findUserById(report.reviewedById)
        : Promise.resolve(null),
      report.targetType === "listing"
        ? this.listingsRead.getListingAdminSummaries([report.targetId])
        : Promise.resolve([]),
      report.targetType === "user"
        ? this.identityRead.findUsersByIds([report.targetId])
        : Promise.resolve([]),
      this.reportRepo.countPendingByTarget(report.targetType, report.targetId),
      report.reporterUserId
        ? this.reportRepo.countByReporter(report.reporterUserId)
        : Promise.resolve(undefined),
    ]);

    const target = report.targetType === "message"
      ? this.buildMessageTarget(report.targetId, message, sender, report.messageContext?.createdAt)
      : this.buildTarget(report, listings[0], users[0]);

    const moderationUser = report.targetType === "user" ? users[0] : sender?.deleted ? null : sender;
    let targetModerationState: GetReportDetailResult["targetModerationState"];
    if (report.targetType === "listing" && listings[0]) {
      targetModerationState = {
        status: listings[0].status,
        suspendedAt: null,
        suspendedById: null,
        suspensionReason: null,
      };
    } else if (moderationUser) {
      targetModerationState = {
        suspendedAt: moderationUser.suspendedAt,
        suspendedById: moderationUser.suspendedById,
        suspensionReason: moderationUser.suspensionReason,
      };
    } else {
      targetModerationState = undefined;
    }

    return {
      id: report.id,
      status: report.status,
      reason: report.reason,
      details: report.details,
      createdAt: report.createdAt,
      reviewedAt: report.reviewedAt,
      reporter: reporter
        ? { available: true, label: reporter.displayName ?? `User ${reporter.id.slice(0, 8)}`, userId: reporter.id }
        : { available: false, label: "Deleted user" },
      reviewer: report.reviewedById
        ? reviewer
          ? { available: true, label: reviewer.displayName ?? `User ${reviewer.id.slice(0, 8)}`, userId: reviewer.id }
          : { available: false, label: "Deleted user" }
        : undefined,
      target,
      targetModerationState,
      reportsSubmittedByReporterCount,
      pendingReportsOnTargetCount,
    };
  }

  private buildListingTarget(
    listing: { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string; hasVideo?: boolean } | undefined,
    targetId: string,
  ): GetReportDetailResult["target"] {
    if (!listing) {
      return {
        targetType: "listing",
        available: false,
        label: "Unavailable target",
        targetId,
      };
    }

    const label = listing.year
      ? `${listing.year} ${listing.brandName} ${listing.modelName}`
      : `${listing.brandName} ${listing.modelName}`;

    return {
      targetType: "listing",
      available: true,
      label,
      targetId: listing.id,
      title: label,
      year: listing.year ?? undefined,
      make: listing.brandName,
      model: listing.modelName,
      status: listing.status,
      hasVideo: listing.hasVideo,
    };
  }

  private buildUserTarget(
    user: { id: string; displayName: string | null; role: string; avatarKey: string | null; avatarIndex: number; suspendedAt: Date | null; suspendedById: string | null; suspensionReason: string | null } | undefined,
    targetId: string,
  ): GetReportDetailResult["target"] {
    if (!user) {
      return {
        targetType: "user",
        available: false,
        label: "Unavailable target",
        targetId,
      };
    }

    return {
      targetType: "user",
      available: true,
      label: user.displayName ?? `User ${user.id.slice(0, 8)}`,
      targetId: user.id,
      role: user.role,
      avatarKey: user.avatarKey,
      avatarIndex: user.avatarIndex,
    };
  }

  private buildTarget(
    report: {
      targetType: string;
      targetId: string;
      messageContext: { messageId: string; conversationId: string; listingId: string; buyerId: string; sellerId: string; senderId: string; createdAt: Date; body: string | null; deletedAt: Date | null } | null;
    },
    listing: { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string; hasVideo?: boolean } | undefined,
    user: { id: string; displayName: string | null; role: string; avatarKey: string | null; avatarIndex: number; suspendedAt: Date | null; suspendedById: string | null; suspensionReason: string | null } | undefined,
  ): GetReportDetailResult["target"] {
    if (report.targetType === "listing") {
      return this.buildListingTarget(listing, report.targetId);
    }
    if (report.targetType === "user") {
      return this.buildUserTarget(user, report.targetId);
    }
    throw new Error("Unsupported report target");
  }

  private buildMessageTarget(
    targetId: string,
    message: ReportedMessage | null,
    sender: IdentityUserSummary | null,
    savedCreatedAt?: Date,
  ): GetReportDetailResult["target"] {
    return {
      targetType: "message",
      available: !!message,
      label: !message ? "Сообщение удалено или недоступно" : message.deletedAt ? "Сообщение удалено" : "Сообщение",
      targetId,
      messageBody: message && !message.deletedAt ? message.body ?? undefined : undefined,
      messageCreatedAt: message?.createdAt ?? savedCreatedAt,
      messageDeletedAt: message?.deletedAt,
      messageHasAttachment: message?.hasAttachment,
      sender: sender && !sender.deleted
        ? { available: true, label: sender.displayName ?? `Пользователь ${sender.id.slice(0, 8)}`, userId: sender.id, role: sender.role }
        : { available: false, label: "Пользователь удалён" },
    };
  }
}
