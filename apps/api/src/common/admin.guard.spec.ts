import { describe, it, expect, beforeEach } from "vitest";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import type {
  ClockPort,
  IdentityCheckPort,
  Session,
  SessionRepository,
} from "../modules/identity/identity.public";
import { randomUUID } from "node:crypto";

const NOW = new Date("2026-05-14T12:00:00Z");

class FakeIdentityCheckPort implements IdentityCheckPort {
  private users = new Map<string, boolean>();

  setAdmin(userId: string, isAdmin: boolean): void {
    this.users.set(userId, isAdmin);
  }

  async isAdmin(userId: string): Promise<boolean> {
    return this.users.get(userId) ?? false;
  }

  async isInDealership(): Promise<boolean> {
    return false;
  }

  async isSuspended(): Promise<boolean> {
    return false;
  }

  async isDeletionScheduled(): Promise<boolean> {
    return false;
  }
}

class FakeClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class FakeSessionRepository implements SessionRepository {
  sessions: Session[] = [];

  async create(): Promise<Session> {
    throw new Error("Not implemented");
  }

  async countByUserId(): Promise<number> {
    return 0;
  }

  async deleteExpiredByUserId(): Promise<number> {
    return 0;
  }

  async deleteOldestByUserId(): Promise<void> {}

  async findByRefreshToken() {
    return null;
  }

  async rotateRefreshToken(): Promise<boolean> {
    return false;
  }

  async findById(id: string): Promise<Session | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async updateAdminTotpExpiresAt(): Promise<void> {}

  async delete(): Promise<void> {}

  async deleteAllByUserId(): Promise<number> {
    return 0;
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: randomUUID(),
    userId: "user-1",
    refreshTokenHash: "hash",
    deviceLabel: null,
    userAgent: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: NOW,
    lastSeenAt: NOW,
    adminTotpExpiresAt: null,
    ...overrides,
  };
}

function makeContext(
  user?: { sub: string; sid?: string; role?: string },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("AdminGuard", () => {
  let guard: AdminGuard;
  let fakePort: FakeIdentityCheckPort;
  let fakeSessionRepo: FakeSessionRepository;
  let fakeClock: FakeClock;

  beforeEach(() => {
    fakePort = new FakeIdentityCheckPort();
    fakeSessionRepo = new FakeSessionRepository();
    fakeClock = new FakeClock();
    guard = new AdminGuard(fakePort, fakeSessionRepo, fakeClock);
  });

  it("allows admin requests with valid TOTP elevation", async () => {
    const sid = randomUUID();
    fakePort.setAdmin("admin-1", true);
    fakeSessionRepo.sessions.push(
      makeSession({
        id: sid,
        userId: "admin-1",
        adminTotpExpiresAt: new Date(NOW.getTime() + 60_000),
      }),
    );
    const result = await guard.canActivate(
      makeContext({ sub: "admin-1", sid, role: "admin" }),
    );
    expect(result).toBe(true);
  });

  it("rejects non-admin requests with ForbiddenException", async () => {
    fakePort.setAdmin("buyer-1", false);
    await expect(
      guard.canActivate(makeContext({ sub: "buyer-1" })),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects non-admin with correct error shape", async () => {
    fakePort.setAdmin("buyer-1", false);
    try {
      await guard.canActivate(makeContext({ sub: "buyer-1" }));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe("FORBIDDEN");
      expect(response.message).toBe("Admin role required");
    }
  });

  it("rejects unauthenticated requests with UnauthorizedException", async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects requests with missing sub", async () => {
    await expect(
      guard.canActivate(makeContext({} as { sub: string })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects admin without sid claim", async () => {
    fakePort.setAdmin("admin-1", true);
    await expect(
      guard.canActivate(makeContext({ sub: "admin-1", role: "admin" })),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects admin with missing session for sid", async () => {
    fakePort.setAdmin("admin-1", true);
    await expect(
      guard.canActivate(
        makeContext({ sub: "admin-1", sid: randomUUID(), role: "admin" }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects admin with expired session for sid", async () => {
    const sid = randomUUID();
    fakePort.setAdmin("admin-1", true);
    fakeSessionRepo.sessions.push(
      makeSession({
        id: sid,
        userId: "admin-1",
        expiresAt: new Date(NOW.getTime() - 60_000),
        adminTotpExpiresAt: new Date(NOW.getTime() + 60_000),
      }),
    );

    await expect(
      guard.canActivate(
        makeContext({ sub: "admin-1", sid, role: "admin" }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects admin when the elevated sid belongs to another user", async () => {
    const sid = randomUUID();
    fakePort.setAdmin("admin-1", true);
    fakeSessionRepo.sessions.push(
      makeSession({
        id: sid,
        userId: "admin-2",
        adminTotpExpiresAt: new Date(NOW.getTime() + 60_000),
      }),
    );

    await expect(
      guard.canActivate(
        makeContext({ sub: "admin-1", sid, role: "admin" }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects admin with expired TOTP elevation", async () => {
    const sid = randomUUID();
    fakePort.setAdmin("admin-1", true);
    fakeSessionRepo.sessions.push(
      makeSession({
        id: sid,
        userId: "admin-1",
        adminTotpExpiresAt: new Date(NOW.getTime() - 60_000),
      }),
    );
    await expect(
      guard.canActivate(
        makeContext({ sub: "admin-1", sid, role: "admin" }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects admin with null adminTotpExpiresAt", async () => {
    const sid = randomUUID();
    fakePort.setAdmin("admin-1", true);
    fakeSessionRepo.sessions.push(
      makeSession({
        id: sid,
        userId: "admin-1",
        adminTotpExpiresAt: null,
      }),
    );
    await expect(
      guard.canActivate(
        makeContext({ sub: "admin-1", sid, role: "admin" }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
