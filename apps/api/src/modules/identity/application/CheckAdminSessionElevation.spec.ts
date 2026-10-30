import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AdminGuard } from "../../../common/admin.guard";
import { CheckAdminSessionElevation } from "./CheckAdminSessionElevation";
import { InMemoryIdentityCheck } from "./testing/InMemoryIdentityCheck";
import type { Session } from "../domain/Session";
import { InMemorySessions } from "./testing/InMemorySessions";
import { MutableClock } from "./testing/MutableClock";
import { randomUUID } from "node:crypto";

const NOW = new Date("2026-05-14T12:00:00Z");

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
  let fakePort: InMemoryIdentityCheck;
  let fakeSessionRepo: InMemorySessions;
  let fakeClock: MutableClock;

  beforeEach(() => {
    fakePort = new InMemoryIdentityCheck();
    fakeSessionRepo = new InMemorySessions();
    fakeClock = new MutableClock(NOW);
    guard = new AdminGuard(
      fakePort,
      new CheckAdminSessionElevation(fakeSessionRepo, fakeClock),
    );
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


describe("Identity admin elevation boundary", () => {
  const FUTURE = new Date("2026-05-14T12:01:00Z");
  const PAST = new Date("2026-05-14T11:59:00Z");

  it.each([
    ["missing session", null, "session-required", "Admin TOTP elevation required"],
    ["foreign owner before either expired deadline", { userId: "other", expiresAt: PAST, adminTotpExpiresAt: PAST }, "session-required", "Admin TOTP elevation required"],
    ["session deadline equality before elevation", { expiresAt: NOW, adminTotpExpiresAt: PAST }, "session-expired", "Admin session expired"],
    ["past session deadline before missing elevation", { expiresAt: PAST, adminTotpExpiresAt: null }, "session-expired", "Admin session expired"],
    ["elevation deadline equality", { expiresAt: FUTURE, adminTotpExpiresAt: NOW }, "elevation-expired", "Admin TOTP elevation expired"],
    ["missing elevation", { expiresAt: FUTURE, adminTotpExpiresAt: null }, "elevation-expired", "Admin TOTP elevation expired"],
  ] as const)("preserves %s refusal and HTTP envelope", async (_name, overrides, result, message) => {
    const sessions = new InMemorySessions();
    if (overrides) sessions.sessions.push(makeSession({ id: "sid", userId: "admin-1", ...overrides }));
    const elevation = new CheckAdminSessionElevation(sessions, new MutableClock(NOW));
    expect(await elevation.check({ userId: "admin-1", sessionId: "sid" })).toBe(result);
    const identity = new InMemoryIdentityCheck();
    identity.setAdmin("admin-1", true);
    await expect(new AdminGuard(identity, elevation).canActivate(makeContext({ sub: "admin-1", sid: "sid" })))
      .rejects.toMatchObject({ response: { code: "FORBIDDEN", message }, status: 403 });
  });

  it("refuses non-admin before looking up even a supplied session", async () => {
    const sessions = new InMemorySessions();
    vi.spyOn(sessions, "findById").mockRejectedValue(new Error("storage unavailable"));
    const guard = new AdminGuard(new InMemoryIdentityCheck(), new CheckAdminSessionElevation(sessions, new MutableClock(NOW)));
    await expect(guard.canActivate(makeContext({ sub: "buyer-1", sid: "sid", role: "admin" })))
      .rejects.toMatchObject({ response: { code: "FORBIDDEN", message: "Admin role required" }, status: 403 });
  });

  it("refuses a missing sid before accessing storage", async () => {
    const sessions = new InMemorySessions();
    vi.spyOn(sessions, "findById").mockRejectedValue(new Error("storage unavailable"));
    const identity = new InMemoryIdentityCheck();
    identity.setAdmin("admin-1", true);
    const guard = new AdminGuard(identity, new CheckAdminSessionElevation(sessions, new MutableClock(NOW)));
    await expect(guard.canActivate(makeContext({ sub: "admin-1" })))
      .rejects.toMatchObject({ response: { code: "FORBIDDEN", message: "Admin TOTP elevation required" }, status: 403 });
  });

  it("uses time after the asynchronous session lookup", async () => {
    const sessions = new InMemorySessions();
    const clock = new MutableClock(NOW);
    vi.spyOn(sessions, "findById").mockImplementation(async () => {
      await Promise.resolve();
      clock.current = FUTURE;
      return makeSession({ expiresAt: FUTURE, adminTotpExpiresAt: FUTURE });
    });
    expect(await new CheckAdminSessionElevation(sessions, clock).check({ userId: "user-1", sessionId: "sid" }))
      .toBe("session-expired");
  });

  it("uses the same time sample for both deadlines", async () => {
    const sessions = new InMemorySessions();
    sessions.sessions.push(makeSession({ id: "sid", expiresAt: FUTURE, adminTotpExpiresAt: FUTURE }));
    const clock = new MutableClock(NOW);
    vi.spyOn(clock, "now").mockImplementationOnce(() => NOW).mockImplementation(() => FUTURE);
    expect(await new CheckAdminSessionElevation(sessions, clock).check({ userId: "user-1", sessionId: "sid" }))
      .toBe("elevated");
  });

  it("refuses missing and foreign sessions without reading time", async () => {
    const sessions = new InMemorySessions();
    sessions.sessions.push(makeSession({ id: "foreign", userId: "other" }));
    const clock = new MutableClock(NOW);
    vi.spyOn(clock, "now").mockImplementation(() => { throw new Error("clock unavailable"); });
    const elevation = new CheckAdminSessionElevation(sessions, clock);
    expect(await elevation.check({ userId: "user-1", sessionId: "missing" })).toBe("session-required");
    expect(await elevation.check({ userId: "user-1", sessionId: "foreign" })).toBe("session-required");
  });

  it("propagates session storage failure without replacing it with an authorization refusal", async () => {
    const sessions = new InMemorySessions();
    const failure = new Error("storage unavailable");
    vi.spyOn(sessions, "findById").mockRejectedValue(failure);
    await expect(new CheckAdminSessionElevation(sessions, new MutableClock(NOW)).check({ userId: "user-1", sessionId: "sid" }))
      .rejects.toBe(failure);
  });
});
