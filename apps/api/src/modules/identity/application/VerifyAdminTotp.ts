import { Inject, Injectable } from "@nestjs/common";
import type { CredentialCryptoPort } from "../domain/ports/CredentialCryptoPort";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { TotpSecretCipherPort } from "../domain/ports/TotpSecretCipherPort";
import type { TotpVerifierPort } from "../domain/ports/TotpVerifierPort";
import type { TotpThrottlePort } from "../domain/ports/TotpThrottlePort";
import type { SecurityLoggerPort } from "../domain/ports/SecurityLoggerPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { IDENTITY_TOKENS } from "../identity.tokens";

const ELEVATION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const BACKUP_CODE_COUNT = 10;

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
    @Inject(IDENTITY_TOKENS.TotpEnrollmentRepository)
    private readonly totpRepo: TotpEnrollmentRepository,
    @Inject(IDENTITY_TOKENS.SessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(IDENTITY_TOKENS.TotpSecretCipherPort)
    private readonly cipher: TotpSecretCipherPort,
    @Inject(IDENTITY_TOKENS.TotpVerifierPort)
    private readonly verifier: TotpVerifierPort,
    @Inject(IDENTITY_TOKENS.TotpThrottlePort)
    private readonly throttle: TotpThrottlePort,
    @Inject(IDENTITY_TOKENS.SecurityLoggerPort)
    private readonly securityLogger: SecurityLoggerPort,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.CredentialCryptoPort)
    private readonly crypto: CredentialCryptoPort,
  ) {}

  async execute(input: VerifyAdminTotpInput): Promise<VerifyAdminTotpResult> {
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
      ? this.crypto.hashCode(input.code)
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
      const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => this.crypto.generateBackupCode());
      const codeHashes = backupCodes.map((code) => this.crypto.hashCode(code));
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
      await this.sessionRepo.updateAdminTotpExpiresAt(input.sessionId, adminTotpExpiresAt);
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
