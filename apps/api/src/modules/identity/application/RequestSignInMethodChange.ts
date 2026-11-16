import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";

import {
  OtpAttemptLedger,
  SIGN_IN_CODE_RATE_POLICY,
} from "../domain/OtpAttemptLedger";
import { OtpCode } from "../domain/OtpCode";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
import type { CredentialCryptoPort } from "../domain/ports/CredentialCryptoPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import { EMAIL_CODE_SENDER_PORT } from "../domain/ports/EmailCodeSenderPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { OtpSenderPort } from "../domain/ports/OtpSenderPort";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";

export type RequestSignInMethodChangeInput = (
  | { phone: string }
  | { email: string }
) & {
  userId: string;
  ip: string;
  locale?: "ru" | "tk" | "en";
};

export interface RequestSignInMethodChangeResult {
  requestId: string;
  resendInSeconds: number;
  testCode?: string;
}

@Injectable()
export class RequestSignInMethodChange {
  private readonly ledger = new OtpAttemptLedger(
    SIGN_IN_CODE_RATE_POLICY.destinationLimit,
    SIGN_IN_CODE_RATE_POLICY.ipLimit,
    SIGN_IN_CODE_RATE_POLICY.baseBackoffSeconds,
  );

  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: SignInMethodRepository,
    @Inject(IDENTITY_TOKENS.OtpSenderPort)
    private readonly otpSender: OtpSenderPort,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.OtpTestMode)
    private readonly testMode: boolean,
    @Inject(EMAIL_CODE_SENDER_PORT)
    private readonly emailCodeSender: EmailCodeSenderPort,
    @Inject(IDENTITY_TOKENS.CredentialCryptoPort)
    private readonly crypto: CredentialCryptoPort,
  ) {}

  async execute(
    input: RequestSignInMethodChangeInput,
  ): Promise<RequestSignInMethodChangeResult> {
    if (!(await this.userRepo.findById(input.userId))) {
      throw new Error("User not found");
    }

    const destination = signInCodeDestination(input);
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

    const code = OtpCode.create(this.crypto.generateSignInCode());
    const record = await this.otpRequestRepo.create({
      purpose: Enums.SignInCodePurpose.SignInMethod,
      channel: destination.channel,
      destination: destination.value,
      codeHash: this.crypto.hashCode(code.value),
      expiresAt: destination.expiresAt(now),
      userId: input.userId,
      ip: input.ip,
    });

    if (destination.channel === SIGN_IN_CODE_CHANNELS.PHONE) {
      await this.otpSender.send({
        phone: destination.value,
        code: code.value,
        purpose: Enums.SignInCodePurpose.SignInMethod,
        locale: input.locale ?? "ru",
        requestId: record.id,
      });
    } else {
      await this.emailCodeSender.enqueue({
        requestId: record.id,
        email: destination.value,
        code: code.value,
        locale: input.locale ?? "ru",
        purpose: Enums.SignInCodePurpose.SignInMethod,
      });
    }

    return {
      requestId: record.id,
      resendInSeconds: rateCheck.resendInSeconds,
      ...(this.testMode ? { testCode: code.value } : {}),
    };
  }
}
