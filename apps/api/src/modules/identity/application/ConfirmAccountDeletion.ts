import { Inject, Injectable } from "@nestjs/common";
import { Enums } from "@auto-tm/contracts";
import { IDENTITY_TOKENS } from "../identity.tokens";

import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { SIGN_IN_CODE_CHANNELS } from "../domain/types";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import { DeleteMe } from "./DeleteMe";
import { VerifySignInCode } from "./VerifySignInCode";

export type ConfirmAccountDeletionInput = (
  | { phone: string }
  | { email: string }
) & {
  code: string;
};

/**
 * Confirms a public web deletion code (ADR-0054). For a held value it starts
 * the same grace period as `DELETE /me`; for an unheld value it only consumes
 * the code. Both outcomes return nothing, so callers cannot tell them apart.
 */
@Injectable()
export class ConfirmAccountDeletion {
  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: SignInMethodRepository,
    @Inject(VerifySignInCode)
    private readonly verifySignInCode: VerifySignInCode,
    @Inject(DeleteMe)
    private readonly deleteMe: DeleteMe,
  ) {}

  async execute(input: ConfirmAccountDeletionInput): Promise<void> {
    const destination = signInCodeDestination(input);

    // The latest request is checked the same way whether or not a User holds
    // the value, so wrong-code attempts cannot reveal ownership.
    const request = await this.verifySignInCode.execute({
      purpose: Enums.SignInCodePurpose.AccountDeletion,
      destination,
      code: input.code,
    });

    const holder = destination.channel === SIGN_IN_CODE_CHANNELS.PHONE
      ? await this.userRepo.findByPhone(destination.value)
      : await this.userRepo.findByEmail(destination.value);

    // Only a code issued for this holder counts. This rejects codes issued
    // while another User held the value, or while nobody did.
    if (request.userId !== (holder?.id ?? null)) {
      throw new Error("Invalid OTP code");
    }

    if (!(await this.otpRequestRepo.consumeIfUnused(request.id))) {
      throw new Error("OTP code has already been used");
    }

    if (holder !== null) {
      await this.deleteMe.execute({ userId: holder.id });
    }
  }
}
