import { assert, describe, expect, it } from "vitest";

import type { User } from "../domain/User";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import { InMemoryOtpRequests } from "./testing/InMemoryOtpRequests";
import type { OtpSenderPort, OtpSms } from "../domain/ports/OtpSenderPort";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import { RequestAccountDeletion } from "./RequestAccountDeletion";

const NOW = new Date("2026-09-25T00:00:00.000Z");

function makeUser(methods: Pick<User, "phone" | "email">): User {
  return {
    id: "user-1",
    phone: methods.phone,
    phoneVerifiedAt: methods.phone ? NOW : null,
    email: methods.email,
    emailVerifiedAt: methods.email ? NOW : null,
    displayName: null,
    nameNumber: 4821,
    avatarIndex: 7,
    avatarKey: null,
    avatarUrl: null,
    locale: "ru",
    role: "buyer",
    createdAt: NOW,
    updatedAt: NOW,
    deletionScheduledAt: null,
  };
}


class FakeUsers implements SignInMethodRepository {
  constructor(private readonly users: User[] = []) {}

  async findByPhone(phone: string): Promise<User | null> {
    return this.users.find((user) => user.phone === phone) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(): Promise<User | null> { return null; }
  async replaceSignInMethod(): Promise<User> { throw new Error("unused"); }
}

function setup(users: User[] = [], testMode = true) {
  const otpRepo = new InMemoryOtpRequests(() => NOW);
  const sms: OtpSms[] = [];
  const emails: Array<Parameters<EmailCodeSenderPort["enqueue"]>[0]> = [];
  const otpSender: OtpSenderPort = {
    send: async (message) => { sms.push(message); },
  };
  const emailSender: EmailCodeSenderPort = {
    enqueue: async (input) => { emails.push(input); },
  };
  const clock: ClockPort = { now: () => NOW };
  const useCase = new RequestAccountDeletion(
    otpRepo,
    new FakeUsers(users),
    otpSender,
    clock,
    testMode,
    emailSender,
  );
  return { useCase, otpRepo, sms, emails };
}

function seedLimits(repo: InMemoryOtpRequests, destinationCount: number, ipCount: number,
  destination = "+99361234567", channel: "phone" | "email" = "phone") {
  for (let i = 0; i < destinationCount; i++) repo.seed({
    purpose: "sign-in", channel, destination, codeHash: "old", ip: "other-ip",
    createdAt: new Date(NOW.getTime() - 2 * 60 * 60_000),
  });
  for (let i = 0; i < ipCount; i++) repo.seed({
    purpose: "sign-in-method", channel: "email", destination: `other-${i}@example.com`,
    codeHash: "old", ip: "10.0.0.9", createdAt: new Date(NOW.getTime() - 60_000),
  });
}

describe("RequestAccountDeletion", () => {
  it("binds a phone code to the User holding the phone and sends it by SMS", async () => {
    const { useCase, otpRepo, sms } = setup([
      makeUser({ phone: "+99361234567", email: null }),
    ]);

    const result = await useCase.execute({ phone: "+99361234567", ip: "10.0.0.1", locale: "en" });

    expect(otpRepo.records).toHaveLength(1);
    expect(otpRepo.records[0]).toMatchObject({
      purpose: "account-deletion",
      channel: "phone",
      destination: "+99361234567",
      userId: "user-1",
      ip: "10.0.0.1",
      expiresAt: new Date(NOW.getTime() + 5 * 60_000),
    });
    expect(sms).toEqual([{
        smsDelivery: { kind: "ordinary" },
      phone: "+99361234567",
      code: result.testCode,
      purpose: "account-deletion",
      locale: "en",
      requestId: result.requestId,
    }]);
    expect(otpRepo.records[0]?.codeHash).not.toBe(result.testCode);
  });

  it("enqueues an account-deletion email for a normalized email", async () => {
    const { useCase, otpRepo, emails } = setup([
      makeUser({ phone: null, email: "seller@example.com" }),
    ]);

    const result = await useCase.execute({
      email: " Seller@Example.COM ",
      ip: "10.0.0.1",
      locale: "tk",
    });

    expect(otpRepo.records[0]).toMatchObject({
      channel: "email",
      destination: "seller@example.com",
      userId: "user-1",
      expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    });
    expect(emails).toEqual([
      expect.objectContaining({
        requestId: result.requestId,
        email: "seller@example.com",
        locale: "tk",
        purpose: "account-deletion",
      }),
    ]);
  });

  it("answers an unheld value the same way and still sends a real code", async () => {
    const held = setup([makeUser({ phone: "+99361234567", email: null })], false);
    const unheld = setup([], false);

    const heldResult = await held.useCase.execute({
      phone: "+99361234567",
      ip: "10.0.0.1",
    });
    const unheldResult = await unheld.useCase.execute({
      phone: "+99361234567",
      ip: "10.0.0.1",
    });

    expect(Object.keys(unheldResult).sort()).toEqual(Object.keys(heldResult).sort());
    expect(unheldResult.resendInSeconds).toBe(heldResult.resendInSeconds);
    expect(unheld.otpRepo.records[0]?.userId).toBeNull();
    expect(unheld.sms).toHaveLength(1);
    expect(unheldResult).not.toHaveProperty("testCode");
  });

  it("refuses a request over the per-destination budget without sending", async () => {
    const { useCase, otpRepo, sms } = setup();
    seedLimits(otpRepo, 5, 0);

    await expect(
      useCase.execute({ phone: "+99361234567", ip: "10.0.0.1" }),
    ).rejects.toMatchObject({ reason: "DESTINATION_LIMIT", retryInSeconds: 0 });
    expect(otpRepo.records).toHaveLength(5);
    expect(sms).toHaveLength(0);
  });

  it("refuses a request over the shared per-IP budget", async () => {
    const { useCase, otpRepo, emails } = setup();
    seedLimits(otpRepo, 0, 10);

    await expect(
      useCase.execute({ email: "seller@example.com", ip: "10.0.0.9" }),
    ).rejects.toMatchObject({ reason: "IP_LIMIT", retryInSeconds: 0 });
    expect(emails).toHaveLength(0);
  });

  it("applies the shared cooldown after an earlier code for the same destination", async () => {
    const { useCase, otpRepo } = setup();
    await otpRepo.create({
      purpose: "sign-in",
      channel: "phone",
      destination: "+99361234567",
      codeHash: "earlier-sign-in-code",
      expiresAt: NOW,
      userId: null,
      ip: "10.0.0.1",
    });

    await expect(
      useCase.execute({ phone: "+99361234567", ip: "10.0.0.1" }),
    ).rejects.toMatchObject({ reason: "BACKOFF", retryInSeconds: 60 });
  });

  describe.each([
    { phone: "+99361234567", email: null },
    { phone: null, email: "seller@example.com" },
  ])("privacy for $phone / $email", (methods) => {
    it.each([
      { reason: "DESTINATION_LIMIT", destinationCount: 5, ipCount: 0, retryInSeconds: 0 },
      { reason: "IP_LIMIT", destinationCount: 0, ipCount: 10, retryInSeconds: 0 },
      { reason: "BACKOFF", destinationCount: 1, ipCount: 0, retryInSeconds: 45 },
    ])("refuses held and unheld destinations identically for $reason", async (limit) => {
      const held = setup([makeUser(methods)]);
      const unheld = setup([]);
      assert(methods.phone ?? methods.email);
      const destination = methods.phone ? { phone: methods.phone } : { email: methods.email ?? "" };
      const refusals: unknown[] = [];
      for (const scenario of [held, unheld]) {
        seedLimits(scenario.otpRepo, limit.reason === "BACKOFF" ? 0 : limit.destinationCount,
          limit.ipCount, methods.phone ?? methods.email ?? "", methods.phone ? "phone" : "email");
        if (limit.reason === "BACKOFF") {
          const earlier = await scenario.otpRepo.create({
            purpose: "sign-in",
            channel: methods.phone ? "phone" : "email",
            destination: methods.phone ?? methods.email ?? "",
            codeHash: "earlier-sign-in-code",
            expiresAt: NOW,
            userId: null,
            ip: "10.0.0.1",
          });
          scenario.otpRepo.records[0] = {
            ...earlier,
            createdAt: new Date(NOW.getTime() - 15_000),
          };
        }
        const before = scenario.otpRepo.records.length;
        const refusal: unknown = await scenario.useCase
          .execute({ ...destination, ip: "10.0.0.9" })
          .catch((error: unknown) => error);
        expect(refusal).toBeInstanceOf(SignInCodeRateLimitedError);
        expect(refusal).toMatchObject({ reason: limit.reason, retryInSeconds: limit.retryInSeconds });
        expect(scenario.otpRepo.records).toHaveLength(before);
        expect(scenario.sms).toHaveLength(0);
        expect(scenario.emails).toHaveLength(0);
        refusals.push(refusal);
      }
      expect(refusals[1]).toEqual(refusals[0]);
    });
  });
});
