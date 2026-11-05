import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { Session } from "../domain/Session";
import type { SessionRepository, SessionLookupResult } from "../domain/ports/SessionRepository";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";
import { RefreshTokenDigestAdapter } from "./RefreshTokenDigestAdapter";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenDigestAdapter) private readonly hasher: RefreshTokenHasherPort,
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
    const row = await this.prisma.session.findUnique({
      where: { refreshTokenHash: await this.hasher.hash(plaintext) },
      include: {
        user: { select: { id: true, phone: true, email: true, role: true } },
      },
    });
    if (!row) return null;
    return {
      session: this.toDomain(row),
      userId: row.user.id,
      phone: row.user.phone,
      email: row.user.email,
      role: row.user.role as string,
    };
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
  ): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { adminTotpExpiresAt },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.session.delete({ where: { id } });
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });
    return result.count;
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
