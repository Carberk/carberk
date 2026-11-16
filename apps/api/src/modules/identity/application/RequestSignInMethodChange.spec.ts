import { NodeCredentialCrypto } from "../infrastructure/NodeCredentialCrypto";
import { describe, expect, it } from "vitest";

import type { User } from "../domain/User";
import type { SignInCodeChannel } from "../domain/types";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import type { OtpRequest, SignInCodePurpose } from "../domain/OtpRequest";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { OtpSenderPort, OtpSms } from "../domain/ports/OtpSenderPort";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import { RequestSignInMethodChange } from "./RequestSignInMethodChange";

const NOW = new Date("2026-09-24T00:00:00.000Z");

function user(methods: Pick<User, "phone" | "phoneVerifiedAt" | "email" | "emailVerifiedAt">): User {
  return {
    id: "user-1",
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
    ...methods,
  };
}

class FakeOtpRepo implements OtpRequestRepository {
  records: OtpRequest[] = [];

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
      id: `request-${this.records.length + 1}`,
      ...input,
      verifiedAt: null,
      attempts: 0,
      createdAt: NOW,
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
    return this.records.findLast(
      (record) => record.channel === channel && record.destination === destination,
    ) ?? null;
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

class FakeUsers implements SignInMethodRepository {
  constructor(readonly current: User | null) {}
  async findById(): Promise<User | null> { return this.current; }
  async findByPhone(): Promise<User | null> { return null; }
  async findByEmail(): Promise<User | null> { return null; }
  async replaceSignInMethod(): Promise<User> { throw new Error("unused"); }
}

function harness(current: User | null) {
  const otpRepo = new FakeOtpRepo();
  const sms: OtpSms[] = [];
  const email: Array<Parameters<EmailCodeSenderPort["enqueue"]>[0]> = [];
  const smsSender: OtpSenderPort = {
    send: async (message) => { sms.push(message); },
  };
  const emailSender: EmailCodeSenderPort = {
    enqueue: async (input) => { email.push(input); },
  };
  const clock: ClockPort = { now: () => NOW };
  const useCase = new RequestSignInMethodChange(
    otpRepo,
    new FakeUsers(current),
    smsSender,
    clock,
    true,
    emailSender,
    new NodeCredentialCrypto(),
  );
  return { otpRepo, sms, email, useCase };
}

describe("RequestSignInMethodChange", () => {
  it("sends a phone code for an email-only User and binds it to that User", async () => {
    const { useCase, otpRepo, sms, email } = harness(user({
      phone: null,
      phoneVerifiedAt: null,
      email: "buyer@example.com",
      emailVerifiedAt: NOW,
    }));

    const result = await useCase.execute({
      userId: "user-1",
      phone: "+99361234567",
      ip: "127.0.0.1",
    });

    expect(result.testCode).toMatch(/^\d{6}$/);
    expect(otpRepo.records[0]).toMatchObject({
      purpose: "sign-in-method",
      channel: "phone",
      destination: "+99361234567",
      userId: "user-1",
    });
    expect(sms).toEqual([{
      phone: "+99361234567",
      code: result.testCode,
      purpose: "sign-in-method",
      locale: "ru",
      requestId: result.requestId,
    }]);
    expect(email).toEqual([]);
  });

  it("normalizes email and queues Sign-in Method copy for a phone-only User", async () => {
    const { useCase, email } = harness(user({
      phone: "+99361234567",
      phoneVerifiedAt: NOW,
      email: null,
      emailVerifiedAt: null,
    }));

    const result = await useCase.execute({
      userId: "user-1",
      email: " Buyer@Example.COM ",
      ip: "127.0.0.1",
      locale: "en",
    });

    expect(email).toEqual([{
      requestId: "request-1",
      email: "buyer@example.com",
      code: result.testCode,
      locale: "en",
      purpose: "sign-in-method",
    }]);
  });

  it("uses the shared per-IP budget", async () => {
    const { useCase, otpRepo } = harness(user({
      phone: "+99361234567",
      phoneVerifiedAt: NOW,
      email: null,
      emailVerifiedAt: null,
    }));
    for (let index = 0; index < 10; index++) {
      otpRepo.records.push({
        id: `existing-${index}`,
        purpose: "sign-in",
        channel: index % 2 === 0 ? "phone" : "email",
        destination: `destination-${index}`,
        codeHash: "hash",
        expiresAt: new Date(NOW.getTime() + 60_000),
        verifiedAt: null,
        attempts: 0,
        userId: null,
        ip: "10.0.0.1",
        createdAt: NOW,
      });
    }

    await expect(useCase.execute({
      userId: "user-1",
      email: "new@example.com",
      ip: "10.0.0.1",
    })).rejects.toMatchObject({ reason: "IP_LIMIT", retryInSeconds: 0 });
  });

  it("refuses a repeat request inside the backoff with the remaining wait", async () => {
    const { useCase } = harness(user({
      phone: "+99361234567",
      phoneVerifiedAt: NOW,
      email: null,
      emailVerifiedAt: null,
    }));
    const input = { userId: "user-1", email: "new@example.com", ip: "10.0.0.1" };
    await useCase.execute(input);

    const refusal = await useCase.execute(input).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SignInCodeRateLimitedError);
    expect(refusal).toMatchObject({ reason: "BACKOFF", retryInSeconds: 60 });
  });

  it("refuses a sixth request in 24 hours as the destination limit", async () => {
    const { useCase, otpRepo } = harness(user({
      phone: "+99361234567",
      phoneVerifiedAt: NOW,
      email: null,
      emailVerifiedAt: null,
    }));
    for (let index = 0; index < 5; index++) {
      otpRepo.records.push({
        id: `existing-${index}`,
        purpose: "sign-in-method",
        channel: "email",
        destination: "new@example.com",
        codeHash: "hash",
        expiresAt: new Date(NOW.getTime() + 60_000),
        verifiedAt: null,
        attempts: 0,
        userId: "user-1",
        ip: `10.0.0.${index}`,
        createdAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
      });
    }

    const refusal = await useCase
      .execute({ userId: "user-1", email: "new@example.com", ip: "10.0.1.1" })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SignInCodeRateLimitedError);
    expect(refusal).toMatchObject({ reason: "DESTINATION_LIMIT", retryInSeconds: 0 });
  });

  it("does not issue a code for a missing authenticated User", async () => {
    const { useCase, otpRepo } = harness(null);
    await expect(useCase.execute({
      userId: "missing",
      email: "new@example.com",
      ip: "127.0.0.1",
    })).rejects.toThrow("User not found");
    expect(otpRepo.records).toEqual([]);
  });
});
