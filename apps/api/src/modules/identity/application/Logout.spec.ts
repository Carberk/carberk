import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Session } from "../domain/Session";
import type { SessionRepository, SessionLookupResult } from "../domain/ports/SessionRepository";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";
import { Logout } from "./Logout";

const NOW = new Date("2026-05-14T12:00:00Z");

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: randomUUID(),
    userId: "user-1",
    refreshTokenHash: "hashed:token-1",
    deviceLabel: null,
    userAgent: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: NOW,
    lastSeenAt: NOW,
    adminTotpExpiresAt: null,
    ...overrides,
  };
}

class FakeSessionRepository implements SessionRepository {
  sessions: Session[] = [];
  hashLookup: Map<string, Session> = new Map();
  deletedIds: string[] = [];

  async create(input: Parameters<SessionRepository["create"]>[0]): Promise<Session> {
    const s: Session = { ...input, id: randomUUID(), createdAt: NOW, lastSeenAt: NOW, adminTotpExpiresAt: null };
    this.sessions.push(s);
    return s;
  }

  async countByUserId(_userId: string): Promise<number> {
    return this.sessions.filter((s) => s.userId === _userId).length;
  }

  async deleteExpiredByUserId(_userId: string): Promise<number> { return 0; }
  async deleteOldestByUserId(_userId: string): Promise<void> {}

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

  async rotateRefreshToken(): Promise<boolean> { return true; }

  async findById(id: string): Promise<Session | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async updateAdminTotpExpiresAt(): Promise<void> {}

  async delete(id: string): Promise<void> {
    this.deletedIds.push(id);
    this.sessions = this.sessions.filter((s) => s.id !== id);
  }

  async deleteAllByUserId(_userId: string): Promise<number> { return 0; }

  registerToken(plaintext: string, session: Session): void {
    this.hashLookup.set(plaintext, session);
  }
}

class FakePasswordHasher implements RefreshTokenHasherPort {
  async hash(plaintext: string): Promise<string> { return `hashed:${plaintext}`; }
  async compare(plaintext: string, hash: string): Promise<boolean> { return hash === `hashed:${plaintext}`; }
}

function makeUseCase(sessionRepo?: FakeSessionRepository) {
  return new Logout(sessionRepo ?? new FakeSessionRepository());
}

describe("Logout", () => {
  let sessionRepo: FakeSessionRepository;

  beforeEach(() => {
    sessionRepo = new FakeSessionRepository();
  });

  it("deletes the session matching the supplied refresh token", async () => {
    const session = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(session);
    sessionRepo.registerToken("token-1", session);

    const uc = makeUseCase(sessionRepo);
    await uc.execute({ refreshToken: "token-1" });

    expect(sessionRepo.deletedIds).toContain(session.id);
    expect(sessionRepo.sessions).toHaveLength(0);
  });

  it("deletes only the matching session, leaving other sessions untouched", async () => {
    const sessionA = makeSession({ id: "session-a", userId: "user-1", refreshTokenHash: "hashed:token-a" });
    const sessionB = makeSession({ id: "session-b", userId: "user-1", refreshTokenHash: "hashed:token-b" });
    sessionRepo.sessions.push(sessionA, sessionB);
    sessionRepo.registerToken("token-a", sessionA);
    sessionRepo.registerToken("token-b", sessionB);

    const uc = makeUseCase(sessionRepo);
    await uc.execute({ refreshToken: "token-a" });

    expect(sessionRepo.deletedIds).toContain("session-a");
    expect(sessionRepo.deletedIds).not.toContain("session-b");
    expect(sessionRepo.sessions).toHaveLength(1);
  });

  it("throws 'Invalid refresh token' for an unknown token", async () => {
    const uc = makeUseCase(sessionRepo);

    await expect(
      uc.execute({ refreshToken: "nonexistent" }),
    ).rejects.toThrow("Invalid refresh token");
  });

  it("does not delete any session for an unknown token", async () => {
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = makeUseCase(sessionRepo);
    await expect(
      uc.execute({ refreshToken: "nonexistent" }),
    ).rejects.toThrow("Invalid refresh token");

    expect(sessionRepo.deletedIds).toHaveLength(0);
    expect(sessionRepo.sessions).toHaveLength(1);
  });

  it("is idempotent — second call with same (already-deleted) token throws 'Invalid refresh token'", async () => {
    const session = makeSession({ refreshTokenHash: "hashed:token-1" });
    sessionRepo.sessions.push(session);
    sessionRepo.registerToken("token-1", session);

    const uc = makeUseCase(sessionRepo);

    // First call succeeds
    await uc.execute({ refreshToken: "token-1" });
    expect(sessionRepo.deletedIds).toContain(session.id);

    // Second call: token no longer maps to any session (was deleted)
    sessionRepo.hashLookup.delete("token-1");
    await expect(
      uc.execute({ refreshToken: "token-1" }),
    ).rejects.toThrow("Invalid refresh token");
  });

  it("still succeeds when the session has already expired (token is valid even if expired)", async () => {
    // Logout should work regardless of session expiry — if you hold the token, you can delete it
    const expiredSession = makeSession({
      refreshTokenHash: "hashed:token-1",
      expiresAt: new Date(NOW.getTime() - 1000),
    });
    sessionRepo.sessions.push(expiredSession);
    sessionRepo.registerToken("token-1", expiredSession);

    const uc = makeUseCase(sessionRepo);
    // Should succeed — logout doesn't check expiry
    await uc.execute({ refreshToken: "token-1" });
    expect(sessionRepo.deletedIds).toContain(expiredSession.id);
  });
});
