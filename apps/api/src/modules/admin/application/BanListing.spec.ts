import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { describe, it, expect, beforeEach } from "vitest";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";

import { BanListing } from "./BanListing";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { ContentReport } from "../domain/ContentReport";
import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { ListingsAdminPort } from "../../listings/domain/ports/ListingsAdminPort";
import { AdminSchemas } from "@auto-tm/contracts";

class FakeContentReportRepository implements ContentReportRepository {
  reports: ContentReport[] = [];

  async save(report: ContentReport): Promise<ContentReport> {
    this.reports.push(report);
    return report;
  }

  async findById(id: string): Promise<ContentReport | null> {
    return this.reports.find((r) => r.id === id) ?? null;
  }

  async findPendingByReporterAndTarget(): Promise<ContentReport | null> {
    return null;
  }

  async findMany(): Promise<{ items: ContentReport[]; total: number }> {
    return { items: [], total: 0 };
  }

  async countPendingByTarget(): Promise<number> {
    return 0;
  }

  async countByReporter(): Promise<number> {
    return 0;
  }

  async updateStatus(
    id: string,
    data: { status: string; reviewedById: string; reviewedAt: Date },
  ): Promise<ContentReport> {
    const report = this.reports.find((r) => r.id === id);
    if (!report) throw new Error("Report not found");
    const updated = ContentReport.reconstruct({
      ...report,
      status: data.status as ContentReport["status"],
      reviewedById: data.reviewedById,
      reviewedAt: data.reviewedAt,
    });
    const idx = this.reports.findIndex((r) => r.id === id);
    this.reports[idx] = updated;
    return updated;
  }
}

class FakeAuditLogRepository implements AuditLogRepository {
  rows: AuditLogRow[] = [];

  async findMany(): Promise<{ items: AuditLogRow[]; total: number }> {
    return { items: [], total: 0 };
  }

  async create(
    data: {
      actorId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      details?: Record<string, unknown> | null;
    },
  ): Promise<AuditLogRow> {
    const row: AuditLogRow = {
      id: `audit-${this.rows.length + 1}`,
      actorId: data.actorId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      details: data.details ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
}

class FakeListingsReadPort implements ListingsReadPort {
  listings: Record<
    string,
    { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string }
  > = {};

  async getListingSummary(): Promise<null> {
    return null;
  }

  async getListingSummaries(): Promise<[]> {
    return [];
  }

  async getListingAdminSummaries(
    ids: string[],
  ): Promise<Array<{ id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string }>> {
    return ids.map((id) => this.listings[id]).filter((x): x is { id: string; sellerId: string; status: string; year: number | null; brandName: string; modelName: string } => !!x);
  }

  async getListingsForOwner() {
    return { items: [] };
  }

  seed(
    id: string,
    data: { sellerId: string; status: string; year?: number | null; brandName?: string; modelName?: string },
  ) {
    this.listings[id] = {
      id,
      sellerId: data.sellerId,
      status: data.status,
      year: data.year ?? null,
      brandName: data.brandName ?? "Toyota",
      modelName: data.modelName ?? "Camry",
    };
  }
}

class FakeListingsAdminPort implements ListingsAdminPort {
  states: Record<string, string> = {};

  async banActiveListing(listingId: string): Promise<{ status: string }> {
    if (this.states[listingId] !== "active") {
      throw new Error("Listing is not active");
    }
    this.states[listingId] = "banned";
    return { status: "banned" };
  }

  async unbanBannedListing(listingId: string): Promise<{ status: string }> {
    if (this.states[listingId] !== "banned") {
      throw new Error("Listing is not banned");
    }
    this.states[listingId] = "active";
    return { status: "active" };
  }

  seed(id: string, status: string) {
    this.states[id] = status;
  }
}

class FakePrismaService {
  fixtures: () => Record<string, Record<string, unknown>[]> = () => ({});
  async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const memory = new PreparedTransactionDatabase();
    for (const [table, rows] of Object.entries(this.fixtures())) memory.seed(table, ...rows);
    return memory.client.$transaction(tx => fn(tx));
  }
}

function makeReport(
  id: string,
  targetType: "listing" | "user",
  targetId: string,
  status = "pending",
) {
  return ContentReport.reconstruct({
    id,
    reporterUserId: "reporter-1",
    targetType,
    targetId,
    reason: "spam",
    details: null,
    status: status as ContentReport["status"],
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    messageContext: null,
  });
}

function makeUseCase(
  prisma?: FakePrismaService,
  listingsRead?: FakeListingsReadPort,
  listingsAdmin?: FakeListingsAdminPort,
  reportRepo?: FakeContentReportRepository,
  auditRepo?: FakeAuditLogRepository,
) {
  if (prisma instanceof FakePrismaService) prisma.fixtures = () => ({
    listing: Object.values(listingsRead?.listings ?? {}).map(row => ({ ...row })),
    contentReport: (reportRepo?.reports ?? []).map(row => ({ ...row })),
  });
  return new BanListing(
    (prisma ?? new FakePrismaService()) as unknown as ConstructorParameters<typeof BanListing>[0],
    listingsRead ?? new FakeListingsReadPort(),
    listingsAdmin ?? new FakeListingsAdminPort(),
    reportRepo ?? new FakeContentReportRepository(),
    auditRepo ?? new FakeAuditLogRepository(),
  );
}

describe("BanListing", () => {
  let prisma: FakePrismaService;
  let listingsRead: FakeListingsReadPort;
  let listingsAdmin: FakeListingsAdminPort;
  let reportRepo: FakeContentReportRepository;
  let auditRepo: FakeAuditLogRepository;

  beforeEach(() => {
    prisma = new FakePrismaService();
    listingsRead = new FakeListingsReadPort();
    listingsAdmin = new FakeListingsAdminPort();
    reportRepo = new FakeContentReportRepository();
    auditRepo = new FakeAuditLogRepository();
  });

  it("bans an active listing directly and writes audit", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });
    listingsAdmin.seed("l1", "active");

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    const result = await uc.execute({
      listingId: "l1",
      adminUserId: "admin-1",
      reason: "Spam",
    });

    expect(result.targetId).toBe("l1");
    expect(result.targetState.status).toBe("banned");
    expect(result.auditLogId).toBeDefined();
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]!.action).toBe(AdminSchemas.AdminAuditAction.ListingBan);
    expect(auditRepo.rows[0]!.details).toMatchObject({
      reason: "Spam",
      before: { status: "active" },
      after: { status: "banned" },
    });
  });

  it("bans an active listing with reportId and actions the report", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });
    listingsAdmin.seed("l1", "active");
    reportRepo.reports = [makeReport("r1", "listing", "l1")];

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    const result = await uc.execute({
      listingId: "l1",
      adminUserId: "admin-1",
      reason: "Spam",
      reportId: "r1",
    });

    expect(result.targetId).toBe("l1");
    expect(result.targetState.status).toBe("banned");
    expect(result.reportId).toBe("r1");
    expect(result.reportStatus).toBe("actioned");
    expect(result.auditLogId).toBeDefined();

    const updatedReport = reportRepo.reports.find((r) => r.id === "r1");
    expect(updatedReport?.status).toBe("actioned");
    expect(updatedReport?.reviewedById).toBe("admin-1");

    expect(auditRepo.rows[0]!.details).toMatchObject({
      reportId: "r1",
      before: { status: "active", reportStatus: "pending" },
      after: { status: "banned", reportStatus: "actioned" },
    });
  });

  it("returns NOT_FOUND for missing listing", async () => {
    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    await expect(
      uc.execute({ listingId: "missing", adminUserId: "admin-1", reason: "Spam" }),
    ).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns MODERATION_TARGET_STATE_CONFLICT for non-active listing", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "sold" });

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({ listingId: "l1", adminUserId: "admin-1", reason: "Spam" });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ConflictException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("CONFLICT");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns NOT_FOUND for unknown reportId", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });
    listingsAdmin.seed("l1", "active");

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    await expect(
      uc.execute({
        listingId: "l1",
        adminUserId: "admin-1",
        reason: "Spam",
        reportId: "missing-report",
      }),
    ).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns REPORT_TARGET_MISMATCH for wrong-target report", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });
    listingsAdmin.seed("l1", "active");
    reportRepo.reports = [makeReport("r1", "listing", "l2")];

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({
        listingId: "l1",
        adminUserId: "admin-1",
        reason: "Spam",
        reportId: "r1",
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("VALIDATION_FAILED");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.ReportTargetMismatch,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns REPORT_ALREADY_RESOLVED for non-pending report", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });
    listingsAdmin.seed("l1", "active");
    reportRepo.reports = [makeReport("r1", "listing", "l1", "dismissed")];

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({
        listingId: "l1",
        adminUserId: "admin-1",
        reason: "Spam",
        reportId: "r1",
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ConflictException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("CONFLICT");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.ReportAlreadyResolved,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns REPORT_TARGET_NOT_ACTIONABLE when pending report target is no longer active", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "sold" });
    reportRepo.reports = [makeReport("r1", "listing", "l1")];

    const uc = makeUseCase(prisma, listingsRead, listingsAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({
        listingId: "l1",
        adminUserId: "admin-1",
        reason: "Spam",
        reportId: "r1",
      });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ConflictException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("CONFLICT");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.ReportTargetNotActionable,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("rolls back listing mutation when audit write fails", async () => {
    listingsRead.seed("l1", { sellerId: "s1", status: "active" });
    listingsAdmin.seed("l1", "active");

    const failingPrisma = {
      async $transaction<T>(_fn: (tx: unknown) => Promise<T>): Promise<T> {
        throw new Error("Transaction rollback");
      },
    };

    const uc = makeUseCase(
      failingPrisma as unknown as FakePrismaService,
      listingsRead,
      listingsAdmin,
      reportRepo,
      auditRepo,
    );
    await expect(
      uc.execute({ listingId: "l1", adminUserId: "admin-1", reason: "Spam" }),
    ).rejects.toThrow("Transaction rollback");

    // Listing state should remain unchanged because the transaction rolled back
    expect(listingsAdmin.states["l1"]).toBe("active");
    expect(auditRepo.rows).toHaveLength(0);
  });
});
