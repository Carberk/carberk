import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { UserSuspendedError } from "../domain/UserSuspendedError";
import { InMemoryReservedPhoneAttemptLedger } from "./testing/InMemoryReservedPhoneAttemptLedger";
import { InMemoryIdentityCheck } from "./testing/InMemoryIdentityCheck";
import { JwtService } from "@nestjs/jwt";
import type {
  OtpRequest,
  SignInCodeChannel,
  SignInCodePurpose,
} from "../domain/OtpRequest";
import type { SignInMethods } from "../domain/SignInMethods";
import type { GeneratedIdentity } from "../domain/GeneratedIdentity";
import type { RandomSourcePort } from "../domain/ports/RandomSourcePort";
import type { User } from "../domain/User";
import type { Session } from "../domain/Session";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { PasswordHasherPort } from "../domain/ports/PasswordHasherPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type {
  ConstantTimeComparatorPort,
} from "../domain/ports/ConstantTimeComparatorPort";
import type {
  ReviewerOtpBypassConfig,
} from "../domain/ports/ReviewerOtpBypassConfig";
import type { ReservedPhoneAttemptLedger } from "../domain/ports/ReservedPhoneAttemptLedger";
import { VerifyOtp } from "./VerifyOtp";
import { AuthController } from "../presentation/AuthController";
import type { FastifyRequest } from "fastify";
import { VerifySignInCode } from "./VerifySignInCode";
import { parseReviewerOtpBypassConfig } from "../infrastructure/ReviewerOtpBypassConfigFactory";

const NOW = new Date("2026-05-14T12:00:00Z");

function reviewerDemoAccount(index: number): { phone: string; email: string; code: string } {
  return {
    phone: `+99365${String(index).padStart(6, "0")}`,
    email: `reviewer${index}@autotm.bagtyyar.dev`,
    code: String(index).repeat(6),
  };
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function makeOtpRequest(overrides: Partial<OtpRequest> = {}): OtpRequest {
  return {
    id: randomUUID(),
    purpose: "sign-in",
    channel: "phone",
    destination: "+99361234567",
    codeHash: hashCode("123456"),
    expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    verifiedAt: null,
    attempts: 0,
    userId: null,
    ip: "127.0.0.1",
    createdAt: NOW,
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
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
    role: "buyer",
    createdAt: NOW,
    updatedAt: NOW,
    deletionScheduledAt: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: randomUUID(),
    userId: "user-1",
    refreshTokenHash: "hashed-token",
    deviceLabel: null,
    userAgent: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: NOW,
    lastSeenAt: NOW,
    adminTotpExpiresAt: null,
    ...overrides,
  };
}

class FakeOtpRequestRepository implements OtpRequestRepository {
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
      id: randomUUID(),
      ...input,
      verifiedAt: null,
      attempts: 0,
      createdAt: NOW,
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
    const sorted = this.records
      .filter((r) => r.channel === channel && r.destination === destination)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return sorted[0] ?? null;
  }

  async findLatestForPurpose(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    userId?: string;
  }): Promise<OtpRequest | null> {
    const sorted = this.records
      .filter((r) =>
        r.purpose === input.purpose &&
        r.channel === input.channel &&
        r.destination === input.destination &&
        (input.userId === undefined || r.userId === input.userId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return sorted[0] ?? null;
  }

  async countByDestinationSince(): Promise<number> {
    return 0;
  }

  async countByIpSince(): Promise<number> {
    return 0;
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    const record = this.records.find((r) => r.id === id);
    if (!record || record.verifiedAt !== null) return false;
    this.records = this.records.map((r) =>
      r.id === id ? { ...r, verifiedAt: NOW } : r);
    return true;
  }

  async markVerified(id: string, userId: string): Promise<OtpRequest> {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error("Not found");
    const updated: OtpRequest = { ...record, verifiedAt: NOW, userId };
    this.records = this.records.map((r) => (r.id === id ? updated : r));
    return updated;
  }

  async incrementAttempts(id: string): Promise<OtpRequest> {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error("Not found");
    const updated: OtpRequest = { ...record, attempts: record.attempts + 1 };
    this.records = this.records.map((r) => (r.id === id ? updated : r));
    return updated;
  }

  addRecord(r: OtpRequest): void {
    this.records.push(r);
  }
}

class FakeUserRepository implements UserRepository {
  users: User[] = [];

  async findByPhone(phone: string): Promise<User | null> {
    return this.users.find((u) => u.phone === phone) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async create(signInMethods: SignInMethods, identity: GeneratedIdentity): Promise<User> {
    const user: User = {
      id: randomUUID(),
      ...signInMethods,
      displayName: null,
      nameNumber: identity.nameNumber,
      avatarIndex: identity.avatarIndex,
      avatarKey: null,
      avatarUrl: null,
      locale: "ru",
      role: "buyer",
      createdAt: NOW,
      updatedAt: NOW,
      deletionScheduledAt: null,
    };
    this.users.push(user);
    return user;
  }

  async delete(_id: string): Promise<void> {}
  async updateDisplayName(): Promise<void> {}
  async findUsersWithExpiredDeletionGrace(_now: Date): Promise<User[]> { return []; }
  async purgePersonalData(_userId: string): Promise<void> {}
}

class FakeSessionRepository implements SessionRepository {
  sessions: Session[] = [];

  async create(input: {
    userId: string;
    refreshTokenHash: string;
    deviceLabel: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      ...input,
      createdAt: NOW,
      lastSeenAt: NOW,
      adminTotpExpiresAt: null,
    };
    this.sessions.push(session);
    return session;
  }

  async countByUserId(userId: string): Promise<number> {
    return this.sessions.filter((s) => s.userId === userId).length;
  }

  async deleteExpiredByUserId(userId: string): Promise<number> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter(
      (s) => !(s.userId === userId && s.expiresAt < NOW),
    );
    return before - this.sessions.length;
  }

  async deleteOldestByUserId(userId: string): Promise<void> {
    const userSessions = this.sessions
      .filter((s) => s.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (userSessions.length > 0) {
      this.sessions = this.sessions.filter(
        (s) => s.id !== userSessions[0]!.id,
      );
    }
  }

  async findByRefreshToken(_plaintext: string): Promise<import("../domain/ports/SessionRepository").SessionLookupResult | null> {
    return null;
  }

  async rotateRefreshToken(
    id: string,
    oldHash: string,
    newHash: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    if (this.sessions[idx]!.refreshTokenHash !== oldHash) return false;
    this.sessions[idx] = {
      ...this.sessions[idx]!,
      refreshTokenHash: newHash,
      lastSeenAt,
      expiresAt,
    };
    return true;
  }

  async findById(id: string): Promise<Session | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async updateAdminTotpExpiresAt(_id: string, _adminTotpExpiresAt: Date | null): Promise<void> {}

  async delete(id: string): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.id !== id);
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.userId !== userId);
    return before - this.sessions.length;
  }
}

class FakePasswordHasher implements PasswordHasherPort {
  async hash(plaintext: string): Promise<string> {
    return `hashed:${plaintext}`;
  }

  async compare(plaintext: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plaintext}`;
  }
}

class FakeClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class FakeConstantTimeComparator implements ConstantTimeComparatorPort {
  calls: Array<{ candidate: string; expected: string }> = [];

  compare(candidate: string, expected: string): boolean {
    this.calls.push({ candidate, expected });
    return candidate === expected;
  }
}

/** Answers the given values in turn, then repeats the last one. */
class FixedRandomSource implements RandomSourcePort {
  private call = 0;

  constructor(private readonly values: number[]) {}

  next(): number {
    const value = this.values[Math.min(this.call, this.values.length - 1)]!;
    this.call += 1;
    return value;
  }
}

const jwtService = new JwtService({
  secret: "test-secret",
  signOptions: { expiresIn: 15 * 60 },
});

interface MakeUseCaseOpts {
  otpRepo?: OtpRequestRepository;
  userRepo?: UserRepository;
  sessionRepo?: SessionRepository;
  hasher?: PasswordHasherPort;
  clock?: ClockPort;
  eventBus?: { emit: Mock<(event: string, payload: unknown) => void> };
  reviewerBypassConfig?: ReviewerOtpBypassConfig;
  constantTimeComparator?: ConstantTimeComparatorPort;
  random?: RandomSourcePort;
  identityCheck?: InMemoryIdentityCheck;
  reservedPhoneAttempts?: ReservedPhoneAttemptLedger;
}

function makeUseCase(opts: MakeUseCaseOpts = {}) {
  const otpRepo = opts.otpRepo ?? new FakeOtpRequestRepository();
  const userRepo = opts.userRepo ?? new FakeUserRepository();
  const clock = opts.clock ?? new FakeClock();
  return new VerifyOtp(
    otpRepo,
    userRepo,
    opts.sessionRepo ?? new FakeSessionRepository(),
    opts.hasher ?? new FakePasswordHasher(),
    clock,
    jwtService,
    opts.eventBus ?? { emit: vi.fn() },
    opts.reviewerBypassConfig ?? { enabled: false, accounts: [] },
    opts.constantTimeComparator ?? new FakeConstantTimeComparator(),
    new VerifySignInCode(otpRepo, clock),
    opts.random ?? new FixedRandomSource([0.5]),
    opts.identityCheck ?? new InMemoryIdentityCheck(),
    opts.reservedPhoneAttempts ?? new InMemoryReservedPhoneAttemptLedger(clock),
  );
}

// Only verification is exercised; these other controller actions are unused.
function makeAuthController(verifyOtp: VerifyOtp) {
  type Dependencies = ConstructorParameters<typeof AuthController>;
  return new AuthController(
    {} as Dependencies[0], verifyOtp, {} as Dependencies[2],
    {} as Dependencies[3], {} as Dependencies[4],
  );
}
const VERIFY_REQUEST = { headers: {} } as FastifyRequest;

describe("VerifyOtp", () => {
  let otpRepo: FakeOtpRequestRepository;
  let userRepo: FakeUserRepository;
  let sessionRepo: FakeSessionRepository;
  let hasher: FakePasswordHasher;
  let clock: FakeClock;
  let eventBus: { emit: Mock<(event: string, payload: unknown) => void> };
  let constantTimeComparator: FakeConstantTimeComparator;

  beforeEach(() => {
    otpRepo = new FakeOtpRequestRepository();
    userRepo = new FakeUserRepository();
    sessionRepo = new FakeSessionRepository();
    hasher = new FakePasswordHasher();
    clock = new FakeClock();
    eventBus = { emit: vi.fn() };
    constantTimeComparator = new FakeConstantTimeComparator();
    delete process.env["SIGNUPS_ENABLED"];
  });

  it.each(["phone", "email"] as const)("refuses sign-in by %s for a suspended User without issuing a session", async (channel) => {
    const user = makeUser({ email: "buyer@example.com", emailVerifiedAt: NOW });
    userRepo.users.push(user);
    const destination = channel === "phone" ? user.phone! : user.email!;
    otpRepo.addRecord(makeOtpRequest({ channel, destination }));
    const identityCheck = new InMemoryIdentityCheck();
    identityCheck.suspend(user.id);
    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, identityCheck });
    await expect(uc.execute({ [channel]: destination, code: "123456" } as Parameters<VerifyOtp["execute"]>[0])).rejects.toThrow(UserSuspendedError);
    expect(sessionRepo.sessions).toHaveLength(0);
    expect(otpRepo.records[0]?.verifiedAt).toBeNull();
  });

  it("refuses reviewer phone sign-in for a suspended User without issuing a session", async () => {
    const account = reviewerDemoAccount(1);
    const user = makeUser({ phone: account.phone, email: account.email, emailVerifiedAt: NOW });
    userRepo.users.push(user);
    const identityCheck = new InMemoryIdentityCheck();
    identityCheck.suspend(user.id);
    const uc = makeUseCase({ userRepo, sessionRepo, identityCheck, reviewerBypassConfig: { enabled: true, accounts: [account] } });
    await expect(uc.execute({ phone: account.phone, code: account.code })).rejects.toThrow(UserSuspendedError);
    expect(sessionRepo.sessions).toHaveLength(0);
  });

  it.each(["phone", "email"] as const)("keeps a suspended User's %s code usable after unsuspension", async (channel) => {
    const user = makeUser({ email: "buyer@example.com", emailVerifiedAt: NOW });
    userRepo.users.push(user);
    const destination = channel === "phone" ? user.phone! : user.email!;
    otpRepo.addRecord(makeOtpRequest({ channel, destination }));
    const identityCheck = new InMemoryIdentityCheck();
    identityCheck.suspend(user.id);
    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, identityCheck });
    const input = { [channel]: destination, code: "123456" } as Parameters<VerifyOtp["execute"]>[0];
    await expect(uc.execute(input)).rejects.toThrow("User is suspended");
    expect(otpRepo.records[0]?.verifiedAt).toBeNull();
    identityCheck.unsuspend(user.id);
    expect((await uc.execute(input)).user.id).toBe(user.id);
    expect(sessionRepo.sessions).toHaveLength(1);
  });

  // --- Happy path ---

  it("verifies a correct code and returns tokens + user", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
      deviceLabel: "Chrome on Mac",
    });

    expect(result.accessToken).toBeDefined();
    expect(result.accessToken.length).toBeGreaterThan(10);
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken.length).toBeGreaterThan(10);
    expect(result.user.phone).toBe("+99361234567");
    expect(result.user.role).toBe("buyer");

    // OTP is marked verified
    const updatedOtp = await otpRepo.findById(otpRequest.id);
    expect(updatedOtp!.verifiedAt).not.toBeNull();

    // User was created
    expect(userRepo.users).toHaveLength(1);
    expect(userRepo.users[0]!.phone).toBe("+99361234567");

    // Session was created
    expect(sessionRepo.sessions).toHaveLength(1);
    expect(sessionRepo.sessions[0]!.userId).toBe(userRepo.users[0]!.id);

    // Refresh token is hashed, not plaintext
    expect(sessionRepo.sessions[0]!.refreshTokenHash).toMatch(/^hashed:/);
    expect(sessionRepo.sessions[0]!.refreshTokenHash).not.toBe(
      result.refreshToken,
    );
  });

  it("marks the OTP request consumed/verified", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    const record = await otpRepo.findById(otpRequest.id);
    expect(record!.verifiedAt).not.toBeNull();
  });

  it("creates one session when the same code is verified concurrently", async () => {
    otpRepo.addRecord(makeOtpRequest());

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const results = await Promise.allSettled([
      uc.execute({ phone: "+99361234567", code: "123456" }),
      uc.execute({ phone: "+99361234567", code: "123456" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: new Error("OTP code has already been used"),
    });
    expect(sessionRepo.sessions).toHaveLength(1);
  });

  it("does not sign in when another flow consumes the code first", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);
    const claim = otpRepo.consumeIfUnused.bind(otpRepo);
    otpRepo.consumeIfUnused = async (id: string) => {
      await claim(id);
      return claim(id);
    };

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "123456" }),
    ).rejects.toThrow("OTP code has already been used");
    expect(userRepo.users).toHaveLength(0);
    expect(sessionRepo.sessions).toHaveLength(0);
  });

  // --- Expired code ---

  it("fails with expired code", async () => {
    const expiredOtp = makeOtpRequest({
      expiresAt: new Date(NOW.getTime() - 1000), // 1 second ago
    });
    otpRepo.addRecord(expiredOtp);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "123456" }),
    ).rejects.toThrow("OTP code has expired");
  });

  // --- Reused code ---

  it("fails when code is already consumed", async () => {
    const consumedOtp = makeOtpRequest({
      verifiedAt: NOW,
      userId: "user-1",
    });
    otpRepo.addRecord(consumedOtp);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "123456" }),
    ).rejects.toThrow("OTP code has already been used");
  });

  // --- Wrong code ---

  it("fails on wrong code", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "000000" }),
    ).rejects.toThrow("Invalid OTP code");
  });

  it("keeps an ordinary phone code usable after four wrong attempts", async () => {
    const request = makeOtpRequest();
    otpRepo.addRecord(request);
    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo });

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(uc.execute({ phone: request.destination, code: "000000" }))
        .rejects.toThrow("Invalid OTP code");
      expect((await otpRepo.findById(request.id))?.attempts).toBe(attempt);
      expect((await otpRepo.findById(request.id))?.verifiedAt).toBeNull();
      expect(sessionRepo.sessions).toHaveLength(0);
    }
    await expect(uc.execute({ phone: request.destination, code: "123456" }))
      .resolves.toMatchObject({ user: { phone: request.destination } });
    expect(sessionRepo.sessions).toHaveLength(1);
    await expect(uc.execute({ phone: request.destination, code: "123456" }))
      .rejects.toThrow("OTP code has already been used");
  });

  it("refuses even the correct ordinary phone code after five wrong attempts", async () => {
    const request = makeOtpRequest();
    otpRepo.addRecord(request);
    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(uc.execute({ phone: request.destination, code: "000000" }))
        .rejects.toThrow(attempt === 5 ? "Too many attempts" : "Invalid OTP code");
    }
    await expect(uc.execute({ phone: request.destination, code: "123456" }))
      .rejects.toThrow("Too many attempts");
    expect((await otpRepo.findById(request.id))?.attempts).toBe(5);
    expect(sessionRepo.sessions).toHaveLength(0);
  });

  it("refuses an expired ordinary phone code without spending attempts", async () => {
    const request = makeOtpRequest({ expiresAt: new Date(NOW.getTime() - 1) });
    otpRepo.addRecord(request);
    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo });
    for (const code of ["000000", "123456"]) {
      await expect(uc.execute({ phone: request.destination, code }))
        .rejects.toThrow("OTP code has expired");
    }
    expect((await otpRepo.findById(request.id))?.attempts).toBe(0);
    expect(sessionRepo.sessions).toHaveLength(0);
  });

  // --- Too many attempts ---

  it("locks the OTP request on the fifth wrong attempt", async () => {
    const otpRequest = makeOtpRequest({ attempts: 4 });
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "000000" }),
    ).rejects.toThrow("Too many attempts");
  });

  // --- Existing user reuse ---

  it("reuses an existing user when phone matches", async () => {
    const existingUser = makeUser({ phone: "+99361234567" });
    userRepo.users.push(existingUser);

    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    expect(result.user.id).toBe(existingUser.id);
    expect(userRepo.users).toHaveLength(1); // no new user created
  });

  // --- Session hash storage ---

  it("stores bcrypt hash of refresh token, not plaintext", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    const session = sessionRepo.sessions[0]!;
    // Hash is stored, not the token
    expect(session.refreshTokenHash).not.toBe(result.refreshToken);
    // Hash starts with our fake hasher prefix
    expect(session.refreshTokenHash).toMatch(/^hashed:/);
    // The hasher was called with the plaintext token
    expect(await hasher.compare(result.refreshToken, session.refreshTokenHash)).toBe(true);
  });

  // --- 11th session eviction ---

  it("evicts oldest session when user has 10 active sessions", async () => {
    const user = makeUser();
    userRepo.users.push(user);

    // Create 10 existing sessions for the same user
    const oldestCreatedAt = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    for (let i = 0; i < 10; i++) {
      const sess = makeSession({
        userId: user.id,
        createdAt: new Date(oldestCreatedAt.getTime() + i * 60 * 1000),
      });
      sessionRepo.sessions.push(sess);
    }

    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    // Still 10 sessions (oldest evicted, new one added)
    const userSessions = sessionRepo.sessions.filter(
      (s) => s.userId === user.id,
    );
    expect(userSessions).toHaveLength(10);

    // The oldest session (createdAt = oldestCreatedAt) should be gone
    const removedSession = sessionRepo.sessions.find(
      (s) => s.createdAt.getTime() === oldestCreatedAt.getTime(),
    );
    expect(removedSession).toBeUndefined();
  });

  // --- Sign-in Methods (ADR-0054) ---

  it("creates a new User holding only the phone, verified when the code was confirmed", async () => {
    otpRepo.addRecord(makeOtpRequest());

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await uc.execute({ phone: "+99361234567", code: "123456" });

    expect(userRepo.users).toHaveLength(1);
    expect(userRepo.users[0]).toMatchObject({
      phone: "+99361234567",
      phoneVerifiedAt: NOW,
      email: null,
      emailVerifiedAt: null,
    });
  });

  // --- Generated Name and Assigned Avatar (#638) ---

  it("gives a User created by a first phone sign-in the lowest name number and avatar index for the lowest random value", async () => {
    otpRepo.addRecord(makeOtpRequest());

    await makeUseCase({ otpRepo, userRepo, sessionRepo, random: new FixedRandomSource([0, 0]) })
      .execute({ phone: "+99361234567", code: "123456" });

    expect(userRepo.users[0]).toMatchObject({
      nameNumber: 1000,
      avatarIndex: 0,
      displayName: null,
      avatarKey: null,
    });
  });

  it("gives a User created by a first email sign-in the highest name number and avatar index for the highest random value", async () => {
    otpRepo.addRecord(makeOtpRequest({
      channel: "email",
      destination: "new@example.com",
      expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    }));
    const highest = 1 - Number.EPSILON;

    await makeUseCase({
      otpRepo,
      userRepo,
      sessionRepo,
      random: new FixedRandomSource([highest, highest]),
    }).execute({ email: "new@example.com", code: "123456" });

    expect(userRepo.users[0]).toMatchObject({
      nameNumber: 9999,
      avatarIndex: 11,
      displayName: null,
      avatarKey: null,
    });
  });

  it("keeps an existing User's name number and avatar index when they sign in again", async () => {
    userRepo.users.push(makeUser({ nameNumber: 4821, avatarIndex: 7 }));
    otpRepo.addRecord(makeOtpRequest());

    await makeUseCase({ otpRepo, userRepo, sessionRepo, random: new FixedRandomSource([0, 0]) })
      .execute({ phone: "+99361234567", code: "123456" });

    expect(userRepo.users).toHaveLength(1);
    expect(userRepo.users[0]).toMatchObject({ nameNumber: 4821, avatarIndex: 7 });
  });

  // --- UserRegistered event ---

  it("emits UserRegistered only when a new user is created", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    expect(eventBus.emit).toHaveBeenCalledWith(
      "UserRegistered",
      expect.objectContaining({
        userId: expect.any(String),
        phone: "+99361234567",
      }),
    );

    // Second login — no new event
    eventBus.emit.mockClear();
    const otpRequest2 = makeOtpRequest({
      createdAt: new Date(NOW.getTime() + 60_000),
    });
    otpRepo.addRecord(otpRequest2);

    await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  // --- No OTP request for this phone ---

  it("fails when no OTP request exists for this phone", async () => {
    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "123456" }),
    ).rejects.toThrow("No Sign-in Code request found");
  });

  // --- Access token expiry ---

  it("issues an access token with the correct identity claims", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    // We can't decode the JWT here (no secret), but the token is a JWT string
    expect(result.accessToken).toMatch(/^eyJ/); // JWT prefix
    expect(result.accessToken.split(".")).toHaveLength(3);
  });

  it("includes sid claim in access token", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    const payload = JSON.parse(
      Buffer.from(result.accessToken.split(".")[1]!, "base64url").toString("utf-8"),
    );
    expect(payload.sid).toBe(sessionRepo.sessions[0]!.id);
  });

  // --- Device label/server capture ---

  it("captures deviceLabel and userAgent on the session", async () => {
    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await uc.execute({
      phone: "+99361234567",
      code: "123456",
      deviceLabel: "iPhone 15 Pro",
      userAgent: "Mozilla/5.0 ...",
    });

    const session = sessionRepo.sessions[0]!;
    expect(session.deviceLabel).toBe("iPhone 15 Pro");
    expect(session.userAgent).toBe("Mozilla/5.0 ...");
  });

  // --- Account recovery during grace ---

  it("keeps the deletion scheduled and the listings archived when a User in the grace period verifies a code", async () => {
    const scheduledAt = new Date(NOW.getTime() + 15 * 24 * 60 * 60 * 1000);
    const existingUser = makeUser({
      phone: "+99361234567",
      deletionScheduledAt: scheduledAt,
    });
    userRepo.users.push(existingUser);

    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    expect(result.user.id).toBe(existingUser.id);
    expect(result.user.deletionScheduledAt).toBe(scheduledAt.toISOString());
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(sessionRepo.sessions).toHaveLength(1);
    expect(userRepo.users[0]!.deletionScheduledAt).toEqual(scheduledAt);
  });

  // --- Signup kill switch ---

  it("blocks new user creation when SIGNUPS_ENABLED=false", async () => {
    process.env["SIGNUPS_ENABLED"] = "false";

    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    await expect(
      uc.execute({ phone: "+99361234567", code: "123456" }),
    ).rejects.toThrow("Signups are currently disabled");
  });

  it("allows existing user login when SIGNUPS_ENABLED=false", async () => {
    process.env["SIGNUPS_ENABLED"] = "false";

    const existingUser = makeUser({ phone: "+99361234567" });
    userRepo.users.push(existingUser);

    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    expect(result.user.id).toBe(existingUser.id);
  });

  it("lets a grace-period User sign in when SIGNUPS_ENABLED=false without restoring", async () => {
    process.env["SIGNUPS_ENABLED"] = "false";

    const scheduledAt = new Date(NOW.getTime() + 15 * 24 * 60 * 60 * 1000);
    const existingUser = makeUser({
      phone: "+99361234567",
      deletionScheduledAt: scheduledAt,
    });
    userRepo.users.push(existingUser);

    const otpRequest = makeOtpRequest();
    otpRepo.addRecord(otpRequest);

    const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
    const result = await uc.execute({
      phone: "+99361234567",
      code: "123456",
    });

    expect(result.user.id).toBe(existingUser.id);
    expect(result.user.deletionScheduledAt).toBe(scheduledAt.toISOString());
    expect(userRepo.users[0]!.deletionScheduledAt).toEqual(scheduledAt);
  });

  describe("email Sign-in Method", () => {
    const email = "buyer@example.com";

    it("creates an email-only User and returns both nullable methods", async () => {
      otpRepo.addRecord(makeOtpRequest({
        channel: "email",
        destination: email,
        expiresAt: new Date(NOW.getTime() + 10 * 60_000),
      }));

      const result = await makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
      }).execute({ email: " Buyer@Example.COM ", code: "123456" });

      expect(result.user).toMatchObject({ phone: null, email });
      expect(userRepo.users[0]).toMatchObject({
        phone: null,
        phoneVerifiedAt: null,
        email,
        emailVerifiedAt: NOW,
      });
      expect(eventBus.emit).toHaveBeenCalledWith("UserRegistered", {
        userId: userRepo.users[0]!.id,
        phone: null,
        email,
      });
    });

    it("signs in an existing email User in the grace period without restoring while signups are disabled", async () => {
      process.env["SIGNUPS_ENABLED"] = "false";
      const scheduledAt = new Date(NOW.getTime() + 86_400_000);
      const existingUser = makeUser({
        phone: null,
        phoneVerifiedAt: null,
        email,
        emailVerifiedAt: NOW,
        deletionScheduledAt: scheduledAt,
      });
      userRepo.users.push(existingUser);
      otpRepo.addRecord(makeOtpRequest({ channel: "email", destination: email }));

      const result = await makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
      }).execute({ email, code: "123456" });

      expect(result.user.id).toBe(existingUser.id);
      expect(result.user.deletionScheduledAt).toBe(scheduledAt.toISOString());
      expect(userRepo.users[0]!.deletionScheduledAt).toEqual(scheduledAt);
      expect(userRepo.users).toHaveLength(1);
    });

    it("blocks creation of a new email User when signups are disabled", async () => {
      process.env["SIGNUPS_ENABLED"] = "false";
      otpRepo.addRecord(makeOtpRequest({ channel: "email", destination: email }));

      await expect(makeUseCase({ otpRepo, userRepo, sessionRepo }).execute({
        email,
        code: "123456",
      })).rejects.toThrow("Signups are currently disabled");
      expect(userRepo.users).toHaveLength(0);
    });

    it("locks an email code on the fifth wrong attempt", async () => {
      const request = makeOtpRequest({
        channel: "email",
        destination: email,
        attempts: 4,
      });
      otpRepo.addRecord(request);

      await expect(makeUseCase({ otpRepo, userRepo, sessionRepo }).execute({
        email,
        code: "000000",
      })).rejects.toThrow("Too many attempts");
      expect((await otpRepo.findById(request.id))!.attempts).toBe(5);
    });
  });

  describe("purpose binding (ADR-0081)", () => {
    it.each([
      { purpose: "account-deletion", channel: "phone", destination: "+99361234567" },
      { purpose: "account-deletion", channel: "email", destination: "seller@example.com" },
      { purpose: "sign-in-method", channel: "phone", destination: "+99361234567" },
      { purpose: "sign-in-method", channel: "email", destination: "seller@example.com" },
      { purpose: "listing-contact-phone", channel: "phone", destination: "+99361234567" },
    ] as const)(
      "finds no sign-in code for a $channel whose only code is for $purpose",
      async ({ purpose, channel, destination }) => {
        const existing = makeUser(
          channel === "phone"
            ? { phone: destination }
            : { phone: null, phoneVerifiedAt: null, email: destination, emailVerifiedAt: NOW },
        );
        userRepo.users.push(existing);
        const record = makeOtpRequest({ purpose, channel, destination, userId: existing.id });
        otpRepo.addRecord(record);

        const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
        await expect(
          uc.execute(
            channel === "phone"
              ? { phone: destination, code: "123456" }
              : { email: destination, code: "123456" },
          ),
        ).rejects.toThrow("No Sign-in Code request found");

        expect(await otpRepo.findById(record.id)).toMatchObject({
          verifiedAt: null,
          attempts: 0,
        });
        expect(sessionRepo.sessions).toHaveLength(0);
      },
    );

    it("checks the newest sign-in code even when a newer code of another purpose exists", async () => {
      const signIn = makeOtpRequest({ createdAt: new Date(NOW.getTime() - 60_000) });
      const deletion = makeOtpRequest({ purpose: "account-deletion", codeHash: hashCode("999999") });
      otpRepo.addRecord(signIn);
      otpRepo.addRecord(deletion);

      const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, hasher, clock, eventBus });
      await uc.execute({ phone: "+99361234567", code: "123456" });

      expect((await otpRepo.findById(signIn.id))!.verifiedAt).toEqual(NOW);
      expect(await otpRepo.findById(deletion.id)).toMatchObject({
        verifiedAt: null,
        attempts: 0,
      });
    });
  });

  describe("reviewer OTP bypass", () => {
    const account1 = reviewerDemoAccount(1);
    const account2 = reviewerDemoAccount(2);
    const account3 = reviewerDemoAccount(3);
    const reviewerConfig: ReviewerOtpBypassConfig = {
      enabled: true,
      accounts: [
        account1,
        account2,
        account3,
      ],
    };

    it.each(["reviewer", "tester"])("locks a %s phone after five failures without a request, then recovers after 15 minutes", async (kind) => {
      const account = kind === "reviewer" ? account1 : {
        phone: "+99370000001", email: "tester@example.invalid", code: "765432",
      };
      const user = makeUser({ phone: account.phone, role: "buyer" });
      userRepo.users.push(user);
      let now = new Date(NOW);
      const uc = makeUseCase({
        otpRepo, userRepo, sessionRepo, eventBus,
        clock: { now: () => now },
        reviewerBypassConfig: { enabled: true, accounts: [account, account2] },
        constantTimeComparator,
      });
      const controller = makeAuthController(uc);
      const wrong = { phone: account.phone, code: "999999" };
      for (let i = 0; i < 4; i++) {
        await expect(controller.otpVerify(wrong, VERIFY_REQUEST)).rejects.toMatchObject({
          status: 400, response: { code: "INVALID_OTP" },
        });
      }
      // A correct code succeeds and resets the failure budget, so five fresh
      // failures are needed to lock.
      await expect(uc.execute({ phone: account.phone, code: account.code }))
        .resolves.toMatchObject({ user: { id: user.id } });
      await expect(controller.otpVerify(wrong, VERIFY_REQUEST)).rejects.toMatchObject({
        status: 400, response: { code: "INVALID_OTP" },
      });
      for (let i = 0; i < 3; i++) {
        await expect(controller.otpVerify(wrong, VERIFY_REQUEST)).rejects.toMatchObject({
          status: 400, response: { code: "INVALID_OTP" },
        });
      }
      await expect(controller.otpVerify(wrong, VERIFY_REQUEST)).rejects.toMatchObject({
        status: 400, response: { code: "OTP_LOCKED", message: "Too many failed attempts. Wait 15 minutes and try again." },
      });
      const sessionsBeforeLock = sessionRepo.sessions.length;
      const auditBeforeLock = eventBus.emit.mock.calls.length;
      now = new Date(NOW.getTime() + 15 * 60_000 - 1);
      for (const code of [account.code, "999999"]) {
        await expect(controller.otpVerify({ phone: account.phone, code }, VERIFY_REQUEST))
          .rejects.toMatchObject({ status: 400, response: { code: "OTP_LOCKED" } });
      }
      expect(sessionRepo.sessions).toHaveLength(sessionsBeforeLock);
      expect(eventBus.emit.mock.calls).toHaveLength(auditBeforeLock);
      expect(otpRepo.records).toHaveLength(0);
      // A blocked retry does not restart the lock.
      now = new Date(NOW.getTime() + 15 * 60_000);
      await expect(uc.execute({ phone: account.phone, code: account.code }))
        .resolves.toMatchObject({ user: { id: user.id } });
      await expect(controller.otpVerify(wrong, VERIFY_REQUEST)).rejects.toMatchObject({
        response: { code: "INVALID_OTP" },
      });
    });

    it("refuses reserved phone sign-in when the ledger probe fails, without a Session", async () => {
      userRepo.users.push(makeUser({ phone: account1.phone, role: "buyer" }));
      const controller = makeAuthController(makeUseCase({
        otpRepo, userRepo, sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
        reservedPhoneAttempts: {
          recordAttempt: async () => {
            throw new Error("redis connection lost");
          },
        },
      }));
      await expect(controller.otpVerify({ phone: account1.phone, code: account1.code }, VERIFY_REQUEST))
        .rejects.toMatchObject({ status: 400, response: { code: "OTP_LOCKED" } });
      expect(sessionRepo.sessions).toHaveLength(0);
    });

    it("never probes the reserved-phone ledger for an ordinary phone", async () => {
      const ledger: ReservedPhoneAttemptLedger = { recordAttempt: vi.fn(async () => ({ locked: false })) };
      userRepo.users.push(makeUser({ phone: "+99361234567", role: "buyer" }));
      otpRepo.addRecord(makeOtpRequest({ channel: "phone", destination: "+99361234567" }));
      const controller = makeAuthController(makeUseCase({
        otpRepo, userRepo, sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
        reservedPhoneAttempts: ledger,
      }));
      await expect(controller.otpVerify({ phone: "+99361234567", code: "123456" }, VERIFY_REQUEST))
        .resolves.toBeDefined();
      otpRepo.addRecord(makeOtpRequest({ channel: "phone", destination: "+99361234567", createdAt: new Date(NOW.getTime() + 1_000) }));
      await expect(controller.otpVerify({ phone: "+99361234567", code: "000000" }, VERIFY_REQUEST))
        .rejects.toMatchObject({ status: 400, response: { code: "INVALID_OTP" } });
      expect(ledger.recordAttempt).not.toHaveBeenCalled();
    });

    it("starts the full lock at the fifth failure and forgets older failure windows", async () => {
      const user = makeUser({ phone: account1.phone, role: "buyer" });
      userRepo.users.push(user);
      let now = new Date(NOW);
      const uc = makeUseCase({
        otpRepo, userRepo, sessionRepo, clock: { now: () => now },
        reviewerBypassConfig: reviewerConfig, constantTimeComparator,
      });
      const controller = makeAuthController(uc);
      const wrong = { phone: account1.phone, code: "999999" };
      for (let i = 0; i < 4; i++) await expect(controller.otpVerify(wrong, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "INVALID_OTP" } });
      // The four old failures expire before this failure.
      now = new Date(NOW.getTime() + 15 * 60_000);
      for (let i = 0; i < 4; i++) await expect(controller.otpVerify(wrong, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "INVALID_OTP" } });
      now = new Date(NOW.getTime() + 29 * 60_000);
      await expect(controller.otpVerify(wrong, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "OTP_LOCKED" } });
      // Expiry of the original failure window does not end the newer lock.
      now = new Date(NOW.getTime() + 30 * 60_000);
      await expect(controller.otpVerify({ phone: account1.phone, code: account1.code }, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "OTP_LOCKED" } });
      now = new Date(NOW.getTime() + 44 * 60_000);
      await expect(uc.execute({ phone: account1.phone, code: account1.code }))
        .resolves.toMatchObject({ user: { id: user.id } });
    });

    it.each(["reviewer", "tester"])("keeps the existing stored-request limits for %s email", async (kind) => {
      const account = kind === "reviewer" ? account1 : { phone: "+99370000001", email: "tester@example.invalid", code: "765432" };
      userRepo.users.push(makeUser({ phone: account.phone, email: account.email, emailVerifiedAt: NOW }));
      otpRepo.addRecord(makeOtpRequest({ channel: "email", destination: account.email, codeHash: hashCode(account.code), expiresAt: new Date(NOW.getTime() + 10 * 60_000) }));
      const controller = makeAuthController(makeUseCase({
        otpRepo, userRepo, sessionRepo,
        reviewerBypassConfig: { enabled: true, accounts: [account] }, constantTimeComparator,
      }));
      for (let i = 0; i < 4; i++) await expect(controller.otpVerify({ email: account.email, code: "999999" }, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "INVALID_OTP" } });
      await expect(controller.otpVerify({ email: account.email, code: "999999" }, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "OTP_LOCKED" } });
      await expect(controller.otpVerify({ email: account.email, code: account.code }, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "OTP_LOCKED" } });
      expect(sessionRepo.sessions).toHaveLength(0);
    });

    it.each(["absent", "admin", "moderator"])("does not reveal a fixed code at the lock threshold for an %s User", async (role) => {
      if (role !== "absent") userRepo.users.push(makeUser({ phone: account1.phone, role: role as "admin" | "moderator" }));
      const controller = makeAuthController(makeUseCase({
        otpRepo, userRepo, sessionRepo, reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      }));
      for (let i = 0; i < 4; i++) {
        await expect(controller.otpVerify({ phone: account1.phone, code: "999999" }, VERIFY_REQUEST))
          .rejects.toMatchObject({ response: { code: "INVALID_OTP" } });
      }
      await expect(controller.otpVerify({ phone: account1.phone, code: account1.code }, VERIFY_REQUEST))
        .rejects.toMatchObject({ response: { code: "OTP_LOCKED" } });
      expect(sessionRepo.sessions).toHaveLength(0);
    });

    it("requires a rate-limited request before reserved email authentication", async () => {
      const existingUser = makeUser({
        phone: account1.phone,
        email: account1.email,
        emailVerifiedAt: NOW,
        role: "buyer",
      });
      userRepo.users.push(existingUser);
      const useCase = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      await expect(
        useCase.execute({ email: account1.email, code: account1.code }),
      ).rejects.toThrow("No Sign-in Code request found");

      otpRepo.addRecord(makeOtpRequest({
        channel: "email",
        destination: account1.email,
        codeHash: hashCode(account1.code),
        expiresAt: new Date(NOW.getTime() + 10 * 60_000),
      }));
      await expect(
        useCase.execute({ email: account1.email, code: account1.code }),
      ).resolves.toMatchObject({ user: { id: existingUser.id } });
      expect(eventBus.emit).toHaveBeenCalledWith(
        "ReviewerOtpBypassAuthenticated",
        expect.objectContaining({ userId: existingUser.id, role: "buyer" }),
      );
    });

    it("uses the normal safe failure path when the reviewer flag is disabled", async () => {
      const existingUser = makeUser({ phone: account1.phone, role: "buyer" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: { ...reviewerConfig, enabled: false },
        constantTimeComparator,
      });

      await expect(
        uc.execute({ phone: account1.phone, code: account1.code }),
      ).rejects.toThrow("No Sign-in Code request found");
      expect(sessionRepo.sessions).toHaveLength(0);
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        "ReviewerOtpBypassAuthenticated",
        expect.anything(),
      );
    });

    it("uses the normal safe failure path for non-reserved numbers", async () => {
      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      await expect(
        uc.execute({ phone: "+99361234567", code: account1.code }),
      ).rejects.toThrow("No Sign-in Code request found");
    });

    it("reports a wrong reviewer phone code and accepts the fixed code without resending", async () => {
      const existingUser = makeUser({ phone: account1.phone, role: "buyer" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      await expect(
        makeAuthController(uc).otpVerify({ phone: account1.phone, code: "999999" }, VERIFY_REQUEST),
      ).rejects.toMatchObject({
        response: { code: "INVALID_OTP" }, status: 400,
      });
      expect(sessionRepo.sessions).toHaveLength(0);
      expect(otpRepo.records).toHaveLength(0);
      await expect(uc.execute({ phone: account1.phone, code: account1.code }))
        .resolves.toMatchObject({ user: { id: existingUser.id } });
    });

    it("compares reserved phone and fixed code through the constant-time seam", async () => {
      const existingUser = makeUser({ phone: account2.phone, role: "seller" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      await uc.execute({ phone: account2.phone, code: account2.code });

      expect(constantTimeComparator.calls).toEqual(
        expect.arrayContaining([
          { candidate: account2.phone, expected: account1.phone },
          { candidate: account2.phone, expected: account2.phone },
          { candidate: account2.code, expected: account2.code },
        ]),
      );
    });

    it("authenticates an existing buyer without an OTP request or rate-limit issuance dependency and emits audit evidence without the code", async () => {
      const existingUser = makeUser({ phone: account1.phone, role: "buyer" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      const result = await uc.execute({
        phone: account1.phone,
        code: account1.code,
        deviceLabel: "Reviewer iPhone",
      });

      expect(result.user.id).toBe(existingUser.id);
      expect(result.user.role).toBe("buyer");
      expect(otpRepo.records).toHaveLength(0);
      expect(sessionRepo.sessions).toHaveLength(1);
      expect(eventBus.emit).toHaveBeenCalledWith(
        "ReviewerOtpBypassAuthenticated",
        expect.objectContaining({
          userId: existingUser.id,
          role: "buyer",
          occurredAt: NOW.toISOString(),
        }),
      );
      expect(JSON.stringify(eventBus.emit.mock.calls)).not.toContain(account1.code);
    });

    it("authenticates an existing seller through the reviewer bypass", async () => {
      const existingUser = makeUser({ phone: account3.phone, role: "seller" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      const result = await uc.execute({ phone: account3.phone, code: account3.code });

      expect(result.user.id).toBe(existingUser.id);
      expect(result.user.role).toBe("seller");
      expect(userRepo.users).toHaveLength(1);
    });

    it("keeps a reviewer account's scheduled deletion and listings archived", async () => {
      const scheduledAt = new Date(NOW.getTime() + 15 * 24 * 60 * 60 * 1000);
      const existingUser = makeUser({
        phone: account3.phone,
        role: "seller",
        deletionScheduledAt: scheduledAt,
      });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      const result = await uc.execute({ phone: account3.phone, code: account3.code });

      expect(result.user.id).toBe(existingUser.id);
      expect(result.user.deletionScheduledAt).toBe(scheduledAt.toISOString());
      expect(sessionRepo.sessions).toHaveLength(1);
      expect(userRepo.users[0]!.deletionScheduledAt).toEqual(scheduledAt);
    });

    it("does not create a missing reserved user", async () => {
      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      for (const code of ["000000", account1.code]) {
        await expect(
          makeAuthController(uc).otpVerify({ phone: account1.phone, code }, VERIFY_REQUEST),
        ).rejects.toMatchObject({
          response: { code: "INVALID_OTP" }, status: 400,
        });
      }
      expect(userRepo.users).toHaveLength(0);
      expect(sessionRepo.sessions).toHaveLength(0);
    });

    it("does not authenticate or elevate an admin through the reviewer bypass", async () => {
      const adminUser = makeUser({ phone: account1.phone, role: "admin" });
      userRepo.users.push(adminUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      for (const code of ["000000", account1.code]) {
        await expect(
          makeAuthController(uc).otpVerify({ phone: account1.phone, code }, VERIFY_REQUEST),
        ).rejects.toMatchObject({
          response: { code: "INVALID_OTP" }, status: 400,
        });
      }
      expect(sessionRepo.sessions).toHaveLength(0);
    });

    it("does not authenticate moderators through the reviewer bypass", async () => {
      const moderatorUser = makeUser({ phone: account1.phone, role: "moderator" });
      userRepo.users.push(moderatorUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        reviewerBypassConfig: reviewerConfig,
        constantTimeComparator,
      });

      for (const code of ["000000", account1.code]) {
        await expect(
          makeAuthController(uc).otpVerify({ phone: account1.phone, code }, VERIFY_REQUEST),
        ).rejects.toMatchObject({
          response: { code: "INVALID_OTP" }, status: 400,
        });
      }
      expect(sessionRepo.sessions).toHaveLength(0);
    });
  });

  describe("tester OTP bypass (ADR-0086)", () => {
    const tester = { phone: "+99370000001", email: "tester1@example.com", code: "765432" };
    const reviewer = reviewerDemoAccount(1);
    const testerConfig = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: false,
      REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([reviewer]),
      TESTER_ACCOUNTS_JSON: JSON.stringify([tester]),
    });

    it("signs in a tester with its fixed code while the reviewer flag is off", async () => {
      const existingUser = makeUser({ phone: tester.phone, role: "buyer" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: testerConfig,
        constantTimeComparator,
      });

      const result = await uc.execute({ phone: tester.phone, code: tester.code });

      expect(result.user.id).toBe(existingUser.id);
      expect(otpRepo.records).toHaveLength(0);
      expect(sessionRepo.sessions).toHaveLength(1);
      expect(eventBus.emit).toHaveBeenCalledWith(
        "ReviewerOtpBypassAuthenticated",
        expect.objectContaining({
          userId: existingUser.id,
          role: "buyer",
          occurredAt: NOW.toISOString(),
        }),
      );
    });

    it("signs in a tester by email after an issued fixed-code request and preserves pending deletion", async () => {
      const scheduledAt = new Date("2026-06-01T00:00:00.000Z");
      const existingUser = makeUser({ phone: tester.phone, email: tester.email, emailVerifiedAt: NOW, role: "seller", deletionScheduledAt: scheduledAt });
      userRepo.users.push(existingUser);
      otpRepo.addRecord(makeOtpRequest({ channel: "email", destination: tester.email, codeHash: hashCode(tester.code), expiresAt: new Date(NOW.getTime() + 10 * 60_000) }));
      const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, eventBus, reviewerBypassConfig: testerConfig, constantTimeComparator });
      await expect(uc.execute({ email: tester.email, code: "000000" })).rejects.toThrow();
      const result = await uc.execute({ email: tester.email, code: tester.code });
      expect(result.user).toMatchObject({ id: existingUser.id, deletionScheduledAt: scheduledAt.toISOString() });
      expect(sessionRepo.sessions).toHaveLength(1);
      expect(eventBus.emit).toHaveBeenCalledWith("ReviewerOtpBypassAuthenticated", expect.objectContaining({ userId: existingUser.id, role: "seller" }));
    });

    for (const channel of ["phone", "email"] as const) {
      for (const role of ["admin", "moderator", "absent"] as const) {
        it(`refuses tester ${channel} authentication for ${role} Users`, async () => {
          if (role !== "absent") userRepo.users.push(makeUser({ phone: tester.phone, email: tester.email, role }));
          if (channel === "email") otpRepo.addRecord(makeOtpRequest({ channel, destination: tester.email, codeHash: hashCode(tester.code), expiresAt: new Date(NOW.getTime() + 10 * 60_000) }));
          const uc = makeUseCase({ otpRepo, userRepo, sessionRepo, eventBus, reviewerBypassConfig: testerConfig, constantTimeComparator });
          if (channel === "phone") {
            for (const code of ["000000", tester.code]) {
              await expect(
                makeAuthController(uc).otpVerify({ phone: tester.phone, code }, VERIFY_REQUEST),
              ).rejects.toMatchObject({
                response: { code: "INVALID_OTP" }, status: 400,
              });
            }
          } else {
            await expect(uc.execute({ email: tester.email, code: tester.code })).rejects.toThrow();
          }
          expect(sessionRepo.sessions).toHaveLength(0);
          expect(eventBus.emit).not.toHaveBeenCalledWith("ReviewerOtpBypassAuthenticated", expect.anything());
        });
      }
    }

    it("reports a wrong tester phone code and accepts the fixed code without resending", async () => {
      const existingUser = makeUser({ phone: tester.phone, role: "buyer" });
      userRepo.users.push(existingUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: testerConfig,
        constantTimeComparator,
      });

      await expect(
        makeAuthController(uc).otpVerify({ phone: tester.phone, code: "000000" }, VERIFY_REQUEST),
      ).rejects.toMatchObject({
        response: { code: "INVALID_OTP" }, status: 400,
      });
      expect(sessionRepo.sessions).toHaveLength(0);
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        "ReviewerOtpBypassAuthenticated",
        expect.anything(),
      );
      expect(otpRepo.records).toHaveLength(0);
      await expect(uc.execute({ phone: tester.phone, code: tester.code }))
        .resolves.toMatchObject({ user: { id: existingUser.id } });
    });

    it("still refuses a reviewer entry while the reviewer flag is off", async () => {
      const reviewerUser = makeUser({ phone: reviewer.phone, role: "buyer" });
      userRepo.users.push(reviewerUser);

      const uc = makeUseCase({
        otpRepo,
        userRepo,
        sessionRepo,
        eventBus,
        reviewerBypassConfig: testerConfig,
        constantTimeComparator,
      });

      await expect(
        uc.execute({ phone: reviewer.phone, code: reviewer.code }),
      ).rejects.toThrow("No Sign-in Code request found");
      expect(sessionRepo.sessions).toHaveLength(0);
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        "ReviewerOtpBypassAuthenticated",
        expect.anything(),
      );
    });
  });
});
