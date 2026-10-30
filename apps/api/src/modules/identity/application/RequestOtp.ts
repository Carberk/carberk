import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";
import { createHash, randomUUID } from "node:crypto";

import { OtpCode } from "../domain/OtpCode";
import { findReviewerAccount } from "../domain/ReviewerSignIn";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
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
import { PrismaOtpRequestRepository } from "../infrastructure/PrismaOtpRequestRepository";
import { HttpOtpSenderAdapter } from "../infrastructure/HttpOtpSenderAdapter";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";

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
  constructor(
    @Inject(PrismaOtpRequestRepository) private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(HttpOtpSenderAdapter) private readonly otpSender: OtpSenderPort,
    @Inject(SystemClockAdapter) private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.OtpTestMode) private readonly testMode: boolean,
    @Inject(EMAIL_CODE_SENDER_PORT)
    private readonly emailCodeSender: EmailCodeSenderPort,
    @Inject(REVIEWER_OTP_BYPASS_CONFIG)
    private readonly reviewerBypassConfig: ReviewerOtpBypassConfig,
    @Inject(CONSTANT_TIME_COMPARATOR_PORT)
    private readonly constantTimeComparator: ConstantTimeComparatorPort,
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
      return { requestId: randomUUID(), resendInSeconds: 0 };
    }

    const code = destination.channel === SIGN_IN_CODE_CHANNELS.EMAIL && reservedAccount !== null
      ? OtpCode.create(reservedAccount.code)
      : OtpCode.generate();
    const codeHash = createHash("sha256").update(code.value).digest("hex");

    const { record, resendInSeconds, smsDelivery } = await this.otpRequestRepo.reserve({
      purpose: Enums.SignInCodePurpose.SignIn,
      destination,
      codeHash,
      userId: null,
      ip: input.ip,
    }, this.clock);

    if (destination.channel === SIGN_IN_CODE_CHANNELS.PHONE) {
      await this.otpSender.send({
        smsDelivery,
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
      resendInSeconds,
    };

    if (this.testMode) {
      result.testCode = code.value;
    }

    return result;
  }
}
