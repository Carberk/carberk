import type { IdentityAdminPort, ProfilePhotoPort } from "../../../identity/identity.public";
import type { ListingsAdminPort } from "../../../listings/domain/ports/ListingsAdminPort";
import type { AuditLogRepository } from "../../domain/ports/AuditLogRepository";
import type { ContentReportRepository } from "../../domain/ports/ContentReportRepository";

export interface ModerationTransaction {
  listings: {
    banActiveListing(id: string): ReturnType<ListingsAdminPort["banActiveListing"]>;
    unbanBannedListing(id: string): ReturnType<ListingsAdminPort["unbanBannedListing"]>;
  };
  identity: {
    suspendUser(userId: string, adminUserId: string, reason: string): ReturnType<IdentityAdminPort["suspendUser"]>;
    unsuspendUser(userId: string): ReturnType<IdentityAdminPort["unsuspendUser"]>;
  };
  photos: {
    release(userId: string): ReturnType<ProfilePhotoPort["release"]>;
  };
  reports: {
    updateStatus(id: string, data: Parameters<ContentReportRepository["updateStatus"]>[1]): ReturnType<ContentReportRepository["updateStatus"]>;
  };
  audit: {
    create(data: Parameters<AuditLogRepository["create"]>[0]): ReturnType<AuditLogRepository["create"]>;
  };
}

export interface ModerationUnitOfWork {
  run<T>(work: (transaction: ModerationTransaction) => Promise<T>): Promise<T>;
}

export const MODERATION_UNIT_OF_WORK = Symbol("ModerationUnitOfWork");
