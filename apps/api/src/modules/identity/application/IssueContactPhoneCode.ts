import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";

import { OtpCode } from "../domain/OtpCode";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
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
    const code = OtpCode.generate();
    const { record, resendInSeconds, smsDelivery } = await this.otpRequestRepo.reserve({
      purpose: Enums.SignInCodePurpose.ListingContactPhone,
      destination,
      codeHash: createHash("sha256").update(code.value).digest("hex"),
      userId: input.userId,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ip: input.ip,
    }, this.clock);

    await this.otpSender.send({
      smsDelivery,
      phone: destination.value,
      code: code.value,
      purpose: Enums.SignInCodePurpose.ListingContactPhone,
      locale: input.locale,
      requestId: record.id,
    });

    return {
      requestId: record.id,
      resendInSeconds,
      ...(this.testMode && smsDelivery.kind === "ordinary" ? { testCode: code.value } : {}),
    };
  }
}
