import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaService } from "@auto-tm/db";
import type {
  OtpRequest,
  SignInCodeChannel,
  SignInCodePurpose,
} from "../domain/OtpRequest";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { CreateOtpRequest, OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import { OtpAttemptLedger, SIGN_IN_CODE_RATE_POLICY } from "../domain/OtpAttemptLedger";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import { fromCodePurpose, toCodePurpose } from "./codePurpose";

@Injectable()
export class PrismaOtpRequestRepository implements OtpRequestRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async reserve(
    input: Parameters<OtpRequestRepository["reserve"]>[0],
    clock: ClockPort,
  ): ReturnType<OtpRequestRepository["reserve"]> {
    const { destination } = input;
    return this.prisma.$transaction(async (tx) => {
      // Two-int namespaces are separate from campaign's single-bigint fences.
      // Every producer takes exactly one destination lock, THEN one IP lock.
      // Fixed namespace order prevents admission cycles, even on hash collisions;
      // collisions only serialize unrelated requests. Never parallelize locks.
      await tx.$executeRaw`SET LOCAL lock_timeout = '4s'`;
      const destinationKey = createHash("sha256")
        .update(`${destination.channel}:${destination.value}`).digest().readInt32BE(0);
      const ipKey = createHash("sha256").update(input.ip).digest().readInt32BE(0);
      // Select an integer rather than decoding PostgreSQL's void lock result.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(41301::int, ${destinationKey}::int)`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(41302::int, ${ipKey}::int)`;

      // PostgreSQL now() is transaction-start time, before a possible lock wait.
      const now = clock.now();
      const [destinationCount24h, ipCount1h, latest] = await Promise.all([
        tx.otpRequest.count({ where: {
          channel: destination.channel, destination: destination.value,
          createdAt: { gte: new Date(now.getTime() - SIGN_IN_CODE_RATE_POLICY.destinationWindowMs) },
        } }),
        tx.otpRequest.count({ where: {
          ip: input.ip,
          createdAt: { gte: new Date(now.getTime() - SIGN_IN_CODE_RATE_POLICY.ipWindowMs) },
        } }),
        tx.otpRequest.findFirst({
          where: { channel: destination.channel, destination: destination.value },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      const rateCheck = new OtpAttemptLedger(
        SIGN_IN_CODE_RATE_POLICY.destinationLimit,
        SIGN_IN_CODE_RATE_POLICY.ipLimit,
        SIGN_IN_CODE_RATE_POLICY.baseBackoffSeconds,
      ).check({ destinationCount24h, ipCount1h, lastAttemptAt: latest?.createdAt ?? null, now });
      if (!rateCheck.allowed) throw new SignInCodeRateLimitedError(rateCheck);

      const row = await tx.otpRequest.create({ data: {
        purpose: toCodePurpose(input.purpose),
        channel: destination.channel,
        destination: destination.value,
        phone: destination.channel === SIGN_IN_CODE_CHANNELS.PHONE ? destination.value : null,
        codeHash: input.codeHash,
        expiresAt: destination.expiresAt(now),
        createdAt: now,
        userId: input.userId,
        businessId: input.businessId ?? null,
        ip: input.ip,
      } });
      return { record: this.toDomain(row), resendInSeconds: rateCheck.resendInSeconds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 10000 });
  }

  async create(input: CreateOtpRequest): Promise<OtpRequest> {
    const row = await this.prisma.otpRequest.create({
      data: {
        purpose: toCodePurpose(input.purpose),
        channel: input.channel,
        destination: input.destination,
        phone: input.channel === SIGN_IN_CODE_CHANNELS.PHONE ? input.destination : null,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        userId: input.userId,
        businessId: input.businessId ?? null,
        ip: input.ip,
      },
    });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<OtpRequest | null> {
    const row = await this.prisma.otpRequest.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async countByDestinationSince(
    channel: SignInCodeChannel,
    destination: string,
    since: Date,
  ): Promise<number> {
    return this.prisma.otpRequest.count({
      where: { channel, destination, createdAt: { gte: since } },
    });
  }

  async countByIpSince(ip: string, since: Date): Promise<number> {
    return this.prisma.otpRequest.count({
      where: { ip, createdAt: { gte: since } },
    });
  }

  async findLatestByDestination(
    channel: SignInCodeChannel,
    destination: string,
  ): Promise<OtpRequest | null> {
    const row = await this.prisma.otpRequest.findFirst({
      where: { channel, destination },
      orderBy: { createdAt: "desc" },
    });
    return row ? this.toDomain(row) : null;
  }

  async findLatestForPurpose(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    userId?: string;
    businessId?: string | undefined;
  }): Promise<OtpRequest | null> {
    const row = await this.prisma.otpRequest.findFirst({
      where: {
        purpose: toCodePurpose(input.purpose),
        channel: input.channel,
        destination: input.destination,
        businessId: input.businessId ?? null,
        ...(input.userId === undefined ? {} : { userId: input.userId }),
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? this.toDomain(row) : null;
  }

  async markVerified(id: string, userId: string): Promise<OtpRequest> {
    const row = await this.prisma.otpRequest.update({
      where: { id },
      data: { verifiedAt: new Date(), userId },
    });
    return this.toDomain(row);
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    const { count } = await this.prisma.otpRequest.updateMany({
      where: { id, verifiedAt: null },
      data: { verifiedAt: new Date() },
    });
    return count === 1;
  }

  async incrementAttempts(id: string): Promise<OtpRequest> {
    const row = await this.prisma.otpRequest.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    return this.toDomain(row);
  }

  private toDomain(
    row: Awaited<ReturnType<PrismaService["otpRequest"]["create"]>>,
  ): OtpRequest {
    return {
      id: row.id,
      purpose: fromCodePurpose(row.purpose),
      channel: row.channel,
      destination: row.destination,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      verifiedAt: row.verifiedAt,
      attempts: row.attempts,
      userId: row.userId,
      businessId: row.businessId ?? undefined,
      ip: row.ip,
      createdAt: row.createdAt,
    };
  }
}
