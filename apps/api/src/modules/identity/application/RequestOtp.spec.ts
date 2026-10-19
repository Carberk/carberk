import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type {
  OtpRequest,
  SignInCodeChannel,
  SignInCodePurpose,
} from "../domain/OtpRequest";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { OtpSenderPort, OtpSms } from "../domain/ports/OtpSenderPort";
import type { EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { ReviewerOtpBypassConfig } from "../domain/ports/ReviewerOtpBypassConfig";
import type { ConstantTimeComparatorPort } from "../domain/ports/ConstantTimeComparatorPort";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import type { User } from "../domain/User";
import { RequestAccountDeletion } from "./RequestAccountDeletion";
import { RequestOtp } from "./RequestOtp";
import { RequestSignInMethodChange } from "./RequestSignInMethodChange";
import { parseReviewerOtpBypassConfig } from "../infrastructure/ReviewerOtpBypassConfigFactory";

const START = new Date("2026-09-23T12:00:00Z");

class FakeClock implements ClockPort {
  current = START;
  now(): Date { return this.current; }
  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

class FakeOtpRequestRepository implements OtpRequestRepository {
  records: OtpRequest[] = [];
  private idCounter = 0;
  constructor(private readonly clock: ClockPort) {}

  async create(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    codeHash: string;
    expiresAt: Date;
    userId: string | null;
    ip: string;
  }): Promise<OtpRequest> {
    const record: OtpRequest = {
      id: `00000000-0000-4000-8000-${String(++this.idCounter).padStart(12, "0")}`,
      ...input,
      verifiedAt: null,
      attempts: 0,
      createdAt: this.clock.now(),
    };
    this.records.push(record);
    return record;
  }

  async findById(id: string): Promise<OtpRequest | null> {
    return this.records.find((record) => record.id === id) ?? null;
  }

  async findLatestByDestination(
    channel: SignInCodeChannel,
    destination: string,
  ): Promise<OtpRequest | null> {
    return this.records
      .filter((record) => record.channel === channel && record.destination === destination)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  }

  async findLatestForPurpose(): Promise<OtpRequest | null> { throw new Error("unused"); }

  async countByDestinationSince(
    channel: SignInCodeChannel,
    destination: string,
    since: Date,
  ): Promise<number> {
    return this.records.filter(
      (record) =>
        record.channel === channel &&
        record.destination === destination &&
        record.createdAt >= since,
    ).length;
  }

  async countByIpSince(ip: string, since: Date): Promise<number> {
    return this.records.filter(
      (record) => record.ip === ip && record.createdAt >= since,
    ).length;
  }

  async consumeIfUnused(): Promise<boolean> { throw new Error("unused"); }

  async markVerified(): Promise<OtpRequest> { throw new Error("unused"); }
  async incrementAttempts(): Promise<OtpRequest> { throw new Error("unused"); }
}

class FakeOtpSender implements OtpSenderPort {
  sent: OtpSms[] = [];
  async send(sms: OtpSms): Promise<void> {
    this.sent.push(sms);
  }
}

class FakeEmailCodeSender implements EmailCodeSenderPort {
  jobs: Array<Parameters<EmailCodeSenderPort["enqueue"]>[0]> = [];
  async enqueue(input: {
    requestId: string;
    email: string;
    code: string;
    locale: "ru" | "tk" | "en";
    purpose: "sign-in" | "sign-in-method" | "account-deletion";
  }): Promise<void> {
    this.jobs.push(input);
  }
}

const comparator: ConstantTimeComparatorPort = {
  compare: (candidate, expected) => candidate === expected,
};
const noReviewers: ReviewerOtpBypassConfig = { enabled: false, accounts: [] };

function harness(options: {
  testMode?: boolean;
  reviewerConfig?: ReviewerOtpBypassConfig;
} = {}) {
  const clock = new FakeClock();
  const repo = new FakeOtpRequestRepository(clock);
  const sms = new FakeOtpSender();
  const email = new FakeEmailCodeSender();
  const useCase = new RequestOtp(
    repo,
    sms,
    clock,
    options.testMode ?? false,
    email,
    options.reviewerConfig ?? noReviewers,
    comparator,
  );
  return { clock, repo, sms, email, useCase };
}

function reviewerConfig(): ReviewerOtpBypassConfig {
  return {
    enabled: true,
    accounts: [{
      phone: "+99365000001",
      email: "reviewer1@autotm.bagtyyar.dev",
      code: "111111",
    }],
  };
}

/** The three code-requesting flows over one store, as in production. */
function allFlows() {
  const { clock, repo, sms, email, useCase: signIn } = harness();
  const holder: User = {
    id: "user-1",
    phone: "+99361234567",
    phoneVerifiedAt: START,
    email: null,
    emailVerifiedAt: null,
    displayName: null,
    nameNumber: 4821,
    avatarIndex: 7,
    avatarKey: null,
    avatarUrl: null,
    locale: "ru",
    role: "buyer",
    createdAt: START,
    updatedAt: START,
    deletionScheduledAt: null,
  };
  const users: SignInMethodRepository = {
    findById: async (id) => (id === holder.id ? holder : null),
    findByPhone: async (phone) => (phone === holder.phone ? holder : null),
    findByEmail: async () => null,
    replaceSignInMethod: async () => { throw new Error("unused"); },
  };
  const deletion = new RequestAccountDeletion(repo, users, sms, clock, false, email);
  const methodChange = new RequestSignInMethodChange(repo, users, sms, clock, false, email);
  return { clock, repo, signIn, deletion, methodChange };
}

describe("RequestOtp", () => {
  it("preserves the phone request path and five-minute expiry", async () => {
    const { useCase, repo, sms, email } = harness();
    const result = await useCase.execute({ phone: "+99361234567", ip: "127.0.0.1", locale: "tk" });

    expect(result.resendInSeconds).toBe(60);
    expect(repo.records[0]).toMatchObject({
      purpose: "sign-in",
      channel: "phone",
      destination: "+99361234567",
    });
    expect(repo.records[0]!.expiresAt).toEqual(new Date(START.getTime() + 5 * 60_000));
    expect(repo.records[0]!.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sms.sent).toEqual([{
      phone: "+99361234567",
      code: expect.stringMatching(/^\d{6}$/),
      purpose: "sign-in",
      locale: "tk",
      requestId: result.requestId,
    }]);
    expect(email.jobs).toHaveLength(0);
  });

  it("normalizes email, stores a ten-minute request, and enqueues the plaintext code", async () => {
    const { useCase, repo, sms, email } = harness();
    await useCase.execute({ email: "  Buyer@Example.COM ", ip: "127.0.0.1" });

    expect(repo.records[0]).toMatchObject({
      purpose: "sign-in",
      channel: "email",
      destination: "buyer@example.com",
    });
    expect(repo.records[0]!.expiresAt).toEqual(new Date(START.getTime() + 10 * 60_000));
    expect(repo.records[0]!.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repo.records[0]!.codeHash).not.toBe(email.jobs[0]!.code);
    expect(email.jobs[0]).toMatchObject({
      requestId: repo.records[0]!.id,
      email: "buyer@example.com",
      locale: "ru",
      purpose: "sign-in",
    });
    expect(email.jobs[0]!.code).toMatch(/^\d{6}$/);
    expect(sms.sent).toHaveLength(0);
  });

  it("enforces backoff and returns the next cooldown after an accepted retry", async () => {
    const { useCase, clock } = harness();
    const input = { email: "buyer@example.com", ip: "127.0.0.1" };

    await expect(useCase.execute(input)).resolves.toMatchObject({ resendInSeconds: 60 });
    const refusal = await useCase.execute(input).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(SignInCodeRateLimitedError);
    expect(refusal).toMatchObject({ reason: "BACKOFF", retryInSeconds: 60 });
    clock.advance(20);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      reason: "BACKOFF",
      retryInSeconds: 40,
    });
    clock.advance(40);
    await expect(useCase.execute(input)).resolves.toMatchObject({ resendInSeconds: 120 });
  });

  it("limits each normalized destination to five requests per 24 hours", async () => {
    const { useCase, clock } = harness();
    const input = { email: "buyer@example.com", ip: "127.0.0.1" };

    for (const wait of [0, 60, 120, 240, 480]) {
      if (wait > 0) clock.advance(wait);
      await useCase.execute(input);
    }
    clock.advance(960);
    const refusal = await useCase.execute(input).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(SignInCodeRateLimitedError);
    expect(refusal).toMatchObject({ reason: "DESTINATION_LIMIT", retryInSeconds: 0 });
  });

  it("reports the destination limit, not a timer, while a backoff is still running", async () => {
    const { useCase, clock } = harness();
    const input = { email: "buyer@example.com", ip: "127.0.0.1" };

    for (const wait of [0, 60, 120, 240, 480]) {
      if (wait > 0) clock.advance(wait);
      await useCase.execute(input);
    }
    clock.advance(10);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      reason: "DESTINATION_LIMIT",
      retryInSeconds: 0,
    });
  });

  it("shares the ten-request IP budget across phone and email", async () => {
    const { useCase } = harness();
    for (let index = 0; index < 10; index++) {
      if (index % 2 === 0) {
        await useCase.execute({
          phone: `+9936${String(1000000 + index).slice(-7)}`,
          ip: "10.0.0.1",
        });
      } else {
        await useCase.execute({ email: `buyer${index}@example.com`, ip: "10.0.0.1" });
      }
    }

    await expect(
      useCase.execute({ email: "eleventh@example.com", ip: "10.0.0.1" }),
    ).rejects.toMatchObject({ reason: "IP_LIMIT", retryInSeconds: 0 });
  });

  describe("limits shared with the other code purposes (ADR-0081)", () => {
    const phone = "+99362345678";

    it("counts deletion and method-change codes against the sign-in budget for the number", async () => {
      const { clock, repo, signIn, deletion, methodChange } = allFlows();

      await deletion.execute({ phone, ip: "10.0.0.1" });
      clock.advance(60);
      await methodChange.execute({ userId: "user-1", phone, ip: "10.0.0.2" });
      clock.advance(120);
      await deletion.execute({ phone, ip: "10.0.0.3" });
      clock.advance(240);
      await methodChange.execute({ userId: "user-1", phone, ip: "10.0.0.4" });
      clock.advance(480);
      await deletion.execute({ phone, ip: "10.0.0.5" });
      clock.advance(960);

      const refusal = await signIn
        .execute({ phone, ip: "10.0.0.6" })
        .catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(SignInCodeRateLimitedError);
      expect(refusal).toMatchObject({ reason: "DESTINATION_LIMIT", retryInSeconds: 0 });
      expect(repo.records.map((record) => record.purpose)).toEqual([
        "account-deletion",
        "sign-in-method",
        "account-deletion",
        "sign-in-method",
        "account-deletion",
      ]);
    });

    it("applies the backoff after a code of another purpose", async () => {
      const { clock, signIn, methodChange } = allFlows();

      await methodChange.execute({ userId: "user-1", phone, ip: "10.0.0.1" });
      clock.advance(15);

      await expect(signIn.execute({ phone, ip: "10.0.0.2" })).rejects.toMatchObject({
        reason: "BACKOFF",
        retryInSeconds: 45,
      });
    });

    it("counts every purpose against the per-IP budget", async () => {
      const { signIn, deletion, methodChange } = allFlows();
      for (let index = 0; index < 10; index++) {
        const target = `+9936${String(3000000 + index).slice(-7)}`;
        if (index % 2 === 0) {
          await deletion.execute({ phone: target, ip: "10.0.0.9" });
        } else {
          await methodChange.execute({ userId: "user-1", phone: target, ip: "10.0.0.9" });
        }
      }

      await expect(
        signIn.execute({ phone: "+99364999999", ip: "10.0.0.9" }),
      ).rejects.toMatchObject({ reason: "IP_LIMIT", retryInSeconds: 0 });
    });
  });

  it("keeps reserved phones issuance-free and rate-limit exempt", async () => {
    const { useCase, repo, sms, email } = harness({ reviewerConfig: reviewerConfig() });
    for (let index = 0; index < 12; index++) {
      await useCase.execute({ phone: "+99365000001", ip: "10.0.0.1" });
    }
    expect(repo.records).toHaveLength(0);
    expect(sms.sent).toHaveLength(0);
    expect(email.jobs).toHaveLength(0);
  });

  it("keeps a tester phone issuance-free with the reviewer flag off and sends no SMS (ADR-0086)", async () => {
    const testerConfig = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: false,
      TESTER_ACCOUNTS_JSON: JSON.stringify([
        { phone: "+99370000001", email: "tester1@example.com", code: "765432" },
      ]),
    });
    const { useCase, repo, sms, email } = harness({ reviewerConfig: testerConfig });

    for (let index = 0; index < 12; index++) {
      await useCase.execute({ phone: "+99370000001", ip: "10.0.0.1" });
    }

    expect(repo.records).toHaveLength(0);
    expect(sms.sent).toHaveLength(0);
    expect(email.jobs).toHaveLength(0);
  });

  it("stores a tester email request with its fixed code and enqueues no email", async () => {
    const testerConfig = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: false,
      TESTER_ACCOUNTS_JSON: JSON.stringify([
        { phone: "+99370000001", email: "tester1@example.com", code: "765432" },
      ]),
    });
    const { useCase, repo, sms, email } = harness({ reviewerConfig: testerConfig });

    await useCase.execute({ email: "tester1@example.com", ip: "10.0.0.1" });

    expect(repo.records).toHaveLength(1);
    expect(repo.records[0]).toMatchObject({
      channel: "email",
      destination: "tester1@example.com",
      codeHash: createHash("sha256").update("765432").digest("hex"),
    });
    expect(sms.sent).toHaveLength(0);
    expect(email.jobs).toHaveLength(0);
  });

  it("stores and rate-limits reserved emails without enqueueing a hard bounce", async () => {
    const { useCase, repo, email, clock } = harness({ reviewerConfig: reviewerConfig() });
    const input = { email: "reviewer1@autotm.bagtyyar.dev", ip: "10.0.0.1" };

    for (const wait of [0, 60, 120, 240, 480]) {
      if (wait > 0) clock.advance(wait);
      await useCase.execute(input);
    }
    clock.advance(960);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      reason: "DESTINATION_LIMIT",
      retryInSeconds: 0,
    });
    expect(repo.records).toHaveLength(5);
    expect(email.jobs).toHaveLength(0);
  });

  it("returns the code only in test mode", async () => {
    const enabled = harness({ testMode: true });
    const disabled = harness();
    await expect(
      enabled.useCase.execute({ email: "one@example.com", ip: "127.0.0.1" }),
    ).resolves.toMatchObject({ testCode: expect.stringMatching(/^\d{6}$/) });
    await expect(
      disabled.useCase.execute({ email: "two@example.com", ip: "127.0.0.1" }),
    ).resolves.not.toHaveProperty("testCode");
  });
});
