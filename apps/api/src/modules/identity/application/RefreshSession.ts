import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { PrismaSessionRepository } from "../infrastructure/PrismaSessionRepository";
import { RefreshTokenDigestAdapter } from "../infrastructure/RefreshTokenDigestAdapter";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";

import { UserSuspendedError } from "../domain/UserSuspendedError";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";
import { IDENTITY_TOKENS } from "../identity.tokens";

const REFRESH_TTL_DAYS = 30;

export interface RefreshSessionInput {
  refreshToken: string;
}

export interface RefreshSessionResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RefreshSession {
  constructor(
    @Inject(PrismaSessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(RefreshTokenDigestAdapter)
    private readonly hasher: RefreshTokenHasherPort,
    @Inject(SystemClockAdapter)
    private readonly clock: ClockPort,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  async execute(input: RefreshSessionInput): Promise<RefreshSessionResult> {
    const lookup = await this.sessionRepo.findByRefreshToken(input.refreshToken);
    if (!lookup) {
      throw new Error("Invalid refresh token");
    }

    const now = this.clock.now();
    if (lookup.session.expiresAt < now) {
      throw new Error("Session expired");
    }

    if (await this.identityCheck.isSuspended(lookup.userId)) {
      throw new UserSuspendedError();
    }

    const newRefreshToken = randomBytes(32).toString("hex");
    const newHash = await this.hasher.hash(newRefreshToken);
    const newExpiresAt = new Date(
      now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const rotated = await this.sessionRepo.rotateRefreshToken(
      lookup.session.id,
      lookup.session.refreshTokenHash,
      newHash,
      now,
      newExpiresAt,
    );

    if (!rotated) {
      throw new Error("Token already used");
    }

    const accessToken = this.jwtService.sign({
      sub: lookup.userId,
      sid: lookup.session.id,
      phone: lookup.phone,
      email: lookup.email,
      role: lookup.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }
}
