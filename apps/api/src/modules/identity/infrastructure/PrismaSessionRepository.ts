import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, assertDiagnosticSourceCommand, withDiagnosticSourceCommand, withCampaignPreparation, type Prisma, type DiagnosticSourceRow } from "@auto-tm/db";
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
    const id = randomUUID();
    const row = await this.prisma.$transaction((tx) => withCampaignPreparation(tx, [{
      table: "sessions", key: { id }, verb: "insert",
      next: { id, userId: input.userId, expiresAt: input.expiresAt.toISOString() },
    }], () => tx.session.create({ data: { id, ...input } })));
    return this.toDomain(row);
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.session.count({ where: { userId } });
  }

  async deleteExpiredByUserId(userId: string): Promise<number> {
    const cutoff = new Date();
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.findMany({ where: { userId, expiresAt: { lt: cutoff } } });
      if (!sessions.length) return 0;
      return this.change(tx, userId, sessions.map(row => this.deletion(row)), async () => {
        const current = await tx.session.findMany({ where: { userId, expiresAt: { lt: cutoff } } });
        this.assertSameIds(sessions, current);
        return (await tx.session.deleteMany({ where: { userId, id: { in: sessions.map(row => row.id) }, expiresAt: { lt: cutoff } } })).count;
      });
    });
  }

  async deleteOldestByUserId(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const oldest = await tx.session.findFirst({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (!oldest) return;
      await this.change(tx, userId, [this.deletion(oldest)], async () => {
        const current = await tx.session.findFirst({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        if (current?.id !== oldest.id) throw new Error("diagnostic_source_graph_changed");
        await tx.session.delete({ where: { id: oldest.id } });
      });
    });
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.session.findUnique({ where: { id } });
        if (!row || row.refreshTokenHash !== oldHash) return false;
        return this.change(tx, row.userId, [this.update(row, { expiresAt })], async () => {
          const current = await tx.session.findUnique({ where: { id } });
          if (!current || current.refreshTokenHash !== oldHash) throw refreshLost;
          // Preparation owns the locks. Sample after its waits, independently
          // of the already declared lastSeenAt/expiresAt mutation stamps.
          if (current.expiresAt <= new Date()) throw new Error("Session expired");
          const result = await tx.session.updateMany({ where: { id, refreshTokenHash: oldHash },
            data: { refreshTokenHash: newHash, lastSeenAt, expiresAt } });
          if (result.count !== 1) throw refreshLost;
          return true;
        });
      });
    } catch (error) {
      if (error === refreshLost) return false;
      // A winning refresh can change the protected expiry before preparation.
      // Preserve the original CAS loser result without retrying the command.
      if (String(error).includes("diagnostic_source_stale") || String(error).includes("diagnostic_source_graph_changed")) {
        const current = await this.prisma.session.findUnique({ where: { id } });
        if (!current || current.refreshTokenHash !== oldHash) return false;
      }
      throw error;
    }
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
    const liveWhere = (): Prisma.SessionWhereInput => ({ id, ...(currentStaff ? {
      userId: currentStaff.userId, expiresAt: { gt: new Date() },
      user: { suspendedAt: null, deletionScheduledAt: null,
        OR: [{ role: "admin" }, { staffGrants: { some: { revokedAt: null } } }] },
    } : {}) });
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.session.findUnique({ where: { id } });
        if (!row) throw new Error("SESSION_NOT_FOUND");
        await this.change(tx, row.userId, [this.update(row, { adminTotpExpiresAt })], async () => {
          const updated = await tx.session.updateMany({ where: liveWhere(), data: { adminTotpExpiresAt } });
          if (updated.count !== 1) throw new Error("SESSION_NOT_FOUND");
        });
      });
    } catch (error) {
      if (currentStaff && (String(error).includes("diagnostic_source_stale") || String(error).includes("diagnostic_source_graph_changed")) &&
        !await this.prisma.session.findFirst({ where: liveWhere() })) throw new Error("SESSION_NOT_FOUND");
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.session.findUniqueOrThrow({ where: { id } });
      await this.change(tx, row.userId, [this.deletion(row)], () => tx.session.delete({ where: { id } }));
    });
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    // Declare deletion effects from an unlocked inventory. Preparation checks
    // protected tuples; the locked ownership set must still match below.
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
      // The User is the ownership root for the complete Session inventory.
      // Discovery includes every owned Session, but only rows declared above
      // have deletion effects. Graph changes during locking refuse in SQL.
      // Session rows are already roots for their own projections; keeping the
      // ownership root separate also stays within the kernel's 100-root cap.
      roots: [{ table: "users" as const, key: { id: userId } }],
      rows,
      actorUserId: userId,
      sessionId: null,
      cutoff: null,
      campaign: null,
    }, async (receipt) => {
      await assertDiagnosticSourceCommand(tx, receipt, "session_change");
      // The User fence stabilizes the complete owned set. A Session committed
      // before preparation may be discovered and locked without a declared
      // delete effect. Refuse that stale inventory before attempting any write;
      // neither extend the receipt nor retry implicitly.
      const lockedSessions = await tx.session.findMany({
        where: { userId },
        select: { id: true },
      });
      const declaredSessionIds = new Set(rows.map((row) => row.key.id));
      if (lockedSessions.length !== declaredSessionIds.size ||
          lockedSessions.some((session) => !declaredSessionIds.has(session.id))) {
        throw new Error("diagnostic_source_graph_changed");
      }
      // Exact coverage now permits deleting the complete ownership set.
      const result = await tx.session.deleteMany({ where: { userId } });
      return result.count;
    }));
  }

  private source(row: { id: string; userId: string; expiresAt: Date; adminTotpExpiresAt: Date | null }) {
    return { id: row.id, userId: row.userId, expiresAt: row.expiresAt.toISOString(),
      adminTotpExpiresAt: row.adminTotpExpiresAt?.toISOString() ?? null };
  }

  private deletion(row: Parameters<PrismaSessionRepository["source"]>[0]): DiagnosticSourceRow {
    return { table: "sessions", key: { id: row.id }, verb: "delete", expected: { source: this.source(row) }, next: null };
  }

  private update(row: Parameters<PrismaSessionRepository["source"]>[0], patch: { expiresAt?: Date; adminTotpExpiresAt?: Date | null }): DiagnosticSourceRow {
    return { table: "sessions", key: { id: row.id }, verb: "update", expected: { source: this.source(row) }, next: this.source({ ...row, ...patch }) };
  }

  private change<T>(tx: Prisma.TransactionClient, userId: string, rows: DiagnosticSourceRow[], work: () => Promise<T>): Promise<T> {
    return withDiagnosticSourceCommand(tx, { operation: "session_change", roots: [{ table: "users", key: { id: userId } }],
      rows, actorUserId: userId, sessionId: null, cutoff: null, campaign: null }, work);
  }

  private assertSameIds(expected: { id: string }[], actual: { id: string }[]): void {
    const ids = new Set(expected.map(row => row.id));
    if (actual.length !== ids.size || actual.some(row => !ids.has(row.id))) throw new Error("diagnostic_source_graph_changed");
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

// Throwing aborts the prepared transaction before returning the CAS loser result.
const refreshLost = Symbol("refresh CAS lost");
