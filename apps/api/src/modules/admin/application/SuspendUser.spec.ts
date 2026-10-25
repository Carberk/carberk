import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { describe, it, expect, beforeEach } from "vitest";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";

import { SuspendUser } from "./SuspendUser";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { ContentReport } from "../domain/ContentReport";
import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";
import type { IdentityUserSummary, IdentityAdminPort, IdentityReadPort } from "../../identity/identity.public";
import { FakeMessageModerationReadPort } from "../../conversations/application/testing/FakeMessageModerationReadPort";
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

class FakeIdentityReadPort implements IdentityReadPort {
  users: Record<
    string,
    IdentityUserSummary
  > = {};

  async findUserById(id: string): Promise<IdentityUserSummary | null> {
    return this.users[id] ?? null;
  }

  async findUsersByIds(): Promise<[]> {
    return [];
  }

  async findBlockedUserIds(): Promise<string[]> {
    return [];
  }

  async isUserBlockedBy(): Promise<boolean> {
    return false;
  }

  seed(
    id: string,
    data: { displayName?: string | null; role?: string; suspendedAt?: Date | null; suspendedById?: string | null; suspensionReason?: string | null },
  ) {
    this.users[id] = {
      id,
      displayName: data.displayName ?? null,
      nameNumber: 1000,
      avatarIndex: 0,
      avatarKey: null,
      deleted: false,
      role: data.role ?? "buyer",
      suspendedAt: data.suspendedAt ?? null,
      suspendedById: data.suspendedById ?? null,
      suspensionReason: data.suspensionReason ?? null,
    };
  }
}

class FakeIdentityAdminPort implements IdentityAdminPort {
  states: Record<string, { suspendedAt: Date | null; suspendedById: string | null; suspensionReason: string | null }> = {};

  async suspendUser(
    userId: string,
    adminUserId: string,
    reason: string,
  ): Promise<{ suspendedAt: Date; suspendedById: string; suspensionReason: string }> {
    const now = new Date();
    this.states[userId] = {
      suspendedAt: now,
      suspendedById: adminUserId,
      suspensionReason: reason,
    };
    return {
      suspendedAt: now,
      suspendedById: adminUserId,
      suspensionReason: reason,
    };
  }

  async unsuspendUser(userId: string): Promise<{ suspendedAt: null; suspendedById: null; suspensionReason: null }> {
    this.states[userId] = {
      suspendedAt: null,
      suspendedById: null,
      suspensionReason: null,
    };
    return {
      suspendedAt: null,
      suspendedById: null,
      suspensionReason: null,
    };
  }

  async isSuspended(userId: string): Promise<boolean> {
    return this.states[userId]?.suspendedAt != null;
  }

  seed(id: string, data: { suspendedAt?: Date | null; suspendedById?: string | null; suspensionReason?: string | null }) {
    this.states[id] = {
      suspendedAt: data.suspendedAt ?? null,
      suspendedById: data.suspendedById ?? null,
      suspensionReason: data.suspensionReason ?? null,
    };
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
  targetType: "listing" | "user" | "message",
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
  identityRead?: FakeIdentityReadPort,
  identityAdmin?: FakeIdentityAdminPort,
  reportRepo?: FakeContentReportRepository,
  auditRepo?: FakeAuditLogRepository,
  messages = new FakeMessageModerationReadPort(),
) {
  if (prisma instanceof FakePrismaService) prisma.fixtures = () => ({
    user: Object.values(identityRead?.users ?? {}).map(row => ({ ...row })),
    contentReport: (reportRepo?.reports ?? []).map(row => ({ ...row })),
  });
  return new SuspendUser(
    (prisma ?? new FakePrismaService()) as unknown as ConstructorParameters<typeof SuspendUser>[0],
    identityRead ?? new FakeIdentityReadPort(),
    identityAdmin ?? new FakeIdentityAdminPort(),
    reportRepo ?? new FakeContentReportRepository(),
    auditRepo ?? new FakeAuditLogRepository(),
    messages,
  );
}

describe("SuspendUser", () => {
  let prisma: FakePrismaService;
  let identityRead: FakeIdentityReadPort;
  let identityAdmin: FakeIdentityAdminPort;
  let reportRepo: FakeContentReportRepository;
  let auditRepo: FakeAuditLogRepository;

  beforeEach(() => {
    prisma = new FakePrismaService();
    identityRead = new FakeIdentityReadPort();
    identityAdmin = new FakeIdentityAdminPort();
    reportRepo = new FakeContentReportRepository();
    auditRepo = new FakeAuditLogRepository();
  });

  it("suspends an unsuspended user directly and writes audit", async () => {
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    const result = await uc.execute({
      userId: "u1",
      adminUserId: "admin-1",
      reason: "Spam",
    });

    expect(result.targetId).toBe("u1");
    expect(result.targetState.suspendedAt).toBeInstanceOf(Date);
    expect(result.targetState.suspendedById).toBe("admin-1");
    expect(result.auditLogId).toBeDefined();
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]!.action).toBe(AdminSchemas.AdminAuditAction.UserSuspend);
    expect(auditRepo.rows[0]!.details).toMatchObject({
      reason: "Spam",
      before: { suspendedAt: null, suspendedById: null, suspensionReason: null },
    });
    expect(auditRepo.rows[0]!.details).toHaveProperty("after.suspendedAt");
  });

  it("suspends an unsuspended user with reportId and actions the report", async () => {
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });
    reportRepo.reports = [makeReport("r1", "user", "u1")];

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    const result = await uc.execute({
      userId: "u1",
      adminUserId: "admin-1",
      reason: "Spam",
      reportId: "r1",
    });

    expect(result.targetId).toBe("u1");
    expect(result.targetState.suspendedAt).toBeInstanceOf(Date);
    expect(result.reportId).toBe("r1");
    expect(result.reportStatus).toBe("actioned");
    expect(result.auditLogId).toBeDefined();

    const updatedReport = reportRepo.reports.find((r) => r.id === "r1");
    expect(updatedReport?.status).toBe("actioned");
    expect(updatedReport?.reviewedById).toBe("admin-1");

    expect(auditRepo.rows[0]!.details).toMatchObject({
      reportId: "r1",
      before: { suspendedAt: null, suspendedById: null, suspensionReason: null, reportStatus: "pending" },
      after: { reportStatus: "actioned" },
    });
  });

  it("suspends the reported Message sender, resolves only that report and audits both IDs without text", async () => {
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });
    const report = makeReport("r1", "message", "m1");
    reportRepo.reports = [ContentReport.reconstruct({ ...report, messageContext: {
      messageId: "m1", conversationId: "c1", listingId: "l1", buyerId: "u2", sellerId: "u1", senderId: "u1", createdAt: new Date(), body: "Sensitive text", deletedAt: null, surroundingMessages: [],
    } }), makeReport("r2", "user", "u1")];
    const result = await makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo).execute({ userId: "u1", adminUserId: "admin-1", reason: "Spam", reportId: "r1" });
    expect(result.reportStatus).toBe("actioned");
    expect(identityAdmin.states["u1"]?.suspendedAt).toBeInstanceOf(Date);
    expect(reportRepo.reports.find(r => r.id === "r2")?.status).toBe("pending");
    expect(auditRepo.rows[0]?.details).toMatchObject({ reportId: "r1", messageId: "m1" });
    expect(JSON.stringify(auditRepo.rows)).not.toContain("Sensitive text");
    identityRead.seed("u2", { role: "buyer" });
    await expect(makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo).execute({ userId: "u2", adminUserId: "admin-1", reason: "Spam", reportId: "r1" })).rejects.toThrow(BadRequestException);
  });

  it.each([false, true])("uses the current Message sender with saved snapshot present=%s", async (hasSnapshot) => {
    identityRead.seed("u1", { role: "buyer" });
    identityRead.seed("u2", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });
    const report = makeReport("r1", "message", "m1");
    reportRepo.reports = [ContentReport.reconstruct({ ...report, messageContext: hasSnapshot ? {
      messageId: "m1", conversationId: "c1", listingId: "l1", buyerId: "u1", sellerId: "u2", senderId: "u2", createdAt: new Date(), body: null, deletedAt: null, surroundingMessages: [],
    } : null })];
    const messages = new FakeMessageModerationReadPort();
    messages.messages["m1"] = { id: "m1", senderId: "u1", body: null, createdAt: new Date(), deletedAt: null, hasAttachment: false };
    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo, messages);
    await expect(uc.execute({ userId: "u2", adminUserId: "admin-1", reason: "Spam", reportId: "r1" })).rejects.toThrow(BadRequestException);
    expect((await uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Spam", reportId: "r1" })).reportStatus).toBe("actioned");
  });

  it("refuses to suspend a deleted sender", async () => {
    identityRead.seed("u1", { role: "buyer" });
    identityRead.users["u1"]!.deleted = true;
    await expect(makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo).execute({ userId: "u1", adminUserId: "admin-1", reason: "Spam" })).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns NOT_FOUND for missing user", async () => {
    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    await expect(
      uc.execute({ userId: "missing", adminUserId: "admin-1", reason: "Spam" }),
    ).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns ADMIN_TARGET_NOT_MODERATABLE for admin target", async () => {
    identityRead.seed("u1", { role: "admin" });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Spam" });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ForbiddenException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("FORBIDDEN");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.AdminTargetNotModeratable,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns ADMIN_TARGET_NOT_MODERATABLE for self-admin target", async () => {
    identityRead.seed("admin-1", { role: "admin" });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({ userId: "admin-1", adminUserId: "admin-1", reason: "Spam" });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ForbiddenException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("FORBIDDEN");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.AdminTargetNotModeratable,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns SELF_MODERATION_NOT_ALLOWED for self target", async () => {
    identityRead.seed("buyer-1", { role: "buyer" });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({ userId: "buyer-1", adminUserId: "buyer-1", reason: "Spam" });
      expect.fail("should have thrown");
    } catch (err) {
      const ex = err as ForbiddenException;
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response["code"]).toBe("FORBIDDEN");
      expect(response["details"]).toMatchObject({
        reason: AdminSchemas.AdminErrorReason.SelfModerationNotAllowed,
      });
    }
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns MODERATION_TARGET_STATE_CONFLICT for already-suspended user (direct)", async () => {
    identityRead.seed("u1", { role: "buyer", suspendedAt: new Date("2026-01-01T00:00:00Z") });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Spam" });
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
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    await expect(
      uc.execute({
        userId: "u1",
        adminUserId: "admin-1",
        reason: "Spam",
        reportId: "missing-report",
      }),
    ).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns REPORT_TARGET_MISMATCH for wrong-target report", async () => {
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });
    reportRepo.reports = [makeReport("r1", "user", "u2")];

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({
        userId: "u1",
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
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });
    reportRepo.reports = [makeReport("r1", "user", "u1", "dismissed")];

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({
        userId: "u1",
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

  it("returns REPORT_TARGET_NOT_ACTIONABLE when pending report target is already suspended", async () => {
    identityRead.seed("u1", { role: "buyer", suspendedAt: new Date("2026-01-01T00:00:00Z") });
    reportRepo.reports = [makeReport("r1", "user", "u1")];

    const uc = makeUseCase(prisma, identityRead, identityAdmin, reportRepo, auditRepo);
    try {
      await uc.execute({
        userId: "u1",
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

  it("rolls back user mutation when audit write fails", async () => {
    identityRead.seed("u1", { role: "buyer" });
    identityAdmin.seed("u1", { suspendedAt: null });

    const failingPrisma = {
      async $transaction<T>(_fn: (tx: unknown) => Promise<T>): Promise<T> {
        throw new Error("Transaction rollback");
      },
    };

    const uc = makeUseCase(
      failingPrisma as unknown as FakePrismaService,
      identityRead,
      identityAdmin,
      reportRepo,
      auditRepo,
    );
    await expect(
      uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Spam" }),
    ).rejects.toThrow("Transaction rollback");

    expect(identityAdmin.states["u1"]?.suspendedAt).toBeNull();
    expect(auditRepo.rows).toHaveLength(0);
  });
});
