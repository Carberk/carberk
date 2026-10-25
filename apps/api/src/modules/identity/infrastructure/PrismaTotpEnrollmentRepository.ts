import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, withCampaignPreparation, withDiagnosticSourceCommand, type Prisma, type DiagnosticSourceRow } from "@auto-tm/db";
import type { TotpEnrollment } from "../domain/TotpEnrollment";
import type { TotpBackupCode } from "../domain/TotpBackupCode";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";

@Injectable()
export class PrismaTotpEnrollmentRepository implements TotpEnrollmentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<TotpEnrollment | null> {
    const row = await this.prisma.totpEnrollment.findUnique({
      where: { userId },
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async createPending(
    userId: string,
    encryptedSecret: string,
  ): Promise<TotpEnrollment> {
    try {
      const id = randomUUID();
      const row = await this.prisma.$transaction(tx => withCampaignPreparation(tx, [{
        table: "totp_enrollments", key: { id }, verb: "insert", next: { id, userId, encryptedSecret },
      }], () => tx.totpEnrollment.create({ data: { id, userId, encryptedSecret } })));
      return this.toDomain(row);
    } catch (err: unknown) {
      // Concurrent enroll calls for the same admin race on @@unique([userId]).
      // The loser should return the existing pending enrollment so the setup
      // remains idempotent rather than surfacing a 500.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "P2002"
      ) {
        const existing = await this.prisma.totpEnrollment.findUnique({
          where: { userId },
        });
        if (existing) return this.toDomain(existing);
      }
      throw err;
    }
  }

  async markVerified(userId: string): Promise<void> {
    const verifiedAt = new Date();
    await this.prisma.$transaction(async tx => {
      const row = await tx.totpEnrollment.findUniqueOrThrow({ where: { userId } });
      await this.change(tx, userId, [this.enrollmentUpdate(row, verifiedAt)], () =>
        tx.totpEnrollment.update({ where: { id: row.id }, data: { verifiedAt, updatedAt: verifiedAt } }));
    });
  }

  async addBackupCodes(enrollmentId: string, codeHashes: string[]): Promise<void> {
    if (!codeHashes.length) return;
    const data = this.backupRows(enrollmentId, codeHashes);
    await this.prisma.$transaction(tx => withCampaignPreparation(tx,
      data.map(row => ({ table: "totp_backup_codes", key: { id: row.id }, verb: "insert", next: row })),
      () => tx.totpBackupCode.createMany({ data })));
  }

  async findBackupCodes(enrollmentId: string): Promise<TotpBackupCode[]> {
    const rows = await this.prisma.totpBackupCode.findMany({
      where: { totpEnrollmentId: enrollmentId },
    });
    return rows.map((r) => ({
      id: r.id,
      totpEnrollmentId: r.totpEnrollmentId,
      codeHash: r.codeHash,
      usedAt: r.usedAt,
    }));
  }

  async consumeBackupCode(
    enrollmentId: string,
    codeHash: string,
  ): Promise<boolean> {
    const usedAt = new Date();
    try {
      return await this.prisma.$transaction(async tx => {
        const codes = await tx.totpBackupCode.findMany({ where: { totpEnrollmentId: enrollmentId, codeHash } });
        // A duplicated hash is not two independent one-use credentials.
        const [code] = codes;
        if (codes.length !== 1 || !code || code.usedAt !== null) return false;
        const enrollment = await tx.totpEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
        return this.change(tx, enrollment.userId, [this.codeUpdate(code, usedAt)], async () => {
          const lockedCodes = await tx.totpBackupCode.findMany({ where: { totpEnrollmentId: enrollmentId, codeHash } });
          const [lockedCode] = lockedCodes;
          if (lockedCodes.length !== 1 || !lockedCode || lockedCode.id !== code.id || lockedCode.usedAt !== null) throw backupLost;
          const result = await tx.totpBackupCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt } });
          if (result.count !== 1) throw backupLost;
          return true;
        });
      });
    } catch (error) {
      if (error === backupLost) return false;
      if ((String(error).includes("diagnostic_source_stale") || String(error).includes("diagnostic_source_graph_changed")) &&
        !await this.prisma.totpBackupCode.findFirst({ where: { totpEnrollmentId: enrollmentId, codeHash, usedAt: null } })) return false;
      throw error;
    }
  }

  async completeFirstVerification(input: {
    userId: string; enrollmentId: string; verifiedAt: Date; codeHashes: string[];
    sessionId: string; adminTotpExpiresAt: Date;
  }): Promise<void> {
    try {
      await this.prisma.$transaction(async tx => {
        const enrollment = await tx.totpEnrollment.findUnique({ where: { id: input.enrollmentId } });
        if (!enrollment || enrollment.userId !== input.userId || enrollment.verifiedAt) throw new Error("TOTP_ENROLLMENT_NOT_PENDING");
        const session = await tx.session.findUnique({ where: { id: input.sessionId } });
        if (!session) throw new Error("SESSION_NOT_FOUND");
        const codes = this.backupRows(input.enrollmentId, input.codeHashes);
        const rows: DiagnosticSourceRow[] = [this.enrollmentUpdate(enrollment, input.verifiedAt),
          this.sessionUpdate(session, input.adminTotpExpiresAt),
          ...codes.map(row => ({ table: "totp_backup_codes" as const, key: { id: row.id }, verb: "insert" as const,
            expected: "absent" as const, next: row }))];
        await this.change(tx, input.userId, rows, async () => {
          const marked = await tx.totpEnrollment.updateMany({ where: { id: input.enrollmentId, userId: input.userId, verifiedAt: null },
            data: { verifiedAt: input.verifiedAt, updatedAt: input.verifiedAt } });
          if (marked.count !== 1) throw new Error("TOTP_ENROLLMENT_NOT_PENDING");
          if (codes.length) await tx.totpBackupCode.createMany({ data: codes });
          await this.elevate(tx, input.userId, input.sessionId, input.verifiedAt, input.adminTotpExpiresAt);
        }, input.sessionId);
      });
    } catch (error) {
      if (String(error).includes("diagnostic_source_stale") || String(error).includes("diagnostic_source_graph_changed")) {
        const current = await this.prisma.totpEnrollment.findUnique({ where: { id: input.enrollmentId } });
        if (!current || current.userId !== input.userId || current.verifiedAt) throw new Error("TOTP_ENROLLMENT_NOT_PENDING");
        await this.assertCurrentElevationSession(input.userId, input.sessionId, input.verifiedAt);
      }
      throw error;
    }
  }

  async consumeBackupCodeAndElevate(input: {
    userId: string; enrollmentId: string; codeHash: string; usedAt: Date;
    sessionId: string; adminTotpExpiresAt: Date;
  }): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async tx => {
        const enrollment = await tx.totpEnrollment.findUnique({ where: { id: input.enrollmentId } });
        if (!enrollment || enrollment.userId !== input.userId || !enrollment.verifiedAt) return false;
        const codes = await tx.totpBackupCode.findMany({ where: { totpEnrollmentId: input.enrollmentId, codeHash: input.codeHash } });
        const [code] = codes;
        if (codes.length !== 1 || !code || code.usedAt !== null) return false;
        const session = await tx.session.findUnique({ where: { id: input.sessionId } });
        if (!session) throw new Error("SESSION_NOT_FOUND");
        return this.change(tx, input.userId, [this.codeUpdate(code, input.usedAt), this.sessionUpdate(session, input.adminTotpExpiresAt)], async () => {
          const lockedCodes = await tx.totpBackupCode.findMany({ where: { totpEnrollmentId: input.enrollmentId, codeHash: input.codeHash } });
          const [lockedCode] = lockedCodes;
          if (lockedCodes.length !== 1 || !lockedCode || lockedCode.id !== code.id || lockedCode.usedAt !== null) throw backupLost;
          const consumed = await tx.totpBackupCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: input.usedAt } });
          if (consumed.count !== 1) throw backupLost;
          await this.elevate(tx, input.userId, input.sessionId, input.usedAt, input.adminTotpExpiresAt);
          return true;
        }, input.sessionId);
      });
    } catch (error) {
      if (error === backupLost) return false;
      if (String(error).includes("diagnostic_source_stale") || String(error).includes("diagnostic_source_graph_changed")) {
        if (!await this.prisma.totpBackupCode.findFirst({ where: { totpEnrollmentId: input.enrollmentId, codeHash: input.codeHash, usedAt: null } })) return false;
        await this.assertCurrentElevationSession(input.userId, input.sessionId, input.usedAt);
      }
      throw error;
    }
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const row = await tx.totpEnrollment.findUnique({ where: { userId } });
      if (!row) return;
      await this.change(tx, userId, [{ table: "totp_enrollments", key: { id: row.id }, verb: "delete",
        expected: { source: this.enrollmentSource(row) }, next: null }], () =>
        tx.totpEnrollment.deleteMany({ where: { id: row.id, userId } }));
    });
  }

  private enrollmentSource(row: NonNullable<Awaited<ReturnType<Prisma.TransactionClient["totpEnrollment"]["findUnique"]>>>) {
    return { id: row.id, userId: row.userId, encryptedSecret: row.encryptedSecret,
      verifiedAt: row.verifiedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  private enrollmentUpdate(row: Parameters<PrismaTotpEnrollmentRepository["enrollmentSource"]>[0], verifiedAt: Date): DiagnosticSourceRow {
    return { table: "totp_enrollments", key: { id: row.id }, verb: "update", expected: { source: this.enrollmentSource(row) },
      next: { ...this.enrollmentSource(row), verifiedAt: verifiedAt.toISOString(), updatedAt: verifiedAt.toISOString() } };
  }

  private codeUpdate(row: { id: string; totpEnrollmentId: string; codeHash: string; usedAt: Date | null }, usedAt: Date): DiagnosticSourceRow {
    const source = { ...row, usedAt: row.usedAt?.toISOString() ?? null };
    return { table: "totp_backup_codes", key: { id: row.id }, verb: "update", expected: { source }, next: { ...source, usedAt: usedAt.toISOString() } };
  }

  private sessionUpdate(row: { id: string; userId: string; expiresAt: Date; adminTotpExpiresAt: Date | null }, elevatedUntil: Date): DiagnosticSourceRow {
    const source = { id: row.id, userId: row.userId, expiresAt: row.expiresAt.toISOString(), adminTotpExpiresAt: row.adminTotpExpiresAt?.toISOString() ?? null };
    return { table: "sessions", key: { id: row.id }, verb: "update", expected: { source }, next: { ...source, adminTotpExpiresAt: elevatedUntil.toISOString() } };
  }

  private backupRows(enrollmentId: string, hashes: string[]) {
    return hashes.map(codeHash => ({ id: randomUUID(), totpEnrollmentId: enrollmentId, codeHash, usedAt: null }));
  }

  private change<T>(tx: Prisma.TransactionClient, userId: string, rows: DiagnosticSourceRow[], work: () => Promise<T>, sessionId: string | null = null) {
    return withDiagnosticSourceCommand(tx, { operation: "session_change", roots: [{ table: "users", key: { id: userId } }],
      rows, actorUserId: userId, sessionId, cutoff: null, campaign: null }, work);
  }

  private async assertCurrentElevationSession(userId: string, sessionId: string, now: Date): Promise<void> {
    // Preserve the original caller error when concurrent source rediscovery
    // observes a lost Session/authority. This is a fresh read, never a retry.
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: now },
      user: { suspendedAt: null, deletionScheduledAt: null,
        OR: [{ role: "admin" }, { staffGrants: { some: { revokedAt: null } } }] } } });
    if (!session) throw new Error("SESSION_NOT_FOUND");
  }

  private async elevate(tx: Prisma.TransactionClient, userId: string, sessionId: string, now: Date, adminTotpExpiresAt: Date) {
    const elevated = await tx.session.updateMany({ where: { id: sessionId, userId, expiresAt: { gt: now },
      user: { suspendedAt: null, deletionScheduledAt: null,
        OR: [{ role: "admin" }, { staffGrants: { some: { revokedAt: null } } }] } }, data: { adminTotpExpiresAt } });
    if (elevated.count !== 1) throw new Error("SESSION_NOT_FOUND");
  }

  private toDomain(
    row: Awaited<ReturnType<PrismaService["totpEnrollment"]["findUnique"]>>,
  ): TotpEnrollment {
    if (!row) throw new Error("Unexpected null row");
    return {
      id: row.id,
      userId: row.userId,
      encryptedSecret: row.encryptedSecret,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

const backupLost = Symbol("backup CAS lost");
