import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { InvalidSignInCodeError } from "../domain/InvalidSignInCodeError";
import type { OtpRequest, SignInCodePurpose } from "../domain/OtpRequest";
import type { SignInCodeDestination } from "../domain/SignInCodeDestination";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { ClockPort } from "../domain/ports/ClockPort";
import { IDENTITY_TOKENS } from "../identity.tokens";

const MAX_ATTEMPTS = 5;

@Injectable()
export class VerifySignInCode {
  constructor(
    @Inject(IDENTITY_TOKENS.OtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
  ) {}

  /**
   * Checks the newest code issued for `purpose` (ADR-0081). A code of another
   * purpose is invisible here, so it answers as if no code had been requested
   * and keeps its attempts.
   */
  async execute(input: {
    purpose: SignInCodePurpose;
    destination: SignInCodeDestination;
    code: string;
    userId?: string;
    businessId?: string | undefined;
  }): Promise<OtpRequest> {
    const { destination, code } = input;
    const request = await this.otpRequestRepo.findLatestForPurpose({
      purpose: input.purpose,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      channel: destination.channel,
      destination: destination.value,
      ...(input.userId === undefined ? {} : { userId: input.userId }),
    });
    if (!request) throw new Error("No Sign-in Code request found");
    if (request.verifiedAt !== null) {
      throw new Error("OTP code has already been used");
    }
    if (request.expiresAt < this.clock.now()) {
      throw new Error("OTP code has expired");
    }
    if (request.attempts >= MAX_ATTEMPTS) {
      throw new Error("Too many attempts");
    }

    const codeHash = createHash("sha256").update(code).digest("hex");
    if (request.codeHash === codeHash) return request;

    await this.otpRequestRepo.incrementAttempts(request.id);
    if (request.attempts + 1 >= MAX_ATTEMPTS) {
      throw new Error("Too many attempts");
    }
    throw new InvalidSignInCodeError(MAX_ATTEMPTS - (request.attempts + 1));
  }
}
