import { randomUUID } from "node:crypto";
import { AVATAR_CONTACT_UUID_FACTORY } from "../../common/avatar-contact-preparation";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Module } from "@nestjs/common";

import { ListingsModule } from "../listings/listings.module";
import { IdentityModule } from "../identity/identity.module";
import { ConversationsModule } from "../conversations/conversations.module";

import { AdminContextController } from "./presentation/AdminContextController";
import { PrismaAdminContextReader } from "./infrastructure/PrismaAdminContextReader";
import { ADMIN_CONTEXT_READ_PORT } from "./domain/ports/AdminContextReadPort";

import { AdminController } from "./presentation/admin.controller";
import { ReportsController } from "./presentation/ReportsController";
import { AuditController } from "./presentation/AuditController";
import { AdminModerationController } from "./presentation/AdminModerationController";
import { ConfigController } from "./presentation/ConfigController";
import { CreateReport } from "./application/CreateReport";
import { CreateMessageReport } from "./application/CreateMessageReport";
import { ListReports } from "./application/ListReports";
import { GetReportDetail } from "./application/GetReportDetail";
import { ListAuditEntries } from "./application/ListAuditEntries";
import { BanListing } from "./application/BanListing";
import { UnbanListing } from "./application/UnbanListing";
import { SuspendUser } from "./application/SuspendUser";
import { UnsuspendUser } from "./application/UnsuspendUser";
import { DismissReport } from "./application/DismissReport";
import { RemoveUserPhoto } from "./application/RemoveUserPhoto";
import { RecordReviewerAuthBypassAudit } from "./application/RecordReviewerAuthBypassAudit";
import { PrismaContentReportRepository } from "./infrastructure/PrismaContentReportRepository";
import { PrismaAuditLogRepository } from "./infrastructure/PrismaAuditLogRepository";
import { CONTENT_REPORT_REPOSITORY } from "./domain/ports/ContentReportRepository";
import { AUDIT_LOG_REPOSITORY } from "./domain/ports/AuditLogRepository";

@Module({
  imports: [EventEmitterModule, ListingsModule, IdentityModule, ConversationsModule],
  controllers: [AdminContextController, AdminController, ReportsController, AuditController, AdminModerationController, ConfigController],
  providers: [
    { provide: AVATAR_CONTACT_UUID_FACTORY, useValue: randomUUID },
    { provide: ADMIN_CONTEXT_READ_PORT, useClass: PrismaAdminContextReader },
    PrismaContentReportRepository,
    {
      provide: CONTENT_REPORT_REPOSITORY,
      useClass: PrismaContentReportRepository,
    },
    PrismaAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: PrismaAuditLogRepository,
    },
    CreateReport,
    CreateMessageReport,
    ListReports,
    GetReportDetail,
    ListAuditEntries,
    BanListing,
    UnbanListing,
    SuspendUser,
    UnsuspendUser,
    DismissReport,
    // PROFILE_PHOTO_PORT comes from ListingsModule, which serves identity's port.
    RemoveUserPhoto,
    RecordReviewerAuthBypassAudit,
  ],
})
export class AdminModule {}
