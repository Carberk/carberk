import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import type { TotpEnrollment } from "../domain/TotpEnrollment";
import type { TotpBackupCode } from "../domain/TotpBackupCode";
import type { Session } from "../domain/Session";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { TotpSecretCipherPort } from "../domain/ports/TotpSecretCipherPort";
import type { TotpVerifierPort } from "../domain/ports/TotpVerifierPort";
import type { TotpThrottlePort } from "../domain/ports/TotpThrottlePort";
import type { SecurityLoggerPort } from "../domain/ports/SecurityLoggerPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { VerifyAdminTotp } from "./VerifyAdminTotp";

const NOW = new Date("2026-05-14T12:00:00Z");

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

class FakeTotpEnrollmentRepository implements TotpEnrollmentRepository {
  enrollments: TotpEnrollment[] = [];
  backupCodes: TotpBackupCode[] = [];
  throwOnMarkVerified = false;
  elevateSession: (_sessionId: string, _adminTotpExpiresAt: Date | null) => Promise<void> =
    async () => {};

  async findByUserId(userId: string): Promise<TotpEnrollment | null> {
    return this.enrollments.find((e) => e.userId === userId) ?? null;
  }

  async createPending(userId: string, encryptedSecret: string): Promise<TotpEnrollment> {
    const enrollment: TotpEnrollment = {
      id: randomUUID(),
      userId,
      encryptedSecret,
      verifiedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.enrollments.push(enrollment);
    return enrollment;
  }

  async markVerified(userId: string): Promise<void> {
    if (this.throwOnMarkVerified) {
      throw new Error("mark verified failed");
    }
    const idx = this.enrollments.findIndex((e) => e.userId === userId);
    if (idx !== -1) {
      this.enrollments[idx] = { ...this.enrollments[idx]!, verifiedAt: NOW };
    }
  }

  async addBackupCodes(enrollmentId: string, codeHashes: string[]): Promise<void> {
    for (const codeHash of codeHashes) {
      this.backupCodes.push({
        id: randomUUID(),
        totpEnrollmentId: enrollmentId,
        codeHash,
        usedAt: null,
      });
    }
  }

  async findBackupCodes(enrollmentId: string): Promise<TotpBackupCode[]> {
    return this.backupCodes.filter((b) => b.totpEnrollmentId === enrollmentId);
  }

  async consumeBackupCode(enrollmentId: string, codeHash: string): Promise<boolean> {
    const idx = this.backupCodes.findIndex(
      (b) => b.totpEnrollmentId === enrollmentId && b.codeHash === codeHash && b.usedAt === null,
    );
    if (idx === -1) return false;
    this.backupCodes[idx] = { ...this.backupCodes[idx]!, usedAt: NOW };
    return true;
  }

  async completeFirstVerification(input: {
    userId: string;
    enrollmentId: string;
    verifiedAt: Date;
    codeHashes: string[];
    sessionId: string;
    adminTotpExpiresAt: Date;
  }): Promise<void> {
    await this.markVerified(input.userId);
    await this.addBackupCodes(input.enrollmentId, input.codeHashes);
    await this.elevateSession(input.sessionId, input.adminTotpExpiresAt);
  }

  async consumeBackupCodeAndElevate(input: {
    enrollmentId: string;
    codeHash: string;
    sessionId: string;
    adminTotpExpiresAt: Date;
  }): Promise<boolean> {
    const consumed = await this.consumeBackupCode(input.enrollmentId, input.codeHash);
    if (!consumed) return false;
    await this.elevateSession(input.sessionId, input.adminTotpExpiresAt);
    return true;
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.enrollments = this.enrollments.filter((e) => e.userId !== userId);
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

  async updateAdminTotpExpiresAt(id: string, adminTotpExpiresAt: Date | null): Promise<void> {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.sessions[idx] = { ...this.sessions[idx]!, adminTotpExpiresAt };
    }
  }

  async delete(): Promise<void> {}

  async deleteAllByUserId(): Promise<number> {
    return 0;
  }
}

class FakeCipher implements TotpSecretCipherPort {
  encrypt(plaintext: string): string {
    return `enc:${plaintext}`;
  }

  decrypt(ciphertext: string): string {
    return ciphertext.replace(/^enc:/, "");
  }
}

class FakeVerifier implements TotpVerifierPort {
  generateSecret(): string {
    return "TESTSECRET12345678";
  }

  generateAuthUri(): string {
    return "otpauth://totp/test";
  }

  verify(secret: string, code: string): boolean {
    return code === `${secret}-VALID`;
  }
}

class FakeThrottle implements TotpThrottlePort {
  counts = new Map<string, number>();

  async recordFailure(userId: string, sessionId: string): Promise<number> {
    const key = `${userId}:${sessionId}`;
    const current = this.counts.get(key) ?? 0;
    const next = current + 1;
    this.counts.set(key, next);
    return next;
  }

  async reset(userId: string, sessionId: string): Promise<void> {
    this.counts.delete(`${userId}:${sessionId}`);
  }
}

class FakeSecurityLogger implements SecurityLoggerPort {
  logs: Array<{ userId: string; sessionId: string; reason: string }> = [];

  logAdminTotpFailure(userId: string, sessionId: string, reason: string): void {
    this.logs.push({ userId, sessionId, reason });
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

describe("VerifyAdminTotp", () => {
  let totpRepo: FakeTotpEnrollmentRepository;
  let sessionRepo: FakeSessionRepository;
  let cipher: FakeCipher;
  let verifier: FakeVerifier;
  let throttle: FakeThrottle;
  let securityLogger: FakeSecurityLogger;
  let clock: FakeClock;

  beforeEach(() => {
    totpRepo = new FakeTotpEnrollmentRepository();
    sessionRepo = new FakeSessionRepository();
    totpRepo.elevateSession = (sessionId, adminTotpExpiresAt) =>
      sessionRepo.updateAdminTotpExpiresAt(sessionId, adminTotpExpiresAt);
    cipher = new FakeCipher();
    verifier = new FakeVerifier();
    throttle = new FakeThrottle();
    securityLogger = new FakeSecurityLogger();
    clock = new FakeClock();
  });

  // --- First enrollment verify ---

  it("first verify with valid TOTP sets elevation and returns 10 backup codes", async () => {
    const enrollment = await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );
    const result = await uc.execute({
      userId: "user-1",
      sessionId: session.id,
      code: "TESTSECRET12345678-VALID",
    });

    expect(result.adminTotpExpiresAt).toBeDefined();
    expect(result.backupCodes).toHaveLength(10);
    expect(result.backupCodes![0]).toMatch(/^[a-f0-9]{16}$/);

    // Elevation set on session
    const updatedSession = sessionRepo.sessions.find((s) => s.id === session.id)!;
    expect(updatedSession.adminTotpExpiresAt!.getTime()).toBe(
      NOW.getTime() + 12 * 60 * 60 * 1000,
    );

    // Enrollment marked verified
    const updatedEnrollment = totpRepo.enrollments.find((e) => e.id === enrollment.id)!;
    expect(updatedEnrollment.verifiedAt).not.toBeNull();

    // Backup codes stored
    const storedCodes = totpRepo.backupCodes.filter((b) => b.totpEnrollmentId === enrollment.id);
    expect(storedCodes).toHaveLength(10);
    expect(storedCodes.every((b) => b.usedAt === null)).toBe(true);

    // Throttle reset
    expect(throttle.counts.has("user-1:" + session.id)).toBe(false);
  });

  it("first verify with invalid TOTP throws generic failure and logs security event", async () => {
    await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );
    await expect(
      uc.execute({ userId: "user-1", sessionId: session.id, code: "wrong" }),
    ).rejects.toThrow("Invalid TOTP code");

    expect(securityLogger.logs).toHaveLength(1);
    expect(securityLogger.logs[0]!.reason).toBe("Invalid TOTP or backup code");
  });

  it("does not elevate the session if first enrollment completion fails", async () => {
    await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    totpRepo.throwOnMarkVerified = true;
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );

    await expect(
      uc.execute({
        userId: "user-1",
        sessionId: session.id,
        code: "TESTSECRET12345678-VALID",
      }),
    ).rejects.toThrow("mark verified failed");

    const storedSession = sessionRepo.sessions.find((s) => s.id === session.id)!;
    expect(storedSession.adminTotpExpiresAt).toBeNull();
  });

  // --- Post-enrollment verify ---

  it("post-enrollment verify with valid TOTP returns only elevation", async () => {
    const enrollment = await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    totpRepo.enrollments = [{ ...enrollment, verifiedAt: NOW }];
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );
    const result = await uc.execute({
      userId: "user-1",
      sessionId: session.id,
      code: "TESTSECRET12345678-VALID",
    });

    expect(result.adminTotpExpiresAt).toBeDefined();
    expect(result.backupCodes).toBeUndefined();
  });

  it("post-enrollment verify with valid backup code returns elevation", async () => {
    const enrollment = await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    totpRepo.enrollments = [{ ...enrollment, verifiedAt: NOW }];
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const backupCode = "abcd1234efgh5678";
    await totpRepo.addBackupCodes(enrollment.id, [hashCode(backupCode)]);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );
    const result = await uc.execute({
      userId: "user-1",
      sessionId: session.id,
      code: backupCode,
    });

    expect(result.adminTotpExpiresAt).toBeDefined();
    expect(result.backupCodes).toBeUndefined();

    // Backup code marked used
    const stored = totpRepo.backupCodes.find((b) => b.codeHash === hashCode(backupCode))!;
    expect(stored.usedAt).not.toBeNull();
  });

  it("post-enrollment backup code consumption is atomic and single-use", async () => {
    const enrollment = await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    totpRepo.enrollments = [{ ...enrollment, verifiedAt: NOW }];
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const backupCode = "abcd1234efgh5678";
    await totpRepo.addBackupCodes(enrollment.id, [hashCode(backupCode)]);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );
    await uc.execute({ userId: "user-1", sessionId: session.id, code: backupCode });

    // Second use fails
    await expect(
      uc.execute({ userId: "user-1", sessionId: session.id, code: backupCode }),
    ).rejects.toThrow("Invalid TOTP code");
  });

  // --- Throttle ---

  it("blocks after 5 failed attempts per user/session per 10 min", async () => {
    await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );

    // 5 failures
    for (let i = 0; i < 5; i++) {
      await expect(
        uc.execute({ userId: "user-1", sessionId: session.id, code: "wrong" }),
      ).rejects.toThrow("Invalid TOTP code");
    }

    // 6th attempt hits rate limit
    await expect(
      uc.execute({ userId: "user-1", sessionId: session.id, code: "wrong" }),
    ).rejects.toThrow("TOTP_RATE_LIMITED");
  });

  it("resets failure counter on success", async () => {
    await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    const session = makeSession();
    sessionRepo.sessions.push(session);

    const uc = new VerifyAdminTotp(
      totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock,
    );

    // 4 failures
    for (let i = 0; i < 4; i++) {
      await expect(
        uc.execute({ userId: "user-1", sessionId: session.id, code: "wrong" }),
      ).rejects.toThrow("Invalid TOTP code");
    }

    // Success resets counter
    await uc.execute({
      userId: "user-1",
      sessionId: session.id,
      code: "TESTSECRET12345678-VALID",
    });

    // New failures start from 1 again
    await expect(
      uc.execute({ userId: "user-1", sessionId: session.id, code: "wrong" }),
    ).rejects.toThrow("Invalid TOTP code");

    // Should not be rate limited yet (only 1 new failure after reset)
    expect(throttle.counts.get("user-1:" + session.id)).toBe(1);
  });
  it.each([{ userId: "other" }, { expiresAt: NOW }])("refuses stale/mismatched sessions before consuming valid TOTP %j", async (patch) => {
    await totpRepo.createPending("user-1", cipher.encrypt("TESTSECRET12345678"));
    const session = makeSession(patch); sessionRepo.sessions.push(session);
    const uc = new VerifyAdminTotp(totpRepo, sessionRepo, cipher, verifier, throttle, securityLogger, clock);
    await expect(uc.execute({ userId: "user-1", sessionId: session.id, code: "TESTSECRET12345678-VALID" })).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
    expect((await totpRepo.findByUserId("user-1"))?.verifiedAt).toBeNull();
  });

});
