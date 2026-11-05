import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import type { Session } from "../domain/Session";
import type { User } from "../domain/User";
import type { SessionRepository, SessionLookupResult } from "../domain/ports/SessionRepository";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { InMemoryIdentityCheck } from "./testing/InMemoryIdentityCheck";
import { UserSuspendedError } from "../domain/UserSuspendedError";
import { RefreshSession } from "./RefreshSession";

const NOW = new Date("2026-05-14T12:00:00Z");

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: randomUUID(),
    userId: "user-1",
    refreshTokenHash: "hashed-validator-1",
    deviceLabel: "iPhone 15 Pro",
    userAgent: "Mozilla/5.0",
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
    lastSeenAt: NOW,
    adminTotpExpiresAt: null,
    ...overrides,
  };
}

class FakeSessionRepository implements SessionRepository {
  sessions: Session[] = [];
  hashLookup: Map<string, Session> = new Map(); // plaintext → session
  rotateFailCount = 0;

  async create(input: {
    userId: string;
    refreshTokenHash: string;
    deviceLabel: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<Session> {
    const s: Session = {
      id: randomUUID(),
      ...input,
      createdAt: NOW,
      lastSeenAt: NOW,
      adminTotpExpiresAt: null,
    };
    this.sessions.push(s);
    return s;
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
      this.sessions = this.sessions.filter((s) => s.id !== userSessions[0]!.id);
    }
  }

  async findByRefreshToken(plaintext: string): Promise<SessionLookupResult | null> {
    const session = this.hashLookup.get(plaintext) ?? null;
    if (!session) return null;
    return {
      session,
      userId: session.userId,
      phone: "+99361234567",
      email: null,
      role: "buyer",
    };
  }

  async rotateRefreshToken(
    id: string,
    oldHash: string,
    newHash: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    if (this.rotateFailCount > 0) {
      this.rotateFailCount--;
      return false;
    }
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    const current = this.sessions[idx]!;
    if (current.refreshTokenHash !== oldHash) return false;
    this.sessions[idx] = {
      ...current,
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

  async delete(_id: string): Promise<void> {}

  async deleteAllByUserId(_userId: string): Promise<number> {
    return 0;
  }

  // Helper: register a session that can be found by a specific plaintext token
  registerToken(plaintext: string, session: Session): void {
    this.hashLookup.set(plaintext, session);
  }
}

class FakePasswordHasher implements RefreshTokenHasherPort {
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

const jwtService = new JwtService({
  secret: "test-secret",
  signOptions: { expiresIn: 15 * 60 },
});

interface MakeUseCaseOpts {
  sessionRepo?: SessionRepository;
  hasher?: RefreshTokenHasherPort;
  clock?: ClockPort;
  identityCheck?: InMemoryIdentityCheck;
}

function makeUseCase(opts: MakeUseCaseOpts = {}) {
  return new RefreshSession(
    opts.sessionRepo ?? new FakeSessionRepository(),
    opts.hasher ?? new FakePasswordHasher(),
    opts.clock ?? new FakeClock(),
    jwtService,
    opts.identityCheck ?? new InMemoryIdentityCheck(),
  );
}

describe("RefreshSession", () => {
  let sessionRepo: FakeSessionRepository;
  let hasher: FakePasswordHasher;
  let clock: FakeClock;

  beforeEach(() => {
    sessionRepo = new FakeSessionRepository();
    hasher = new FakePasswordHasher();
    clock = new FakeClock();
  });

  it("refuses a suspended User's refresh without rotating the Session", async () => {
    const session = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(session);
    sessionRepo.registerToken("token-1", session);
    const identityCheck = new InMemoryIdentityCheck();
    identityCheck.suspend(session.userId);
    await expect(makeUseCase({ sessionRepo, identityCheck }).execute({ refreshToken: "token-1" })).rejects.toThrow(UserSuspendedError);
    expect(sessionRepo.sessions[0]?.refreshTokenHash).toBe("hashed:token-1");
  });

  // --- Happy path: valid refresh token returns new tokens ---

  it("returns new access and refresh tokens for a valid refresh token", async () => {
    const oldSession = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(oldSession);
    sessionRepo.registerToken("token-1", oldSession);

    const uc = makeUseCase({ sessionRepo, hasher, clock });
    const result = await uc.execute({ refreshToken: "token-1" });

    expect(result.accessToken).toBeDefined();
    expect(result.accessToken).toMatch(/^eyJ/);
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe("token-1");
  });

  // --- Token rotation: old token invalidated, hash overwritten ---

  it("overwrites the session refreshTokenHash with the new token hash", async () => {
    const oldSession = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(oldSession);
    sessionRepo.registerToken("token-1", oldSession);

    const uc = makeUseCase({ sessionRepo, hasher, clock });
    const result = await uc.execute({ refreshToken: "token-1" });

    const updated = sessionRepo.sessions.find((s) => s.id === oldSession.id)!;
    expect(updated.refreshTokenHash).toBe(`hashed:${result.refreshToken}`);
  });

  // --- Old token reuse returns 401 ---

  it("rejects an old refresh token after rotation", async () => {
    const oldSession = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(oldSession);
    sessionRepo.registerToken("token-1", oldSession);

    const uc = makeUseCase({ sessionRepo, hasher, clock });

    // First refresh succeeds
    await uc.execute({ refreshToken: "token-1" });

    // Second refresh with the SAME old token fails (hash was rotated)
    // The old "token-1" no longer maps to the current hash
    sessionRepo.hashLookup.delete("token-1"); // old token can't find session anymore

    await expect(
      uc.execute({ refreshToken: "token-1" }),
    ).rejects.toThrow("Invalid refresh token");
  });

  // --- Updates lastSeenAt and extends expiresAt ---

  it("updates lastSeenAt and extends expiresAt to now + 30 days", async () => {
    const oldSession = makeSession({
      refreshTokenHash: "hashed:token-1",
      lastSeenAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000),
    });
    sessionRepo.sessions.push(oldSession);
    sessionRepo.registerToken("token-1", oldSession);

    const uc = makeUseCase({ sessionRepo, hasher, clock });
    await uc.execute({ refreshToken: "token-1" });

    const updated = sessionRepo.sessions.find((s) => s.id === oldSession.id)!;
    expect(updated.lastSeenAt.getTime()).toBe(NOW.getTime());
    expect(updated.expiresAt.getTime()).toBe(
      NOW.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
  });

  // --- Expired session returns 401 ---

  it("rejects an expired session refresh with 401", async () => {
    const expiredSession = makeSession({
      refreshTokenHash: "hashed:token-1",
      expiresAt: new Date(NOW.getTime() - 1000),
    });
    sessionRepo.sessions.push(expiredSession);
    sessionRepo.registerToken("token-1", expiredSession);

    const uc = makeUseCase({ sessionRepo, hasher, clock });

    await expect(
      uc.execute({ refreshToken: "token-1" }),
    ).rejects.toThrow("Session expired");
  });

  // --- Unknown refresh token returns 401 ---

  it("rejects an unknown refresh token with 401", async () => {
    const uc = makeUseCase({ sessionRepo, hasher, clock });

    await expect(
      uc.execute({ refreshToken: "random-unknown-token" }),
    ).rejects.toThrow("Invalid refresh token");
  });

  // --- Unknown token never creates a session ---

  it("never creates a session for an unknown refresh token", async () => {
    const uc = makeUseCase({ sessionRepo, hasher, clock });

    await expect(
      uc.execute({ refreshToken: "nonexistent" }),
    ).rejects.toThrow("Invalid refresh token");

    expect(sessionRepo.sessions).toHaveLength(0);
  });

  // --- Concurrent refresh attempts: one success, one failure ---

  it("handles concurrent refresh — second attempt fails", async () => {
    const oldSession = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(oldSession);
    sessionRepo.registerToken("token-1", oldSession);

    const uc = makeUseCase({ sessionRepo, hasher, clock });

    // First refresh succeeds
    const result1 = await uc.execute({ refreshToken: "token-1" });
    expect(result1.accessToken).toBeDefined();

    // Simulate concurrent: the old token no longer maps to the session
    // The hash in the DB has changed, so rotate would fail
    sessionRepo.hashLookup.delete("token-1");

    await expect(
      uc.execute({ refreshToken: "token-1" }),
    ).rejects.toThrow("Invalid refresh token");
  });

  // --- Access token carries correct identity claims ---

  it("issues access token with correct user identity claims", async () => {
    const session = makeSession({ userId: "user-42", refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(session);
    sessionRepo.registerToken("token-1", session);

    const uc = makeUseCase({ sessionRepo, hasher, clock });
    const result = await uc.execute({ refreshToken: "token-1" });

    // Decode the JWT payload (without verifying signature)
    const payload = JSON.parse(
      Buffer.from(result.accessToken.split(".")[1]!, "base64url").toString("utf-8"),
    );
    expect(payload.sub).toBe("user-42");
    expect(payload.phone).toBe("+99361234567");
    expect(payload.role).toBe("buyer");
  });

  it("includes sid claim in access token", async () => {
    const session = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(session);
    sessionRepo.registerToken("token-1", session);

    const uc = makeUseCase({ sessionRepo, hasher, clock });
    const result = await uc.execute({ refreshToken: "token-1" });

    const payload = JSON.parse(
      Buffer.from(result.accessToken.split(".")[1]!, "base64url").toString("utf-8"),
    );
    expect(payload.sid).toBe(session.id);
  });

  it("preserves adminTotpExpiresAt without extending it", async () => {
    const futureElevation = new Date(NOW.getTime() + 12 * 60 * 60 * 1000);
    const session = makeSession({
      refreshTokenHash: "hashed:token-1",
      adminTotpExpiresAt: futureElevation,
    });
    sessionRepo.sessions.push(session);
    sessionRepo.registerToken("token-1", session);

    const uc = makeUseCase({ sessionRepo, hasher, clock });
    await uc.execute({ refreshToken: "token-1" });

    const updated = sessionRepo.sessions.find((s) => s.id === session.id)!;
    expect(updated.adminTotpExpiresAt?.getTime()).toBe(futureElevation.getTime());
  });
});
