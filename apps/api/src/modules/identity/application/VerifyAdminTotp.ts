import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import { Inject, Injectable } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { TotpSecretCipherPort } from "../domain/ports/TotpSecretCipherPort";
import type { TotpVerifierPort } from "../domain/ports/TotpVerifierPort";
import type { TotpThrottlePort } from "../domain/ports/TotpThrottlePort";
import type { SecurityLoggerPort } from "../domain/ports/SecurityLoggerPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { PrismaTotpEnrollmentRepository } from "../infrastructure/PrismaTotpEnrollmentRepository";
import { PrismaSessionRepository } from "../infrastructure/PrismaSessionRepository";
import { AesGcmTotpSecretCipher } from "../infrastructure/AesGcmTotpSecretCipher";
import { OtplibTotpVerifier } from "../infrastructure/OtplibTotpVerifier";
import { InMemoryTotpThrottleAdapter } from "../infrastructure/InMemoryTotpThrottleAdapter";
import { PinoSecurityLoggerAdapter } from "../infrastructure/PinoSecurityLoggerAdapter";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";

const ELEVATION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 16;

function hashSha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function generateBackupCode(): string {
  return randomBytes(BACKUP_CODE_LENGTH / 2).toString("hex");
}

export interface VerifyAdminTotpInput {
  userId: string;
  sessionId: string;
  code: string;
}

export interface VerifyAdminTotpResult {
  adminTotpExpiresAt: string;
  backupCodes?: string[];
}

@Injectable()
export class VerifyAdminTotp {
  constructor(
    @Inject(PrismaTotpEnrollmentRepository)
    private readonly totpRepo: TotpEnrollmentRepository,
    @Inject(PrismaSessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(AesGcmTotpSecretCipher)
    private readonly cipher: TotpSecretCipherPort,
    @Inject(OtplibTotpVerifier)
    private readonly verifier: TotpVerifierPort,
    @Inject(InMemoryTotpThrottleAdapter)
    private readonly throttle: TotpThrottlePort,
    @Inject(PinoSecurityLoggerAdapter)
    private readonly securityLogger: SecurityLoggerPort,
    @Inject(SystemClockAdapter)
    private readonly clock: ClockPort,
  ) {}

  async execute(input: VerifyAdminTotpInput): Promise<VerifyAdminTotpResult> {
    const currentSession = await this.sessionRepo.findById(input.sessionId);
    const checkedAt = this.clock.now();
    if (!currentSession || currentSession.userId !== input.userId || currentSession.expiresAt <= checkedAt) throw new StaffAuthorityDenied("SESSION_REQUIRED");
    const failureCount = await this.throttle.recordFailure(input.userId, input.sessionId);
    if (failureCount > MAX_FAILURES) {
      const err = new Error("TOTP_RATE_LIMITED");
      err.name = "RateLimitError";
      throw err;
    }

    const enrollment = await this.totpRepo.findByUserId(input.userId);
    if (!enrollment) {
      this.securityLogger.logAdminTotpFailure(input.userId, input.sessionId, "No enrollment found");
      throw new Error("Invalid TOTP code");
    }

    const secret = this.cipher.decrypt(enrollment.encryptedSecret);
    const isFirstVerify = enrollment.verifiedAt == null;

    const validTotp = this.verifier.verify(secret, input.code);
    const backupCodeHash = !validTotp && !isFirstVerify
      ? hashSha256(input.code)
      : null;

    if (!validTotp && backupCodeHash == null) {
      this.securityLogger.logAdminTotpFailure(input.userId, input.sessionId, "Invalid TOTP or backup code");
      throw new Error("Invalid TOTP code");
    }

    const now = this.clock.now();
    const adminTotpExpiresAt = new Date(now.getTime() + ELEVATION_TTL_MS);

    const result: VerifyAdminTotpResult = {
      adminTotpExpiresAt: adminTotpExpiresAt.toISOString(),
    };

    if (isFirstVerify) {
      const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
      const codeHashes = backupCodes.map(hashSha256);
      await this.totpRepo.completeFirstVerification({
        userId: input.userId,
        enrollmentId: enrollment.id,
        verifiedAt: now,
        codeHashes,
        sessionId: input.sessionId,
        adminTotpExpiresAt,
      });
      await this.throttle.reset(input.userId, input.sessionId);
      result.backupCodes = backupCodes;
      return result;
    }

    if (validTotp) {
      await this.sessionRepo.updateAdminTotpExpiresAt(input.sessionId, adminTotpExpiresAt, { userId: input.userId, now });
      await this.throttle.reset(input.userId, input.sessionId);
      return result;
    }

    if (backupCodeHash == null) {
      throw new Error("Invalid TOTP code");
    }

    const consumed = await this.totpRepo.consumeBackupCodeAndElevate({
      userId: input.userId,
      enrollmentId: enrollment.id,
      codeHash: backupCodeHash,
      usedAt: now,
      sessionId: input.sessionId,
      adminTotpExpiresAt,
    });
    if (!consumed) {
      this.securityLogger.logAdminTotpFailure(input.userId, input.sessionId, "Invalid TOTP or backup code");
      throw new Error("Invalid TOTP code");
    }

    await this.throttle.reset(input.userId, input.sessionId);
    return result;
  }
}
