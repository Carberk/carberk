import type { ClockPort } from "../../domain/ports/ClockPort";
import { OtpAttemptLedger, SIGN_IN_CODE_RATE_POLICY } from "../../domain/OtpAttemptLedger";
import { SignInCodeRateLimitedError } from "../../domain/SignInCodeRateLimitedError";
import type { OtpRequest, SignInCodePurpose } from "../../domain/OtpRequest";
import type { OtpRequestRepository } from "../../domain/ports/OtpRequestRepository";
import type { SignInCodeChannel } from "../../domain/types";

/** Every `otp_requests` behaviour the code use-cases rely on, in memory. */
export class InMemoryOtpRequests implements OtpRequestRepository {
  records: OtpRequest[] = [];

  constructor(private readonly now: () => Date) {}

  /** Adds a stored record directly, as another flow or an earlier request would. */
  seed(record: Partial<OtpRequest> & Pick<OtpRequest, "purpose" | "destination" | "codeHash">): OtpRequest {
    const stored: OtpRequest = {
      id: `seeded-${this.records.length + 1}`,
      channel: "phone",
      expiresAt: new Date(this.now().getTime() + 5 * 60 * 1000),
      verifiedAt: null,
      attempts: 0,
      userId: null,
      ip: "10.0.0.9",
      createdAt: this.now(),
      ...record,
    };
    this.records.push(stored);
    return stored;
  }

  // Sequential policy fake only. PostgreSQL contention is proved by the e2e suite.
  async reserve(
    input: Parameters<OtpRequestRepository["reserve"]>[0],
    clock: ClockPort,
  ): ReturnType<OtpRequestRepository["reserve"]> {
    const now = clock.now();
    const { destination } = input;
    const rateCheck = new OtpAttemptLedger(
      SIGN_IN_CODE_RATE_POLICY.destinationLimit,
      SIGN_IN_CODE_RATE_POLICY.ipLimit,
      SIGN_IN_CODE_RATE_POLICY.baseBackoffSeconds,
    ).check({
      destinationCount24h: await this.countByDestinationSince(destination.channel, destination.value,
        new Date(now.getTime() - SIGN_IN_CODE_RATE_POLICY.destinationWindowMs)),
      ipCount1h: await this.countByIpSince(input.ip,
        new Date(now.getTime() - SIGN_IN_CODE_RATE_POLICY.ipWindowMs)),
      lastAttemptAt: (await this.findLatestByDestination(destination.channel, destination.value))?.createdAt ?? null,
      now,
    });
    if (!rateCheck.allowed) throw new SignInCodeRateLimitedError(rateCheck);
    const record = await this.create({ ...input, channel: destination.channel,
      destination: destination.value, expiresAt: destination.expiresAt(now) });
    const admitted = { ...record, createdAt: now };
    this.records[this.records.indexOf(record)] = admitted;
    return { record: admitted, resendInSeconds: rateCheck.resendInSeconds };
  }

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
    const record: OtpRequest = {
      id: `00000000-0000-4000-8000-${String(this.records.length + 1).padStart(12, "0")}`,
      ...input,
      verifiedAt: null,
      attempts: 0,
      createdAt: this.now(),
    };
    this.records.push(record);
    return record;
  }

  async findById(id: string): Promise<OtpRequest | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async findLatestByDestination(
    channel: SignInCodeChannel,
    destination: string,
  ): Promise<OtpRequest | null> {
    return this.records.filter((r) => r.channel === channel && r.destination === destination)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  }

  async findLatestForPurpose(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    userId?: string;
    businessId?: string | undefined;
  }): Promise<OtpRequest | null> {
    return (
      this.records.findLast(
        (r) =>
          r.purpose === input.purpose &&
          r.channel === input.channel &&
          r.destination === input.destination &&
          (r.businessId ?? null) === (input.businessId ?? null) &&
          (input.userId === undefined || r.userId === input.userId),
      ) ?? null
    );
  }

  async countByDestinationSince(
    channel: SignInCodeChannel,
    destination: string,
    since: Date,
  ): Promise<number> {
    return this.records.filter(
      (r) => r.channel === channel && r.destination === destination && r.createdAt >= since,
    ).length;
  }

  async countByIpSince(ip: string, since: Date): Promise<number> {
    return this.records.filter((r) => r.ip === ip && r.createdAt >= since).length;
  }

  async markVerified(id: string, userId: string): Promise<OtpRequest> {
    return this.replace(id, { verifiedAt: this.now(), userId });
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    const record = await this.findById(id);
    if (!record || record.verifiedAt !== null) return false;
    this.replace(id, { verifiedAt: this.now() });
    return true;
  }

  async incrementAttempts(id: string): Promise<OtpRequest> {
    const record = await this.findById(id);
    return this.replace(id, { attempts: (record?.attempts ?? 0) + 1 });
  }

  private replace(id: string, changes: Partial<OtpRequest>): OtpRequest {
    const index = this.records.findIndex((r) => r.id === id);
    const next = { ...(this.records[index] as OtpRequest), ...changes };
    this.records[index] = next;
    return next;
  }
}
