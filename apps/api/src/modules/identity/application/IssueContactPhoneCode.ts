import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";

import {
  OtpAttemptLedger,
  SIGN_IN_CODE_RATE_POLICY,
} from "../domain/OtpAttemptLedger";
import { OtpCode } from "../domain/OtpCode";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import type { ContactPhoneCodeSent } from "../domain/ports/ContactPhoneCodePort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { OtpSenderPort } from "../domain/ports/OtpSenderPort";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { HttpOtpSenderAdapter } from "../infrastructure/HttpOtpSenderAdapter";

export interface IssueContactPhoneCodeInput {
  userId: string;
  businessId?: string | undefined;
  phone: string;
  ip: string;
  locale: "ru" | "tk" | "en";
}

/**
 * Sends a Listing contact-phone code (ADR-0081). The code is bound to the
 * seller and the contact-phone purpose, so it never signs anyone in. It counts
 * against the same per-number and per-IP budgets as every other code, and the
 * reviewer bypass never applies: a reviewer uses their account phone, which
 * needs no code.
 */
@Injectable()
export class IssueContactPhoneCode {
  private readonly ledger = new OtpAttemptLedger(
    SIGN_IN_CODE_RATE_POLICY.destinationLimit,
    SIGN_IN_CODE_RATE_POLICY.ipLimit,
    SIGN_IN_CODE_RATE_POLICY.baseBackoffSeconds,
  );

  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(HttpOtpSenderAdapter)
    private readonly otpSender: OtpSenderPort,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.OtpTestMode)
    private readonly testMode: boolean,
  ) {}

  async execute(input: IssueContactPhoneCodeInput): Promise<ContactPhoneCodeSent> {
    const destination = signInCodeDestination({ phone: input.phone });
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

    const code = OtpCode.generate();
    const record = await this.otpRequestRepo.create({
      purpose: Enums.SignInCodePurpose.ListingContactPhone,
      channel: destination.channel,
      destination: destination.value,
      codeHash: createHash("sha256").update(code.value).digest("hex"),
      expiresAt: destination.expiresAt(now),
      userId: input.userId,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ip: input.ip,
    });

    await this.otpSender.send({
      phone: destination.value,
      code: code.value,
      purpose: Enums.SignInCodePurpose.ListingContactPhone,
      locale: input.locale,
      requestId: record.id,
    });

    return {
      requestId: record.id,
      resendInSeconds: rateCheck.resendInSeconds,
      ...(this.testMode ? { testCode: code.value } : {}),
    };
  }
}
