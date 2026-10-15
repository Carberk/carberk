import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type {
  OtpRequest,
  SignInCodeChannel,
  SignInCodePurpose,
} from "../domain/OtpRequest";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import { fromCodePurpose, toCodePurpose } from "./codePurpose";

@Injectable()
export class PrismaOtpRequestRepository implements OtpRequestRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    codeHash: string;
    expiresAt: Date;
    userId: string | null;
    businessId?: string | undefined;
    ip: string;
  }): Promise<OtpRequest> {
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
