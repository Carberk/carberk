import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminSessionElevationPort,
  AdminSessionElevationResult,
} from "../domain/ports/AdminSessionElevationPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";

@Injectable()
export class CheckAdminSessionElevation implements AdminSessionElevationPort {
  constructor(
    @Inject(IDENTITY_TOKENS.SessionRepository)
    private readonly sessions: SessionRepository,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
  ) {}

  async check(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<AdminSessionElevationResult> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.userId !== input.userId) {
      return "session-required";
    }

    const now = this.clock.now();
    if (session.expiresAt <= now) {
      return "session-expired";
    }
    if (!session.adminTotpExpiresAt || session.adminTotpExpiresAt <= now) {
      return "elevation-expired";
    }
    return "elevated";
  }
}
