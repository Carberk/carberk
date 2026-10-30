import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation } from "@auto-tm/db";
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
import type { SmsDelivery } from "../domain/ports/OtpSenderPort";
import { fromCodePurpose, toCodePurpose } from "./codePurpose";

@Injectable()
export class PrismaOtpRequestRepository implements OtpRequestRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async reserve(
    input: Parameters<OtpRequestRepository["reserve"]>[0],
    clock: ClockPort,
  ): ReturnType<OtpRequestRepository["reserve"]> {
    const { destination } = input;
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      // Setting a local cap acquires no resource lock. Keep the original cap
      // for the campaign prefix as well as the existing destination/IP locks.
      await tx.$executeRaw`SET LOCAL lock_timeout = '4s'`;
      return withCampaignPreparation(tx, [{
        table: "otp_requests", key: { id }, verb: "insert", next: {
          id, userId: input.userId ?? null, businessId: input.businessId ?? null,
          channel: destination.channel, destination: destination.value,
          phone: destination.channel === SIGN_IN_CODE_CHANNELS.PHONE ? destination.value : null,
        },
      }], async () => {
        // Two-int namespaces are separate from campaign's single-bigint fences.
        // Every producer takes exactly one destination lock, THEN one IP lock.
        // Fixed namespace order prevents admission cycles, even on hash collisions;
        // collisions only serialize unrelated requests. Never parallelize locks.
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

        // Clear even a pooled session value before the INSERT's AFTER trigger can attest it.
        await tx.$queryRaw`SELECT set_config('carberk.campaign_sms_binding', '', true)`;
        const row = await tx.otpRequest.create({ data: {
          id,
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
        const [marker] = await tx.$queryRaw<{ binding: string }[]>`
          SELECT current_setting('carberk.campaign_sms_binding', true) AS binding`;
        if (typeof marker?.binding !== "string") throw new Error("SMS delivery metadata refused");
        let smsDelivery: SmsDelivery = { kind: "ordinary" };
        if (marker.binding !== "") {
          const carrier: unknown = JSON.parse(marker.binding);
          if (typeof carrier !== "object" || carrier === null) throw new Error("SMS delivery metadata refused");
          const value = carrier as Record<string, unknown>;
          if (Object.keys(value).sort().join(",") !== "candidate,kind,namespace,requestId,reservationId" ||
            value["kind"] !== "campaign" || typeof value["reservationId"] !== "string" ||
            !/^[a-f0-9]{32}$/.test(value["reservationId"]) || typeof value["candidate"] !== "string" ||
            !/^[a-f0-9]{40}$/.test(value["candidate"]) || value["namespace"] !== `cf_${value["reservationId"]}` ||
            value["requestId"] !== row.id || destination.channel !== "phone") throw new Error("SMS delivery metadata refused");
          const namespace = `cf_${value["reservationId"]}`;
          const rows = await tx.$queryRawUnsafe<{ admitted: boolean }[]>(
            `SELECT "${namespace}".campaign_sms_authority($1,$2,$3,$4) AS admitted
              FROM "${namespace}".campaign_manifest m WHERE m.state='identities' AND m.candidate=$4
                AND m.profile='campaign897-full-v3' AND m.delivery_version=3
                AND m.sms_contract_hash=md5(pg_get_functiondef('"${namespace}".campaign_sms_authority(text,text,text,text)'::regprocedure))`,
            row.id, row.destination, row.codeHash, value["candidate"]);
          if (rows.length !== 1 || rows[0]?.admitted !== true) throw new Error("SMS delivery binding refused");
          smsDelivery = { kind: "campaign", reservationId: value["reservationId"], candidate: value["candidate"], namespace, requestId: row.id };
        }
        return { record: this.toDomain(row), resendInSeconds: rateCheck.resendInSeconds, smsDelivery };
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 10000 });
  }

  async create(input: CreateOtpRequest): Promise<OtpRequest> {
    const id = randomUUID();
    const row = await this.prisma.$transaction(tx => withCampaignPreparation(tx, [{
      table: "otp_requests", key: { id }, verb: "insert", next: {
        id, channel: input.channel, destination: input.destination,
        phone: input.channel === SIGN_IN_CODE_CHANNELS.PHONE ? input.destination : null,
        userId: input.userId ?? null, businessId: input.businessId ?? null,
      },
    }], () => tx.otpRequest.create({
      data: {
        id,
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
    })));
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
    const verifiedAt = new Date();
    const row = await this.prisma.$transaction(tx => withCampaignPreparation(tx, [{
      table: "otp_requests", key: { id }, verb: "update", next: { verifiedAt: verifiedAt.toISOString(), userId },
    }], () => tx.otpRequest.update({ where: { id }, data: { verifiedAt, userId } })));
    return this.toDomain(row);
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    const verifiedAt = new Date();
    return this.prisma.$transaction(async tx => {
      const current = await tx.otpRequest.findUnique({ where: { id } });
      if (!current || current.verifiedAt) return false;
      return withCampaignPreparation(tx, [{
        table: "otp_requests", key: { id }, verb: "update", next: { verifiedAt: verifiedAt.toISOString() },
      }], async () => (await tx.otpRequest.updateMany({ where: { id, verifiedAt: null }, data: { verifiedAt } })).count === 1);
    });
  }

  async incrementAttempts(id: string): Promise<OtpRequest> {
    const row = await this.prisma.$transaction(tx => withCampaignPreparation(tx, [{
      // attempts cannot change campaign ownership. SQL reads the stored OLD row.
      table: "otp_requests", key: { id }, verb: "update", next: {},
    }], () => tx.otpRequest.update({ where: { id }, data: { attempts: { increment: 1 } } })));
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
