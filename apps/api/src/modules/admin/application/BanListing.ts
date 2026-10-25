import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService, listingSourceCommand, withDiagnosticSourceCommand } from "@auto-tm/db";
import { AdminSchemas } from "@auto-tm/contracts";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import type { ListingsAdminPort } from "../../listings/domain/ports/ListingsAdminPort";
import { LISTINGS_ADMIN_PORT } from "../../listings/domain/ports/ListingsAdminPort";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { CONTENT_REPORT_REPOSITORY } from "../domain/ports/ContentReportRepository";
import type { AuditLogRepository } from "../domain/ports/AuditLogRepository";
import { AUDIT_LOG_REPOSITORY } from "../domain/ports/AuditLogRepository";

export interface BanListingInput {
  listingId: string;
  adminUserId: string;
  reason: string;
  reportId?: string | undefined;
}

export interface BanListingResult {
  targetId: string;
  targetState: { status: string };
  reportId?: string | undefined;
  reportStatus?: "actioned" | undefined;
  auditLogId: string;
}

@Injectable()
export class BanListing {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(LISTINGS_READ_PORT)
    private readonly listingsRead: ListingsReadPort,
    @Inject(LISTINGS_ADMIN_PORT)
    private readonly listingsAdmin: ListingsAdminPort,
    @Inject(CONTENT_REPORT_REPOSITORY)
    private readonly reportRepo: ContentReportRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(input: BanListingInput): Promise<BanListingResult> {
    // 1. Resolve listing (required for both direct and report-backed)
    const listings = await this.listingsRead.getListingAdminSummaries([
      input.listingId,
    ]);
    const listing = listings[0];

    if (!listing) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Listing not found",
      });
    }

    // 2. Report-backed validation (if reportId provided)
    let report: Awaited<ReturnType<ContentReportRepository["findById"]>> = null;
    if (input.reportId) {
      report = await this.reportRepo.findById(input.reportId);

      if (!report) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      if (report.targetType !== "listing" || report.targetId !== input.listingId) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "Report does not match the target listing",
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
      if (listing.status !== "active") {
        throw new ConflictException({
          code: "CONFLICT",
          message: "Report target is no longer actionable",
          details: {
            reason: AdminSchemas.AdminErrorReason.ReportTargetNotActionable,
            targetState: { status: listing.status },
          },
        });
      }
    } else {
      // Direct ban: revalidate current target state
      if (listing.status !== "active") {
        throw new ConflictException({
          code: "CONFLICT",
          message: "Listing is not in a state that can be banned",
          details: {
            reason: AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
            targetState: { status: listing.status },
          },
        });
      }
    }

    // 3. Execute mutation + audit in one transaction
    const auditId = randomUUID();
    const reviewedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const source = await tx.listing.findUnique({ where: { id: input.listingId }, select: { sellerId: true } });
      if (!source) throw new NotFoundException({ code: "NOT_FOUND", message: "Listing not found" });
      const command = await listingSourceCommand(tx, { operation: "listing_change", listingId: input.listingId, actorUserId: input.adminUserId,
        changes: { status: "banned" }, roots: [
          { table: "users", key: { id: source.sellerId } },
          { table: "audit_logs", key: { id: auditId } },
          ...(report ? [{ table: "content_reports" as const, key: { id: report.id } }] : []),
        ] });
      return withDiagnosticSourceCommand(tx, command, async receipt => {
      if (report) {
        await tx.$queryRaw`SELECT "id" FROM "content_reports" WHERE "id"=${report.id} FOR UPDATE`;
        const locked = await tx.contentReport.findUnique({ where: { id: report.id } });
        if (!locked || locked.status !== "pending" || locked.targetType !== "listing" || locked.targetId !== input.listingId) {
          throw new ConflictException({ code: "CONFLICT", message: "Report has already been resolved", details: { reason: AdminSchemas.AdminErrorReason.ReportAlreadyResolved } });
        }
      }

      const lockedListing = await tx.listing.findUnique({ where: { id: input.listingId } });
      if (!lockedListing) throw new NotFoundException({ code: "NOT_FOUND", message: "Listing not found" });
      if (lockedListing.status !== "active") {
        throw new ConflictException({ code: "CONFLICT", message: report ? "Report target is no longer actionable" : "Listing is not in a state that can be banned",
          details: { reason: report ? AdminSchemas.AdminErrorReason.ReportTargetNotActionable : AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
            targetState: { status: lockedListing.status } } });
      }

      // Ban the listing
      const banResult = await this.listingsAdmin.banActiveListing(
        input.listingId,
        tx,
        receipt,
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
        before: { status: "active" },
        after: { status: banResult.status },
      };
      if (report) {
        auditDetails["reportId"] = report.id;
        auditDetails["before"] = { status: "active", reportStatus: "pending" };
        auditDetails["after"] = { status: banResult.status, reportStatus: "actioned" };
      }

      const auditRow = await this.auditRepo.create(
        {
          id: auditId,
          actorId: input.adminUserId,
          action: AdminSchemas.AdminAuditAction.ListingBan,
          targetType: "listing",
          targetId: input.listingId,
          details: auditDetails,
        },
        tx,
      );

      return {
        targetId: input.listingId,
        targetState: { status: banResult.status },
        reportId: report ? report.id : undefined,
        reportStatus,
        auditLogId: auditRow.id,
      };
      });
    });

    return result;
  }
}
