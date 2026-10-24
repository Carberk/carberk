import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { OtpRequest, SignInCodePurpose } from "../domain/OtpRequest";
import type { SignInMethods } from "../domain/SignInMethods";
import type { User } from "../domain/User";
import type { SignInCodeChannel } from "../domain/types";
import type {
  AccountDeletionUnitOfWork,
  AccountDeletionWrites,
} from "../domain/ports/AccountDeletionUnitOfWork";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import type { UserRepository } from "../domain/ports/UserRepository";
import { ConfirmAccountDeletion } from "./ConfirmAccountDeletion";
import { DeleteMe } from "./DeleteMe";
import { VerifySignInCode } from "./VerifySignInCode";

const NOW = new Date("2026-09-25T00:00:00.000Z");
const GRACE_END = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const CODE = "123456";
const REVIEWER_CODE = "654321";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    phone: "+99361234567",
    phoneVerifiedAt: NOW,
    email: null,
    emailVerifiedAt: null,
    displayName: null,
    nameNumber: 4821,
    avatarIndex: 7,
    avatarKey: null,
    avatarUrl: null,
    locale: "ru",
    role: "seller",
    createdAt: NOW,
    updatedAt: NOW,
    deletionScheduledAt: null,
    ...overrides,
  };
}

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

class FakeOtpRepo implements OtpRequestRepository {
  async reserve(): ReturnType<OtpRequestRepository["reserve"]> { throw new Error("unused"); }

  records: OtpRequest[] = [];
  consumed: string[] = [];

  add(input: {
    destination: string;
    userId: string | null;
    code?: string;
    expiresAt?: Date;
    purpose?: SignInCodePurpose;
  }): OtpRequest {
    const record: OtpRequest = {
      id: `request-${this.records.length + 1}`,
      purpose: input.purpose ?? "account-deletion",
      channel: input.destination.startsWith("+") ? "phone" : "email",
      destination: input.destination,
      codeHash: hash(input.code ?? CODE),
      expiresAt: input.expiresAt ?? new Date(NOW.getTime() + 5 * 60_000),
      verifiedAt: null,
      attempts: 0,
      userId: input.userId,
      ip: "10.0.0.1",
      createdAt: NOW,
    };
    this.records.push(record);
    return record;
  }

  async findLatestByDestination(
    channel: SignInCodeChannel,
    destination: string,
  ): Promise<OtpRequest | null> {
    return this.records.findLast(
      (record) => record.channel === channel && record.destination === destination,
    ) ?? null;
  }

  async findLatestForPurpose(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    userId?: string;
  }): Promise<OtpRequest | null> {
    return this.records.findLast(
      (record) =>
        record.purpose === input.purpose &&
        record.channel === input.channel &&
        record.destination === input.destination &&
        (input.userId === undefined || record.userId === input.userId),
    ) ?? null;
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record || record.verifiedAt !== null) return false;
    this.update(id, (current) => ({ ...current, verifiedAt: NOW }));
    this.consumed.push(id);
    return true;
  }

  async incrementAttempts(id: string): Promise<OtpRequest> {
    return this.update(id, (record) => ({ ...record, attempts: record.attempts + 1 }));
  }

  async markVerified(): Promise<OtpRequest> { throw new Error("unused"); }
  async create(): Promise<OtpRequest> { throw new Error("unused"); }
  async findById(): Promise<OtpRequest | null> { return null; }
  async countByDestinationSince(): Promise<number> { return 0; }
  async countByIpSince(): Promise<number> { return 0; }

  private update(id: string, change: (record: OtpRequest) => OtpRequest): OtpRequest {
    const index = this.records.findIndex((record) => record.id === id);
    const updated = change(this.records[index] as OtpRequest);
    this.records[index] = updated;
    return updated;
  }
}

class FakeUsers implements UserRepository, SignInMethodRepository {
  scheduled = new Map<string, Date>();

  constructor(private readonly users: User[] = []) {}

  async findByPhone(phone: string): Promise<User | null> {
    return this.users.find((user) => user.phone === phone) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async updateDisplayName(): Promise<void> {}

  async create(_methods: SignInMethods): Promise<User> { throw new Error("unused"); }
  async delete(): Promise<void> { throw new Error("unused"); }
  async findUsersWithExpiredDeletionGrace(): Promise<User[]> { return []; }
  async purgePersonalData(): Promise<void> { throw new Error("unused"); }
  async replaceSignInMethod(): Promise<User> { throw new Error("unused"); }
}

class FakeSessions implements Pick<SessionRepository, "deleteAllByUserId"> {
  revokedFor: string[] = [];
  failNext = false;

  async deleteAllByUserId(userId: string): Promise<number> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("database unavailable");
    }
    this.revokedFor.push(userId);
    return 2;
  }
}

/** Records the deletion writes; the transaction itself is covered by `DeleteMe.spec.ts`. */
class FakeDeletionUnitOfWork implements AccountDeletionUnitOfWork {
  archivedFor: string[] = [];

  constructor(private readonly users: FakeUsers) {}

  async run<T>(command: { readonly userId: string; readonly deletionScheduledAt: Date }, work: (writes: AccountDeletionWrites) => Promise<T>): Promise<T> {
    const before = new Map(this.users.scheduled), archivedBefore = [...this.archivedFor];
    let scheduled = false, archived = false;
    try {
      const result = await work({
        scheduleDeletion: async (userId, deletionScheduledAt) => {
          if (userId !== command.userId || deletionScheduledAt.getTime() !== command.deletionScheduledAt.getTime() || scheduled || archived) throw new Error("account_deletion_target");
          this.users.scheduled.set(userId, deletionScheduledAt);
          scheduled = true;
        },
        archiveActiveListings: async (sellerId) => {
          if (sellerId !== command.userId || !scheduled || archived) throw new Error("account_deletion_target");
          this.archivedFor.push(sellerId);
          archived = true;
        },
      });
      if (!scheduled || !archived) throw new Error("account_deletion_incomplete");
      return result;
    } catch (error) {
      this.users.scheduled = before;
      this.archivedFor = archivedBefore;
      throw error;
    }
  }
}

function setup(users: User[] = []) {
  const otpRepo = new FakeOtpRepo();
  const userRepo = new FakeUsers(users);
  const sessions = new FakeSessions();
  const listings = new FakeDeletionUnitOfWork(userRepo);
  const clock: ClockPort = { now: () => NOW };
  const deleteMe = new DeleteMe(
    userRepo,
    sessions as unknown as SessionRepository,
    listings,
    clock,
  );
  const useCase = new ConfirmAccountDeletion(
    otpRepo,
    userRepo,
    new VerifySignInCode(otpRepo, clock),
    deleteMe,
  );
  return { useCase, otpRepo, userRepo, sessions, listings };
}

describe("ConfirmAccountDeletion", () => {
  it("starts the same grace period as DELETE /me for the phone holder", async () => {
    const { useCase, otpRepo, userRepo, sessions, listings } = setup([makeUser()]);
    otpRepo.add({ destination: "+99361234567", userId: "user-1" });

    await expect(
      useCase.execute({ phone: "+99361234567", code: CODE }),
    ).resolves.toBeUndefined();

    expect(userRepo.scheduled.get("user-1")).toEqual(GRACE_END);
    expect(sessions.revokedFor).toEqual(["user-1"]);
    expect(listings.archivedFor).toEqual(["user-1"]);
    expect(otpRepo.consumed).toEqual(["request-1"]);
  });

  it("starts the grace period for the holder of a normalized email", async () => {
    const { useCase, otpRepo, userRepo } = setup([
      makeUser({ phone: null, phoneVerifiedAt: null, email: "seller@example.com", emailVerifiedAt: NOW }),
    ]);
    otpRepo.add({ destination: "seller@example.com", userId: "user-1" });

    await useCase.execute({ email: " Seller@Example.COM ", code: CODE });

    expect(userRepo.scheduled.get("user-1")).toEqual(GRACE_END);
  });

  it("consumes the code for an unheld value and changes nothing else", async () => {
    const { useCase, otpRepo, userRepo, sessions, listings } = setup();
    otpRepo.add({ destination: "nobody@example.com", userId: null });

    await expect(
      useCase.execute({ email: "nobody@example.com", code: CODE }),
    ).resolves.toBeUndefined();

    expect(userRepo.scheduled.size).toBe(0);
    expect(sessions.revokedFor).toEqual([]);
    expect(listings.archivedFor).toEqual([]);
    expect(otpRepo.consumed).toEqual(["request-1"]);
    await expect(
      useCase.execute({ email: "nobody@example.com", code: CODE }),
    ).rejects.toThrow("OTP code has already been used");
  });

  it("treats a wrong code the same way whether or not a User holds the value", async () => {
    const held = setup([makeUser()]);
    held.otpRepo.add({ destination: "+99361234567", userId: null });
    const unheld = setup();
    unheld.otpRepo.add({ destination: "+99361234567", userId: null });

    await expect(
      held.useCase.execute({ phone: "+99361234567", code: "000000" }),
    ).rejects.toThrow("Invalid OTP code");
    await expect(
      unheld.useCase.execute({ phone: "+99361234567", code: "000000" }),
    ).rejects.toThrow("Invalid OTP code");
    expect(held.otpRepo.records[0]?.attempts).toBe(1);
    expect(unheld.otpRepo.records[0]?.attempts).toBe(1);
    expect(held.userRepo.scheduled.size).toBe(0);
  });

  it("locks the code after the fifth wrong attempt", async () => {
    const { useCase, otpRepo, userRepo } = setup([makeUser()]);
    otpRepo.add({ destination: "+99361234567", userId: "user-1" });

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(
        useCase.execute({ phone: "+99361234567", code: "000000" }),
      ).rejects.toThrow("Invalid OTP code");
    }
    await expect(
      useCase.execute({ phone: "+99361234567", code: "000000" }),
    ).rejects.toThrow("Too many attempts");
    await expect(
      useCase.execute({ phone: "+99361234567", code: CODE }),
    ).rejects.toThrow("Too many attempts");
    expect(userRepo.scheduled.size).toBe(0);
  });

  it("rejects an expired code", async () => {
    const { useCase, otpRepo, userRepo } = setup([makeUser()]);
    otpRepo.add({
      destination: "+99361234567",
      userId: "user-1",
      expiresAt: new Date(NOW.getTime() - 1),
    });

    await expect(
      useCase.execute({ phone: "+99361234567", code: CODE }),
    ).rejects.toThrow("OTP code has expired");
    expect(userRepo.scheduled.size).toBe(0);
  });

  it("refuses a code issued while another User held the value", async () => {
    const { useCase, otpRepo, userRepo } = setup([makeUser({ id: "user-2" })]);
    otpRepo.add({ destination: "+99361234567", userId: "user-1" });

    await expect(
      useCase.execute({ phone: "+99361234567", code: CODE }),
    ).rejects.toThrow("Invalid OTP code");
    expect(userRepo.scheduled.size).toBe(0);
  });

  it("runs the deletion once when the same code is confirmed concurrently", async () => {
    const { useCase, otpRepo, sessions } = setup([makeUser()]);
    otpRepo.add({ destination: "+99361234567", userId: "user-1" });

    const results = await Promise.allSettled([
      useCase.execute({ phone: "+99361234567", code: CODE }),
      useCase.execute({ phone: "+99361234567", code: CODE }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: new Error("OTP code has already been used"),
    });
    expect(sessions.revokedFor).toEqual(["user-1"]);
  });

  it("completes every DELETE /me effect when a new code is confirmed after a failed revocation", async () => {
    const { useCase, otpRepo, userRepo, sessions, listings } = setup([makeUser()]);
    otpRepo.add({ destination: "+99361234567", userId: "user-1" });
    sessions.failNext = true;

    await expect(
      useCase.execute({ phone: "+99361234567", code: CODE }),
    ).rejects.toThrow("database unavailable");
    expect(userRepo.scheduled.size).toBe(0);
    expect(listings.archivedFor).toEqual([]);

    otpRepo.add({ destination: "+99361234567", userId: "user-1", code: "222222" });
    await useCase.execute({ phone: "+99361234567", code: "222222" });

    expect(userRepo.scheduled.get("user-1")).toEqual(GRACE_END);
    expect(sessions.revokedFor).toEqual(["user-1"]);
    expect(listings.archivedFor).toEqual(["user-1"]);
  });

  describe("purpose binding (ADR-0081)", () => {
    it.each([
      { purpose: "sign-in", destination: "+99361234567" },
      { purpose: "sign-in", destination: "seller@example.com" },
      { purpose: "sign-in-method", destination: "+99361234567" },
      { purpose: "sign-in-method", destination: "seller@example.com" },
      { purpose: "listing-contact-phone", destination: "+99361234567" },
    ] as const)(
      "accepts no $purpose code bound to the holder of $destination",
      async ({ purpose, destination }) => {
        const { useCase, otpRepo, userRepo, sessions } = setup([
          makeUser({ email: "seller@example.com", emailVerifiedAt: NOW }),
        ]);
        otpRepo.add({ destination, userId: "user-1", purpose });
        const input = destination.startsWith("+")
          ? { phone: destination, code: CODE }
          : { email: destination, code: CODE };

        await expect(useCase.execute(input)).rejects.toThrow("No Sign-in Code request found");
        expect(userRepo.scheduled.size).toBe(0);
        expect(sessions.revokedFor).toEqual([]);
        expect(otpRepo.records[0]).toMatchObject({ verifiedAt: null, attempts: 0 });
      },
    );

    it("refuses a reviewer's fixed sign-in code (ADR-0030)", async () => {
      const reviewer = makeUser({
        phone: null,
        phoneVerifiedAt: null,
        email: "reviewer@review.auto.tm",
        emailVerifiedAt: NOW,
      });
      const { useCase, otpRepo, userRepo } = setup([reviewer]);
      otpRepo.add({
        destination: "reviewer@review.auto.tm",
        userId: null,
        code: REVIEWER_CODE,
        purpose: "sign-in",
      });

      await expect(
        useCase.execute({ email: "reviewer@review.auto.tm", code: REVIEWER_CODE }),
      ).rejects.toThrow("No Sign-in Code request found");
      expect(userRepo.scheduled.size).toBe(0);
      expect(otpRepo.consumed).toEqual([]);
    });

    it("checks the newest deletion code even when a newer sign-in code exists", async () => {
      const { useCase, otpRepo, userRepo } = setup([makeUser()]);
      otpRepo.add({ destination: "+99361234567", userId: "user-1" });
      otpRepo.add({
        destination: "+99361234567",
        userId: "user-1",
        code: "999999",
        purpose: "sign-in",
      });

      await useCase.execute({ phone: "+99361234567", code: CODE });

      expect(userRepo.scheduled.get("user-1")).toEqual(GRACE_END);
      expect(otpRepo.consumed).toEqual(["request-1"]);
      expect(otpRepo.records[1]).toMatchObject({ verifiedAt: null, attempts: 0 });
    });
  });
});
