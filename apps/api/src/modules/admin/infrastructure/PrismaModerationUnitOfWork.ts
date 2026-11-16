import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import { IDENTITY_ADMIN_PORT, PROFILE_PHOTO_PORT, type IdentityAdminPort, type ProfilePhotoPort } from "../../identity/identity.public";
import { LISTINGS_ADMIN_PORT, type ListingsAdminPort } from "../../listings/domain/ports/ListingsAdminPort";
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from "../domain/ports/AuditLogRepository";
import { CONTENT_REPORT_REPOSITORY, type ContentReportRepository } from "../domain/ports/ContentReportRepository";
import type { ModerationTransaction, ModerationUnitOfWork } from "../application/ports/ModerationUnitOfWork";

@Injectable()
export class PrismaModerationUnitOfWork implements ModerationUnitOfWork {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LISTINGS_ADMIN_PORT) private readonly listings: ListingsAdminPort,
    @Inject(IDENTITY_ADMIN_PORT) private readonly identity: IdentityAdminPort,
    @Inject(PROFILE_PHOTO_PORT) private readonly photos: ProfilePhotoPort,
    @Inject(CONTENT_REPORT_REPOSITORY) private readonly reports: ContentReportRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly audit: AuditLogRepository,
  ) {}

  run<T>(work: (transaction: ModerationTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work({
      listings: {
        banActiveListing: (id) => this.listings.banActiveListing(id, tx),
        unbanBannedListing: (id) => this.listings.unbanBannedListing(id, tx),
      },
      identity: {
        suspendUser: (userId, adminUserId, reason) => this.identity.suspendUser(userId, adminUserId, reason, tx),
        unsuspendUser: (userId) => this.identity.unsuspendUser(userId, tx),
      },
      photos: { release: (userId) => this.photos.release(userId, tx) },
      reports: { updateStatus: (id, data) => this.reports.updateStatus(id, data, tx) },
      audit: { create: (data) => this.audit.create(data, tx) },
    }));
  }
}
