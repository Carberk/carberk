import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";

import { OtpCode } from "../domain/OtpCode";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import { EMAIL_CODE_SENDER_PORT } from "../domain/ports/EmailCodeSenderPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { OtpSenderPort } from "../domain/ports/OtpSenderPort";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { HttpOtpSenderAdapter } from "../infrastructure/HttpOtpSenderAdapter";
import { PrismaOtpRequestRepository } from "../infrastructure/PrismaOtpRequestRepository";
import { PrismaUserRepository } from "../infrastructure/PrismaUserRepository";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";

export type RequestAccountDeletionInput = (
  | { phone: string }
  | { email: string }
) & {
  ip: string;
  locale?: "ru" | "tk" | "en";
};

export interface RequestAccountDeletionResult {
  requestId: string;
  resendInSeconds: number;
  testCode?: string;
}

/**
 * Public web deletion request (ADR-0054). Always issues a real code, so the
 * answer is the same whether or not a User holds the value and reviewer
 * fixed codes never apply. The code is bound to the current holder, if any,
 * so it can only confirm deletion of that User.
 */
@Injectable()
export class RequestAccountDeletion {
  constructor(
    @Inject(PrismaOtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(PrismaUserRepository)
    private readonly userRepo: SignInMethodRepository,
    @Inject(HttpOtpSenderAdapter)
    private readonly otpSender: OtpSenderPort,
    @Inject(SystemClockAdapter)
    private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.OtpTestMode)
    private readonly testMode: boolean,
    @Inject(EMAIL_CODE_SENDER_PORT)
    private readonly emailCodeSender: EmailCodeSenderPort,
  ) {}

  async execute(
    input: RequestAccountDeletionInput,
  ): Promise<RequestAccountDeletionResult> {
    const destination = signInCodeDestination(input);
    const holder = destination.channel === SIGN_IN_CODE_CHANNELS.PHONE
      ? await this.userRepo.findByPhone(destination.value)
      : await this.userRepo.findByEmail(destination.value);

    const code = OtpCode.generate();
    const { record, resendInSeconds, smsDelivery } = await this.otpRequestRepo.reserve({
      purpose: Enums.SignInCodePurpose.AccountDeletion,
      destination,
      codeHash: createHash("sha256").update(code.value).digest("hex"),
      userId: holder?.id ?? null,
      ip: input.ip,
    }, this.clock);

    if (destination.channel === SIGN_IN_CODE_CHANNELS.PHONE) {
      await this.otpSender.send({
        smsDelivery,
        phone: destination.value,
        code: code.value,
        purpose: Enums.SignInCodePurpose.AccountDeletion,
        locale: input.locale ?? "ru",
        requestId: record.id,
      });
    } else {
      await this.emailCodeSender.enqueue({
        requestId: record.id,
        email: destination.value,
        code: code.value,
        locale: input.locale ?? "ru",
        purpose: Enums.SignInCodePurpose.AccountDeletion,
      });
    }

    return {
      requestId: record.id,
      resendInSeconds,
      ...(this.testMode ? { testCode: code.value } : {}),
    };
  }
}
