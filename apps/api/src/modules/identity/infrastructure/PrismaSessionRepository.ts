import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, assertDiagnosticSourceCommand, withDiagnosticSourceCommand } from "@auto-tm/db";
import type { Session } from "../domain/Session";
import type { SessionRepository, SessionLookupResult } from "../domain/ports/SessionRepository";
import type { PasswordHasherPort } from "../domain/ports/PasswordHasherPort";
import { BcryptHasherAdapter } from "./BcryptHasherAdapter";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BcryptHasherAdapter) private readonly hasher: PasswordHasherPort,
  ) {}

  async create(input: {
    userId: string;
    refreshTokenHash: string;
    deviceLabel: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<Session> {
    const row = await this.prisma.session.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        deviceLabel: input.deviceLabel,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
    });
    return this.toDomain(row);
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.session.count({ where: { userId } });
  }

  async deleteExpiredByUserId(userId: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  async deleteOldestByUserId(userId: string): Promise<void> {
    const oldest = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (oldest) {
      await this.prisma.session.delete({ where: { id: oldest.id } });
    }
  }

  async findByRefreshToken(plaintext: string): Promise<SessionLookupResult | null> {
    const rows = await this.prisma.session.findMany({
      include: {
        user: { select: { id: true, phone: true, email: true, role: true } },
      },
    });

    for (const row of rows) {
      const match = await this.hasher.compare(plaintext, row.refreshTokenHash);
      if (match) {
        return {
          session: this.toDomain(row),
          userId: row.user.id,
          phone: row.user.phone,
          email: row.user.email,
          role: row.user.role as string,
        };
      }
    }

    return null;
  }

  async rotateRefreshToken(
    id: string,
    oldHash: string,
    newHash: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id, refreshTokenHash: oldHash },
      data: { refreshTokenHash: newHash, lastSeenAt, expiresAt },
    });
    return result.count === 1;
  }

  async findById(id: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    if (!row) return null;
    return this.toDomain(row);
  }

  async updateAdminTotpExpiresAt(
    id: string,
    adminTotpExpiresAt: Date | null,
    currentStaff?: { userId: string; now: Date },
  ): Promise<void> {
    const updated = await this.prisma.session.updateMany({
      where: { id, ...(currentStaff ? {
        userId: currentStaff.userId, expiresAt: { gt: currentStaff.now },
        user: { suspendedAt: null, deletionScheduledAt: null,
          OR: [{ role: "admin" }, { staffGrants: { some: { revokedAt: null } } }] },
      } : {}) }, data: { adminTotpExpiresAt },
    });
    if (updated.count !== 1) throw new Error("SESSION_NOT_FOUND");
  }

  async delete(id: string): Promise<void> {
    await this.prisma.session.delete({ where: { id } });
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    // Discover the complete deletion set before entering the prepared
    // transaction. The source command then rechecks every row while holding
    // the kernel's ordered locks, so a concurrent session create or change
    // cannot be silently omitted.
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      select: { id: true, userId: true, expiresAt: true, adminTotpExpiresAt: true },
    });
    if (!sessions.length) return 0;
    const rows = sessions.map((session) => ({
      table: "sessions" as const,
      key: { id: session.id },
      verb: "delete" as const,
      expected: {
        source: {
          id: session.id,
          userId: session.userId,
          expiresAt: session.expiresAt.toISOString(),
          adminTotpExpiresAt: session.adminTotpExpiresAt?.toISOString() ?? null,
        },
      },
      next: null,
    }));
    return this.prisma.$transaction((tx) => withDiagnosticSourceCommand(tx, {
      operation: "session_change",
      roots: sessions.map(({ id }) => ({ table: "sessions" as const, key: { id } })),
      rows,
      actorUserId: userId,
      sessionId: null,
      cutoff: null,
      campaign: null,
    }, async (receipt) => {
      await assertDiagnosticSourceCommand(tx, receipt, "session_change");
      const result = await tx.session.deleteMany({ where: { id: { in: sessions.map(({ id }) => id) }, userId } });
      return result.count;
    }));
  }

  private toDomain(
    row: Awaited<ReturnType<PrismaService["session"]["create"]>>,
  ): Session {
    return {
      id: row.id,
      userId: row.userId,
      refreshTokenHash: row.refreshTokenHash,
      deviceLabel: row.deviceLabel,
      userAgent: row.userAgent,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      adminTotpExpiresAt: row.adminTotpExpiresAt ?? null,
    };
  }
}
