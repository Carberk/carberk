import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common";

import { UnsuspendUser } from "./UnsuspendUser";
import type { AuditLogRepository, AuditLogRow } from "../domain/ports/AuditLogRepository";
import type { IdentityUserSummary, IdentityAdminPort, IdentityReadPort } from "../../identity/identity.public";
import { AdminSchemas } from "@auto-tm/contracts";

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

function makeUseCase(
  prisma?: FakePrismaService,
  identityRead?: FakeIdentityReadPort,
  identityAdmin?: FakeIdentityAdminPort,
  auditRepo?: FakeAuditLogRepository,
) {
  if (prisma instanceof FakePrismaService) prisma.fixtures = () => ({
    user: Object.values(identityRead?.users ?? {}).map(row => ({ ...row })),
  });
  return new UnsuspendUser(
    (prisma ?? new FakePrismaService()) as unknown as ConstructorParameters<typeof UnsuspendUser>[0],
    identityRead ?? new FakeIdentityReadPort(),
    identityAdmin ?? new FakeIdentityAdminPort(),
    auditRepo ?? new FakeAuditLogRepository(),
  );
}

describe("UnsuspendUser", () => {
  let prisma: FakePrismaService;
  let identityRead: FakeIdentityReadPort;
  let identityAdmin: FakeIdentityAdminPort;
  let auditRepo: FakeAuditLogRepository;

  beforeEach(() => {
    prisma = new FakePrismaService();
    identityRead = new FakeIdentityReadPort();
    identityAdmin = new FakeIdentityAdminPort();
    auditRepo = new FakeAuditLogRepository();
  });

  it("unsuspends a suspended user and writes audit", async () => {
    identityRead.seed("u1", { role: "buyer", suspendedAt: new Date("2026-01-01T00:00:00Z"), suspendedById: "admin-1", suspensionReason: "Spam" });
    identityAdmin.seed("u1", { suspendedAt: new Date("2026-01-01T00:00:00Z"), suspendedById: "admin-1", suspensionReason: "Spam" });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, auditRepo);
    const result = await uc.execute({
      userId: "u1",
      adminUserId: "admin-1",
      reason: "Mistake",
    });

    expect(result.targetId).toBe("u1");
    expect(result.targetState.suspendedAt).toBeNull();
    expect(result.auditLogId).toBeDefined();
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]!.action).toBe(AdminSchemas.AdminAuditAction.UserUnsuspend);
    expect(auditRepo.rows[0]!.details).toMatchObject({
      reason: "Mistake",
      before: { suspendedAt: new Date("2026-01-01T00:00:00Z"), suspendedById: "admin-1", suspensionReason: "Spam" },
      after: { suspendedAt: null, suspendedById: null, suspensionReason: null },
    });
  });

  it("returns NOT_FOUND for missing user", async () => {
    const uc = makeUseCase(prisma, identityRead, identityAdmin, auditRepo);
    await expect(
      uc.execute({ userId: "missing", adminUserId: "admin-1", reason: "Mistake" }),
    ).rejects.toThrow(NotFoundException);
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("returns ADMIN_TARGET_NOT_MODERATABLE for admin target", async () => {
    identityRead.seed("u1", { role: "admin", suspendedAt: new Date("2026-01-01T00:00:00Z") });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, auditRepo);
    try {
      await uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Mistake" });
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
    identityRead.seed("admin-1", { role: "admin", suspendedAt: new Date("2026-01-01T00:00:00Z") });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, auditRepo);
    try {
      await uc.execute({ userId: "admin-1", adminUserId: "admin-1", reason: "Mistake" });
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
    identityRead.seed("buyer-1", { role: "buyer", suspendedAt: new Date("2026-01-01T00:00:00Z") });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, auditRepo);
    try {
      await uc.execute({ userId: "buyer-1", adminUserId: "buyer-1", reason: "Mistake" });
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

  it("returns MODERATION_TARGET_STATE_CONFLICT for non-suspended user", async () => {
    identityRead.seed("u1", { role: "buyer" });

    const uc = makeUseCase(prisma, identityRead, identityAdmin, auditRepo);
    try {
      await uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Mistake" });
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

  it("rolls back when audit write fails", async () => {
    identityRead.seed("u1", { role: "buyer", suspendedAt: new Date("2026-01-01T00:00:00Z"), suspendedById: "admin-1", suspensionReason: "Spam" });
    identityAdmin.seed("u1", { suspendedAt: new Date("2026-01-01T00:00:00Z"), suspendedById: "admin-1", suspensionReason: "Spam" });

    const failingPrisma = {
      async $transaction<T>(_fn: (tx: unknown) => Promise<T>): Promise<T> {
        throw new Error("Transaction rollback");
      },
    };

    const uc = makeUseCase(
      failingPrisma as unknown as FakePrismaService,
      identityRead,
      identityAdmin,
      auditRepo,
    );
    await expect(
      uc.execute({ userId: "u1", adminUserId: "admin-1", reason: "Mistake" }),
    ).rejects.toThrow("Transaction rollback");

    expect(identityAdmin.states["u1"]?.suspendedAt).not.toBeNull();
    expect(auditRepo.rows).toHaveLength(0);
  });
});
