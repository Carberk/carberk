import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";

import { signInCodeDestination } from "../domain/SignInCodeDestination";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { VerifySignInCode } from "./VerifySignInCode";

export interface ConfirmContactPhoneCodeInput {
  userId: string;
  businessId?: string | undefined;
  phone: string;
  code: string;
}

/**
 * Checks and consumes the newest contact-phone code this seller requested for
 * the number (ADR-0081). A code of another purpose, or another seller's code,
 * answers as if none had been requested. Signs no one in and changes no
 * Sign-in Method.
 */
@Injectable()
export class ConfirmContactPhoneCode {
  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(VerifySignInCode)
    private readonly verifySignInCode: VerifySignInCode,
  ) {}

  async execute(input: ConfirmContactPhoneCodeInput): Promise<void> {
    const request = await this.verifySignInCode.execute({
      purpose: Enums.SignInCodePurpose.ListingContactPhone,
      destination: signInCodeDestination({ phone: input.phone }),
      code: input.code,
      userId: input.userId,
      ...(input.businessId ? { businessId: input.businessId } : {}),
    });

    // Claim the code before the caller records the confirmation, so two
    // concurrent confirmations consume it once.
    if (!(await this.otpRequestRepo.consumeIfUnused(request.id))) {
      throw new Error("OTP code has already been used");
    }
  }
}
