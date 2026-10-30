import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { OtpRequest, SignInCodePurpose } from "../domain/OtpRequest";
import type { User } from "../domain/User";
import {
  IDENTITY_ERROR_CODES,
  IdentityDomainError,
  type SignInCodeChannel,
} from "../domain/types";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { VerifySignInCode } from "./VerifySignInCode";
import { ConfirmSignInMethodChange } from "./ConfirmSignInMethodChange";

const NOW = new Date("2026-09-24T00:00:00.000Z");
const CODE = "123456";
const REVIEWER_CODE = "654321";

function makeUser(input: {
  id: string;
  phone: string | null;
  email: string | null;
}): User {
  return {
    id: input.id,
    phone: input.phone,
    phoneVerifiedAt: input.phone ? NOW : null,
    email: input.email,
    emailVerifiedAt: input.email ? NOW : null,
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

class FakeOtpRepo implements OtpRequestRepository {
  async reserve(): ReturnType<OtpRequestRepository["reserve"]> { throw new Error("unused"); }

  request: OtpRequest;

  constructor(
    userId = "user-1",
    destination = "new@example.com",
    purpose: SignInCodePurpose = "sign-in-method",
  ) {
    this.request = {
      id: "request-1",
      purpose,
      channel: destination.startsWith("+") ? "phone" : "email",
      destination,
      codeHash: createHash("sha256").update(CODE).digest("hex"),
      expiresAt: new Date(NOW.getTime() + 10 * 60_000),
      verifiedAt: null,
      attempts: 0,
      userId,
      ip: "127.0.0.1",
      createdAt: NOW,
    };
  }

  async findLatestByDestination(
    channel: SignInCodeChannel,
    destination: string,
  ): Promise<OtpRequest | null> {
    return this.request.channel === channel && this.request.destination === destination
      ? this.request
      : null;
  }

  async findLatestForPurpose(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    userId?: string;
  }): Promise<OtpRequest | null> {
    return this.request.purpose === input.purpose &&
      this.request.channel === input.channel &&
      this.request.destination === input.destination &&
      (input.userId === undefined || this.request.userId === input.userId)
      ? this.request
      : null;
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    if (this.request.id !== id || this.request.verifiedAt !== null) return false;
    this.request = { ...this.request, verifiedAt: NOW };
    return true;
  }

  async markVerified(): Promise<OtpRequest> { throw new Error("unused"); }

  async incrementAttempts(): Promise<OtpRequest> {
    this.request = { ...this.request, attempts: this.request.attempts + 1 };
    return this.request;
  }

  async create(): Promise<OtpRequest> { throw new Error("unused"); }
  async findById(): Promise<OtpRequest | null> { return null; }
  async countByDestinationSince(): Promise<number> { return 0; }
  async countByIpSince(): Promise<number> { return 0; }
}

class FakeUsers implements SignInMethodRepository {
  readonly users: User[];
  raceTaken = false;

  constructor(...users: User[]) {
    this.users = users;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.users.find((user) => user.phone === phone) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async replaceSignInMethod(input: {
    userId: string;
    channel: SignInCodeChannel;
    destination: string;
    verifiedAt: Date;
  }): Promise<User> {
    if (this.raceTaken) {
      throw new IdentityDomainError(
        IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN,
        "taken",
      );
    }
    const index = this.users.findIndex((user) => user.id === input.userId);
    const current = this.users[index]!;
    const updated = input.channel === "phone"
      ? { ...current, phone: input.destination, phoneVerifiedAt: input.verifiedAt }
      : { ...current, email: input.destination, emailVerifiedAt: input.verifiedAt };
    this.users[index] = updated;
    return updated;
  }
}

function harness(current: User, destination: string, ...otherUsers: User[]) {
  return harnessFor("sign-in-method", current, destination, ...otherUsers);
}

function harnessFor(
  purpose: SignInCodePurpose,
  current: User,
  destination: string,
  ...otherUsers: User[]
) {
  const otpRepo = new FakeOtpRepo(current.id, destination, purpose);
  const users = new FakeUsers(current, ...otherUsers);
  const clock: ClockPort = { now: () => NOW };
  const verifyCode = new VerifySignInCode(otpRepo, clock);
  const useCase = new ConfirmSignInMethodChange(
    otpRepo,
    users,
    clock,
    verifyCode,
  );
  return { otpRepo, users, useCase };
}

describe("ConfirmSignInMethodChange", () => {
  it.each([
    {
      name: "adds a phone to an email-only User",
      current: makeUser({ id: "user-1", phone: null, email: "old@example.com" }),
      input: { phone: "+99361234567", code: CODE },
      expected: { phone: "+99361234567", email: "old@example.com" },
    },
    {
      name: "adds an email to a phone-only User",
      current: makeUser({ id: "user-1", phone: "+99361234567", email: null }),
      input: { email: "new@example.com", code: CODE },
      expected: { phone: "+99361234567", email: "new@example.com" },
    },
    {
      name: "replaces a phone",
      current: makeUser({ id: "user-1", phone: "+99361234567", email: "old@example.com" }),
      input: { phone: "+99362234567", code: CODE },
      expected: { phone: "+99362234567", email: "old@example.com" },
    },
    {
      name: "replaces an email",
      current: makeUser({ id: "user-1", phone: "+99361234567", email: "old@example.com" }),
      input: { email: "new@example.com", code: CODE },
      expected: { phone: "+99361234567", email: "new@example.com" },
    },
  ])("$name", async ({ current, input, expected }) => {
    const destination = "phone" in input ? input.phone : input.email;
    const { useCase, otpRepo } = harness(current, destination);
    const result = await useCase.execute({ userId: current.id, ...input });
    expect(result).toMatchObject(expected);
    expect(otpRepo.request.verifiedAt).toEqual(NOW);
  });

  it("reveals a taken value only after the correct code and changes neither User", async () => {
    const current = makeUser({ id: "user-1", phone: "+99361234567", email: null });
    const owner = makeUser({ id: "user-2", phone: null, email: "taken@example.com" });
    const { useCase, users, otpRepo } = harness(current, "taken@example.com", owner);

    await expect(useCase.execute({
      userId: current.id,
      email: "taken@example.com",
      code: "000000",
    })).rejects.toThrow("Invalid OTP code");
    expect(users.users).toEqual([current, owner]);
    expect(otpRepo.request.verifiedAt).toBeNull();

    await expect(useCase.execute({
      userId: current.id,
      email: "taken@example.com",
      code: CODE,
    })).rejects.toMatchObject({ code: IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN });
    expect(users.users).toEqual([current, owner]);
    expect(otpRepo.request.verifiedAt).toEqual(NOW);
  });

  it("maps a unique-index race to SIGN_IN_METHOD_TAKEN and consumes the code", async () => {
    const current = makeUser({ id: "user-1", phone: "+99361234567", email: null });
    const { useCase, users, otpRepo } = harness(current, "race@example.com");
    users.raceTaken = true;

    await expect(useCase.execute({
      userId: current.id,
      email: "race@example.com",
      code: CODE,
    })).rejects.toMatchObject({ code: IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN });
    expect(users.users).toEqual([current]);
    expect(otpRepo.request.verifiedAt).toEqual(NOW);
  });

  it("changes the Sign-in Method once when the same code is confirmed concurrently", async () => {
    const current = makeUser({ id: "user-1", phone: "+99361234567", email: null });
    const { useCase, otpRepo } = harness(current, "new@example.com");

    const results = await Promise.allSettled([
      useCase.execute({ userId: current.id, email: "new@example.com", code: CODE }),
      useCase.execute({ userId: current.id, email: "new@example.com", code: CODE }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: new Error("OTP code has already been used"),
    });
    expect(otpRepo.request.verifiedAt).toEqual(NOW);
  });

  it("changes nothing when another flow consumes the code first", async () => {
    const current = makeUser({ id: "user-1", phone: "+99361234567", email: null });
    const { useCase, users, otpRepo } = harness(current, "new@example.com");
    const claim = otpRepo.consumeIfUnused.bind(otpRepo);
    otpRepo.consumeIfUnused = async (id: string) => {
      await claim(id);
      return claim(id);
    };

    await expect(useCase.execute({
      userId: current.id,
      email: "new@example.com",
      code: CODE,
    })).rejects.toThrow("OTP code has already been used");
    expect(users.users).toEqual([current]);
  });

  it.each([
    { purpose: "sign-in", destination: "new@example.com" },
    { purpose: "sign-in", destination: "+99362234567" },
    { purpose: "account-deletion", destination: "new@example.com" },
    { purpose: "account-deletion", destination: "+99362234567" },
    { purpose: "listing-contact-phone", destination: "+99362234567" },
  ] as const)(
    "accepts no $purpose code bound to the same User for $destination (ADR-0081)",
    async ({ purpose, destination }) => {
      const current = makeUser({ id: "user-1", phone: "+99361234567", email: "old@example.com" });
      const { useCase, users, otpRepo } = harnessFor(purpose, current, destination);
      const input = destination.startsWith("+")
        ? { phone: destination, code: CODE }
        : { email: destination, code: CODE };

      await expect(useCase.execute({ userId: current.id, ...input }))
        .rejects.toThrow("No Sign-in Code request found");
      expect(users.users).toEqual([current]);
      expect(otpRepo.request).toMatchObject({ verifiedAt: null, attempts: 0 });
    },
  );

  it("refuses a reviewer's fixed sign-in code (ADR-0030)", async () => {
    // The reviewer adds an email it does not hold yet, so an accepted code would change the User.
    const reviewer = makeUser({ id: "user-1", phone: "+99361234567", email: null });
    const { useCase, users, otpRepo } = harnessFor("sign-in", reviewer, "reviewer@review.auto.tm");
    otpRepo.request = {
      ...otpRepo.request,
      userId: null,
      codeHash: createHash("sha256").update(REVIEWER_CODE).digest("hex"),
    };

    await expect(useCase.execute({
      userId: reviewer.id,
      email: "reviewer@review.auto.tm",
      code: REVIEWER_CODE,
    })).rejects.toThrow("No Sign-in Code request found");
    expect(users.users).toEqual([reviewer]);
    expect(otpRepo.request).toMatchObject({ verifiedAt: null, attempts: 0 });
  });
});
