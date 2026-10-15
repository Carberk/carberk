import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
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
      const row = await this.prisma.totpEnrollment.create({
        data: { userId, encryptedSecret },
      });
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
    await this.prisma.totpEnrollment.update({
      where: { userId },
      data: { verifiedAt: new Date() },
    });
  }

  async addBackupCodes(
    enrollmentId: string,
    codeHashes: string[],
  ): Promise<void> {
    await this.prisma.totpBackupCode.createMany({
      data: codeHashes.map((codeHash) => ({ totpEnrollmentId: enrollmentId, codeHash })),
    });
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
    const result = await this.prisma.totpBackupCode.updateMany({
      where: { totpEnrollmentId: enrollmentId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async completeFirstVerification(input: {
    userId: string;
    enrollmentId: string;
    verifiedAt: Date;
    codeHashes: string[];
    sessionId: string;
    adminTotpExpiresAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.totpEnrollment.updateMany({
        where: {
          id: input.enrollmentId,
          userId: input.userId,
          verifiedAt: null,
        },
        data: { verifiedAt: input.verifiedAt },
      });
      if (marked.count !== 1) {
        throw new Error("TOTP_ENROLLMENT_NOT_PENDING");
      }

      await tx.totpBackupCode.createMany({
        data: input.codeHashes.map((codeHash) => ({
          totpEnrollmentId: input.enrollmentId,
          codeHash,
        })),
      });

      const elevated = await tx.session.updateMany({
        where: { id: input.sessionId, userId: input.userId,
          expiresAt: { gt: input.verifiedAt },
          user: { suspendedAt: null, deletionScheduledAt: null,
            OR: [{ role: "admin" }, { staffGrants: { some: { revokedAt: null } } }] },
        },
        data: { adminTotpExpiresAt: input.adminTotpExpiresAt },
      });
      if (elevated.count !== 1) {
        throw new Error("SESSION_NOT_FOUND");
      }
    });
  }

  async consumeBackupCodeAndElevate(input: {
    userId: string;
    enrollmentId: string;
    codeHash: string;
    usedAt: Date;
    sessionId: string;
    adminTotpExpiresAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.totpBackupCode.updateMany({
        where: {
          totpEnrollmentId: input.enrollmentId,
          codeHash: input.codeHash,
          usedAt: null,
        },
        data: { usedAt: input.usedAt },
      });
      if (consumed.count !== 1) return false;

      const elevated = await tx.session.updateMany({
        where: { id: input.sessionId, userId: input.userId,
          expiresAt: { gt: input.usedAt },
          user: { suspendedAt: null, deletionScheduledAt: null,
            OR: [{ role: "admin" }, { staffGrants: { some: { revokedAt: null } } }] },
        },
        data: { adminTotpExpiresAt: input.adminTotpExpiresAt },
      });
      if (elevated.count !== 1) {
        throw new Error("SESSION_NOT_FOUND");
      }

      return true;
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.totpEnrollment.deleteMany({ where: { userId } });
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
