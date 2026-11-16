import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";
import { IDENTITY_TOKENS } from "../identity.tokens";

import type { User } from "../domain/User";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import {
  IDENTITY_ERROR_CODES,
  IdentityDomainError,
  SIGN_IN_CODE_CHANNELS,
} from "../domain/types";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { VerifySignInCode } from "./VerifySignInCode";

export type ConfirmSignInMethodChangeInput = (
  | { phone: string }
  | { email: string }
) & {
  userId: string;
  code: string;
};

@Injectable()
export class ConfirmSignInMethodChange {
  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: SignInMethodRepository,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
    @Inject(VerifySignInCode)
    private readonly verifySignInCode: VerifySignInCode,
  ) {}

  async execute(input: ConfirmSignInMethodChangeInput): Promise<User> {
    if (!(await this.userRepo.findById(input.userId))) {
      throw new Error("User not found");
    }

    const destination = signInCodeDestination(input);
    const request = await this.verifySignInCode.execute({
      purpose: Enums.SignInCodePurpose.SignInMethod,
      destination,
      code: input.code,
      userId: input.userId,
    });

    // Claim the code before any side effect, so concurrent confirmations
    // change the Sign-in Method once. The request is already bound to this
    // User, so the claim is the only write.
    if (!(await this.otpRequestRepo.consumeIfUnused(request.id))) {
      throw new Error("OTP code has already been used");
    }

    const owner = destination.channel === SIGN_IN_CODE_CHANNELS.PHONE
      ? await this.userRepo.findByPhone(destination.value)
      : await this.userRepo.findByEmail(destination.value);
    if (owner !== null && owner.id !== input.userId) {
      throw new IdentityDomainError(
        IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN,
        "Sign-in Method is already held by another User",
      );
    }

    return this.userRepo.replaceSignInMethod({
      userId: input.userId,
      channel: destination.channel,
      destination: destination.value,
      verifiedAt: this.clock.now(),
    });
  }
}
