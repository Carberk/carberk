import { Inject, Injectable } from "@nestjs/common";
import type { CredentialCryptoPort } from "../domain/ports/CredentialCryptoPort";
import type { AccessTokenSignerPort } from "../domain/ports/AccessTokenSignerPort";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";
import type { ClockPort } from "../domain/ports/ClockPort";

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
    @Inject(IDENTITY_TOKENS.SessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(IDENTITY_TOKENS.RefreshTokenHasherPort)
    private readonly hasher: RefreshTokenHasherPort,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
    @Inject(IDENTITY_TOKENS.AccessTokenSignerPort)
    private readonly jwtService: AccessTokenSignerPort,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(IDENTITY_TOKENS.CredentialCryptoPort)
    private readonly crypto: CredentialCryptoPort,
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

    const newRefreshToken = this.crypto.generateRefreshToken();
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
