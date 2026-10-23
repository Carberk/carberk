import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { TotpEnrollment } from "../domain/TotpEnrollment";
import type { Session } from "../domain/Session";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { ClockPort } from "../domain/ports/ClockPort";
import { GetAdminTotpStatus } from "./GetAdminTotpStatus";

const NOW = new Date("2026-05-14T12:00:00Z");

class FakeTotpEnrollmentRepository implements TotpEnrollmentRepository {
  enrollments: TotpEnrollment[] = [];

  async findByUserId(userId: string): Promise<TotpEnrollment | null> {
    return this.enrollments.find((e) => e.userId === userId) ?? null;
  }

  async createPending(): Promise<TotpEnrollment> {
    throw new Error("Not implemented");
  }

  async markVerified(): Promise<void> {}

  async addBackupCodes(): Promise<void> {}

  async findBackupCodes(): Promise<import("../domain/TotpBackupCode").TotpBackupCode[]> {
    return [];
  }

  async consumeBackupCode(): Promise<boolean> {
    return false;
  }

  async completeFirstVerification(): Promise<void> {}

  async consumeBackupCodeAndElevate(): Promise<boolean> {
    return false;
  }

  async deleteByUserId(): Promise<void> {}
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

class FakeClock implements ClockPort {
  now(): Date {
    return NOW;
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

function makeEnrollment(overrides: Partial<TotpEnrollment> = {}): TotpEnrollment {
  return {
    id: randomUUID(),
    userId: "user-1",
    encryptedSecret: "encrypted",
    verifiedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("GetAdminTotpStatus", () => {
  let totpRepo: FakeTotpEnrollmentRepository;
  let sessionRepo: FakeSessionRepository;
  let clock: FakeClock;

  beforeEach(() => {
    totpRepo = new FakeTotpEnrollmentRepository();
    sessionRepo = new FakeSessionRepository();
    clock = new FakeClock();
  });

  it("returns not enrolled and not elevated for new admin", async () => {
    const uc = new GetAdminTotpStatus(totpRepo, sessionRepo, clock);
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const result = await uc.execute({ userId: "user-1", sessionId: session.id });
    expect(result.enrolled).toBe(false);
    expect(result.elevated).toBe(false);
    expect(result.adminTotpExpiresAt).toBeUndefined();
  });

  it("returns enrolled when verified enrollment exists", async () => {
    const uc = new GetAdminTotpStatus(totpRepo, sessionRepo, clock);
    totpRepo.enrollments.push(makeEnrollment({ verifiedAt: NOW }));
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const result = await uc.execute({ userId: "user-1", sessionId: session.id });
    expect(result.enrolled).toBe(true);
    expect(result.elevated).toBe(false);
  });

  it("returns elevated when adminTotpExpiresAt is in the future", async () => {
    const uc = new GetAdminTotpStatus(totpRepo, sessionRepo, clock);
    totpRepo.enrollments.push(makeEnrollment({ verifiedAt: NOW }));
    const session = makeSession({
      adminTotpExpiresAt: new Date(NOW.getTime() + 60_000),
    });
    sessionRepo.sessions.push(session);

    const result = await uc.execute({ userId: "user-1", sessionId: session.id });
    expect(result.enrolled).toBe(true);
    expect(result.elevated).toBe(true);
    expect(result.adminTotpExpiresAt).toBe(session.adminTotpExpiresAt!.toISOString());
  });

  it("returns not elevated when adminTotpExpiresAt is in the past", async () => {
    const uc = new GetAdminTotpStatus(totpRepo, sessionRepo, clock);
    const session = makeSession({
      adminTotpExpiresAt: new Date(NOW.getTime() - 60_000),
    });
    sessionRepo.sessions.push(session);

    const result = await uc.execute({ userId: "user-1", sessionId: session.id });
    expect(result.enrolled).toBe(false);
    expect(result.elevated).toBe(false);
    expect(result.adminTotpExpiresAt).toBe(session.adminTotpExpiresAt!.toISOString());
  });
  it.each([{ userId: "other" }, { expiresAt: NOW }])("does not report elevation from mismatched or expired current Session %j", async (patch) => {
    const uc = new GetAdminTotpStatus(totpRepo, sessionRepo, clock);
    const session = makeSession({ adminTotpExpiresAt: new Date("2026-05-15T12:00:00Z"), ...patch });
    sessionRepo.sessions.push(session);
    await expect(uc.execute({ userId: "user-1", sessionId: session.id })).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
  });

});
