import { beforeEach, describe, expect, it } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import type {
  IdentityReadPort,
  IdentityUserSummary,
  ProfilePhotoPort,
} from "../../identity/identity.public";
import { ContentReport } from "../domain/ContentReport";
import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";
import type { ContentReportRepository } from "../domain/ports/ContentReportRepository";
import { RemoveUserPhoto } from "./RemoveUserPhoto";

const KEY = "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp";
const TX = { name: "moderation transaction" };

class FakeReports {
  reports: ContentReport[] = [];
  statusTransactions: unknown[] = [];

  async findById(id: string): Promise<ContentReport | null> {
    return this.reports.find((r) => r.id === id) ?? null;
  }

  async updateStatus(
    id: string,
    data: { status: string; reviewedById: string; reviewedAt: Date },
    tx?: unknown,
  ): Promise<ContentReport> {
    this.statusTransactions.push(tx);
    const index = this.reports.findIndex((r) => r.id === id);
    const report = this.reports[index];
    if (!report) throw new Error("Report not found");
    const updated = ContentReport.reconstruct({
      ...report,
      status: data.status as ContentReport["status"],
      reviewedById: data.reviewedById,
      reviewedAt: data.reviewedAt,
    });
    this.reports[index] = updated;
    return updated;
  }

  seed(id: string, targetType: "listing" | "user", targetId: string, status = "pending"): void {
    this.reports.push(
      ContentReport.reconstruct({
        id,
        reporterUserId: "reporter-1",
        targetType,
        targetId,
        reason: "other",
        details: "Offensive profile photo",
        status: status as ContentReport["status"],
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        messageContext: null,
      }),
    );
  }
}

class FakeAudit {
  rows: AuditLogRow[] = [];
  transactions: unknown[] = [];

  async create(
    data: {
      actorId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      details?: Record<string, unknown> | null;
    },
    tx?: unknown,
  ): Promise<AuditLogRow> {
    this.transactions.push(tx);
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

/** Users with their photo keys, read through one port and released through the other. */
class FakeIdentity {
  users: Record<string, IdentityUserSummary> = {};
  releases: Array<{ userId: string; tx: unknown }> = [];
  /** The owner removes their own photo between the moderator's read and the release. */
  removedMeanwhile = false;

  readonly read = {
    findUserById: async (id: string) => this.users[id] ?? null,
  } as unknown as IdentityReadPort;

  readonly photos: ProfilePhotoPort = {
    adopt: async () => {
      throw new Error("A moderator never sets a photo");
    },
    release: async (userId, tx) => {
      this.releases.push({ userId, tx });
      const user = this.users[userId];
      const removedKey = this.removedMeanwhile ? null : (user?.avatarKey ?? null);
      if (user) this.users[userId] = { ...user, avatarKey: null };
      return { removedKey };
    },
  };

  seed(id: string, data: Partial<IdentityUserSummary> = {}): void {
    this.users[id] = {
      id,
      displayName: null,
      nameNumber: 4821,
      avatarIndex: 7,
      avatarKey: KEY,
      deleted: false,
      role: "buyer",
      suspendedAt: null,
      suspendedById: null,
      suspensionReason: null,
      ...data,
    };
  }
}

describe("RemoveUserPhoto", () => {
  let identity: FakeIdentity;
  let reports: FakeReports;
  let audit: FakeAudit;
  let useCase: RemoveUserPhoto;

  beforeEach(() => {
    identity = new FakeIdentity();
    reports = new FakeReports();
    audit = new FakeAudit();
    const prisma = { $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(TX) };
    useCase = new RemoveUserPhoto(
      prisma as unknown as ConstructorParameters<typeof RemoveUserPhoto>[0],
      identity.read,
      identity.photos,
      reports as unknown as ContentReportRepository,
      audit as unknown as AuditLogRepository,
    );
    identity.seed("user-1");
  });

  const input = { userId: "user-1", adminUserId: "admin-1", reason: "Offensive photo" };

  it("removes the photo, keeps the Assigned Avatar index and writes the audit entry", async () => {
    const result = await useCase.execute(input);

    expect(result).toEqual({
      targetId: "user-1",
      targetState: { avatarKey: null, avatarIndex: 7 },
      reportId: undefined,
      reportStatus: undefined,
      auditLogId: "audit-1",
    });
    expect(identity.users["user-1"]).toMatchObject({ avatarKey: null, avatarIndex: 7 });
    expect(audit.rows).toEqual([
      expect.objectContaining({
        actorId: "admin-1",
        action: "USER_PHOTO_REMOVE",
        targetType: "user",
        targetId: "user-1",
        details: {
          reason: "Offensive photo",
          avatarIndex: 7,
          before: { avatarKey: KEY },
          after: { avatarKey: null },
        },
      }),
    ]);
  });

  it("releases the photo and writes the audit entry in one transaction", async () => {
    await useCase.execute(input);

    expect(identity.releases).toEqual([{ userId: "user-1", tx: TX }]);
    expect(audit.transactions).toEqual([TX]);
  });

  it("actions the pending report on that User in the same transaction", async () => {
    reports.seed("report-1", "user", "user-1");

    const result = await useCase.execute({ ...input, reportId: "report-1" });

    expect(result).toMatchObject({ reportId: "report-1", reportStatus: "actioned" });
    expect(reports.reports[0]).toMatchObject({ status: "actioned", reviewedById: "admin-1" });
    expect(reports.statusTransactions).toEqual([TX]);
    expect(audit.rows[0]?.details).toMatchObject({
      reportId: "report-1",
      before: { avatarKey: KEY, reportStatus: "pending" },
      after: { avatarKey: null, reportStatus: "actioned" },
    });
  });

  it("removes a suspended User's photo too", async () => {
    identity.seed("user-1", { suspendedAt: new Date("2026-06-01T00:00:00Z") });

    await expect(useCase.execute(input)).resolves.toMatchObject({
      targetState: { avatarKey: null },
    });
  });

  it("answers 404 for a User that does not exist", async () => {
    await expect(useCase.execute({ ...input, userId: "gone" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(audit.rows).toEqual([]);
  });

  it("refuses an admin target and the moderator's own photo", async () => {
    identity.seed("admin-2", { role: "admin" });
    identity.seed("admin-1", { role: "moderator" });

    await expect(useCase.execute({ ...input, userId: "admin-2" })).rejects.toMatchObject({
      response: { details: { reason: "ADMIN_TARGET_NOT_MODERATABLE" } },
    });
    await expect(useCase.execute({ ...input, userId: "admin-1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(identity.releases).toEqual([]);
    expect(audit.rows).toEqual([]);
  });

  it("answers 409 for a User with no photo and writes nothing", async () => {
    identity.seed("user-1", { avatarKey: null });

    const error = await useCase.execute(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({
      response: { details: { reason: "MODERATION_TARGET_STATE_CONFLICT" } },
    });
    expect(identity.releases).toEqual([]);
    expect(audit.rows).toEqual([]);
  });

  it("answers 409 and leaves the report pending when the reported User has no photo", async () => {
    identity.seed("user-1", { avatarKey: null });
    reports.seed("report-1", "user", "user-1");

    await expect(useCase.execute({ ...input, reportId: "report-1" })).rejects.toMatchObject({
      response: { details: { reason: "REPORT_TARGET_NOT_ACTIONABLE" } },
    });
    expect(reports.reports[0]?.status).toBe("pending");
    expect(audit.rows).toEqual([]);
  });

  it("writes no audit entry when the owner removed the photo first", async () => {
    identity.removedMeanwhile = true;
    reports.seed("report-1", "user", "user-1");

    const error = await useCase.execute({ ...input, reportId: "report-1" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(reports.reports[0]?.status).toBe("pending");
    expect(audit.rows).toEqual([]);
  });

  it.each([
    ["a report on a Listing", () => reports.seed("report-1", "listing", "listing-1"), BadRequestException, "REPORT_TARGET_MISMATCH"],
    ["a report on another User", () => reports.seed("report-1", "user", "user-2"), BadRequestException, "REPORT_TARGET_MISMATCH"],
    ["a report already resolved", () => reports.seed("report-1", "user", "user-1", "dismissed"), ConflictException, "REPORT_ALREADY_RESOLVED"],
  ])("refuses %s and keeps the photo", async (_name, seed, errorClass, reason) => {
    seed();

    const error = await useCase.execute({ ...input, reportId: "report-1" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(errorClass);
    expect(error).toMatchObject({ response: { details: { reason } } });
    expect(identity.users["user-1"]?.avatarKey).toBe(KEY);
    expect(audit.rows).toEqual([]);
  });

  it("answers 404 for a report that does not exist", async () => {
    await expect(useCase.execute({ ...input, reportId: "missing" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(identity.users["user-1"]?.avatarKey).toBe(KEY);
  });
});
