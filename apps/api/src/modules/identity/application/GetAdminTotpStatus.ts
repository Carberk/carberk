import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import { Inject, Injectable } from "@nestjs/common";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { ClockPort } from "../domain/ports/ClockPort";
import { PrismaTotpEnrollmentRepository } from "../infrastructure/PrismaTotpEnrollmentRepository";
import { PrismaSessionRepository } from "../infrastructure/PrismaSessionRepository";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";

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
    @Inject(PrismaTotpEnrollmentRepository)
    private readonly totpRepo: TotpEnrollmentRepository,
    @Inject(PrismaSessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(SystemClockAdapter)
    private readonly clock: ClockPort,
  ) {}

  async execute(input: GetAdminTotpStatusInput): Promise<GetAdminTotpStatusResult> {
    const enrollment = await this.totpRepo.findByUserId(input.userId);
    const enrolled = enrollment?.verifiedAt != null;

    const session = await this.sessionRepo.findById(input.sessionId);
    const now = this.clock.now();
    if (!session || session.userId !== input.userId || session.expiresAt <= now) throw new StaffAuthorityDenied("SESSION_REQUIRED");
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
