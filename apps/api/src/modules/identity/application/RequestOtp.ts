import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";

import { OtpCode } from "../domain/OtpCode";
import {
  OtpAttemptLedger,
  SIGN_IN_CODE_RATE_POLICY,
} from "../domain/OtpAttemptLedger";
import { findReviewerAccount } from "../domain/ReviewerSignIn";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
import type { CredentialCryptoPort } from "../domain/ports/CredentialCryptoPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { OtpSenderPort } from "../domain/ports/OtpSenderPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import { EMAIL_CODE_SENDER_PORT } from "../domain/ports/EmailCodeSenderPort";
import type { ReviewerOtpBypassConfig } from "../domain/ports/ReviewerOtpBypassConfig";
import { REVIEWER_OTP_BYPASS_CONFIG } from "../domain/ports/ReviewerOtpBypassConfig";
import type { ConstantTimeComparatorPort } from "../domain/ports/ConstantTimeComparatorPort";
import { CONSTANT_TIME_COMPARATOR_PORT } from "../domain/ports/ConstantTimeComparatorPort";
import { IDENTITY_TOKENS } from "../identity.tokens";

export type RequestOtpInput = ({ phone: string } | { email: string }) & {
  ip: string;
  locale?: "ru" | "tk" | "en";
};

export interface RequestOtpResult {
  requestId: string;
  resendInSeconds: number;
  testCode?: string;
}

@Injectable()
export class RequestOtp {
  private readonly ledger = new OtpAttemptLedger(
    SIGN_IN_CODE_RATE_POLICY.destinationLimit,
    SIGN_IN_CODE_RATE_POLICY.ipLimit,
    SIGN_IN_CODE_RATE_POLICY.baseBackoffSeconds,
  );

  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository) private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(IDENTITY_TOKENS.OtpSenderPort) private readonly otpSender: OtpSenderPort,
    @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.OtpTestMode) private readonly testMode: boolean,
    @Inject(EMAIL_CODE_SENDER_PORT)
    private readonly emailCodeSender: EmailCodeSenderPort,
    @Inject(REVIEWER_OTP_BYPASS_CONFIG)
    private readonly reviewerBypassConfig: ReviewerOtpBypassConfig,
    @Inject(CONSTANT_TIME_COMPARATOR_PORT)
    private readonly constantTimeComparator: ConstantTimeComparatorPort,
    @Inject(IDENTITY_TOKENS.CredentialCryptoPort)
    private readonly crypto: CredentialCryptoPort,
  ) {}

  async execute(input: RequestOtpInput): Promise<RequestOtpResult> {
    const destination = signInCodeDestination(input);

    const reservedAccount = findReviewerAccount(
      this.reviewerBypassConfig,
      this.constantTimeComparator,
      destination.channel,
      destination.value,
    );
    if (
      destination.channel === SIGN_IN_CODE_CHANNELS.PHONE &&
      reservedAccount !== null
    ) {
      return { requestId: this.crypto.generateRequestId(), resendInSeconds: 0 };
    }

    const now = this.clock.now();
    const dayAgo = new Date(
      now.getTime() - SIGN_IN_CODE_RATE_POLICY.destinationWindowMs,
    );
    const hourAgo = new Date(
      now.getTime() - SIGN_IN_CODE_RATE_POLICY.ipWindowMs,
    );

    const [destinationCount24h, ipCount1h, latest] = await Promise.all([
      this.otpRequestRepo.countByDestinationSince(
        destination.channel,
        destination.value,
        dayAgo,
      ),
      this.otpRequestRepo.countByIpSince(input.ip, hourAgo),
      this.otpRequestRepo.findLatestByDestination(
        destination.channel,
        destination.value,
      ),
    ]);

    const rateCheck = this.ledger.check({
      destinationCount24h,
      ipCount1h,
      lastAttemptAt: latest?.createdAt ?? null,
      now,
    });

    if (!rateCheck.allowed) {
      throw new SignInCodeRateLimitedError(rateCheck);
    }

    const code = destination.channel === SIGN_IN_CODE_CHANNELS.EMAIL && reservedAccount !== null
      ? OtpCode.create(reservedAccount.code)
      : OtpCode.create(this.crypto.generateSignInCode());
    const codeHash = this.crypto.hashCode(code.value);

    const record = await this.otpRequestRepo.create({
      purpose: Enums.SignInCodePurpose.SignIn,
      channel: destination.channel,
      destination: destination.value,
      codeHash,
      expiresAt: destination.expiresAt(now),
      userId: null,
      ip: input.ip,
    });

    if (destination.channel === SIGN_IN_CODE_CHANNELS.PHONE) {
      await this.otpSender.send({
        phone: destination.value,
        code: code.value,
        purpose: Enums.SignInCodePurpose.SignIn,
        locale: input.locale ?? "ru",
        requestId: record.id,
      });
    } else if (reservedAccount === null) {
      await this.emailCodeSender.enqueue({
        requestId: record.id,
        email: destination.value,
        code: code.value,
        locale: input.locale ?? "ru",
        purpose: Enums.SignInCodePurpose.SignIn,
      });
    }

    const result: RequestOtpResult = {
      requestId: record.id,
      resendInSeconds: rateCheck.resendInSeconds,
    };

    if (this.testMode) {
      result.testCode = code.value;
    }

    return result;
  }
}
