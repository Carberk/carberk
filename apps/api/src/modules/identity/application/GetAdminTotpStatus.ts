import { Inject, Injectable } from "@nestjs/common";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { ClockPort } from "../domain/ports/ClockPort";
import { IDENTITY_TOKENS } from "../identity.tokens";

export interface GetAdminTotpStatusInput {
  userId: string;
  sessionId: string;
}

export interface GetAdminTotpStatusResult {
  enrolled: boolean;
  elevated: boolean;
  adminTotpExpiresAt?: string;
}

@Injectable()
export class GetAdminTotpStatus {
  constructor(
    @Inject(IDENTITY_TOKENS.TotpEnrollmentRepository)
    private readonly totpRepo: TotpEnrollmentRepository,
    @Inject(IDENTITY_TOKENS.SessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
  ) {}

  async execute(input: GetAdminTotpStatusInput): Promise<GetAdminTotpStatusResult> {
    const enrollment = await this.totpRepo.findByUserId(input.userId);
    const enrolled = enrollment?.verifiedAt != null;

    const session = await this.sessionRepo.findById(input.sessionId);
    const now = this.clock.now();
    const elevated =
      session != null &&
      session.adminTotpExpiresAt != null &&
      session.adminTotpExpiresAt > now;

    const result: GetAdminTotpStatusResult = {
      enrolled,
      elevated,
    };

    if (session?.adminTotpExpiresAt != null) {
      result.adminTotpExpiresAt = session.adminTotpExpiresAt.toISOString();
    }

    return result;
  }
}
