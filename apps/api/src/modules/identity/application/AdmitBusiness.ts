import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { BUSINESS_REPOSITORY, type BusinessRepository , BUSINESS_INVITATION_TOKENS, type BusinessInvitationTokens } from "../domain/ports/BusinessRepository";
import type { BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import type { BusinessSchemas } from "@auto-tm/contracts";
@Injectable()
export class AdmitBusiness {
 constructor(@Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository, @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort, @Inject(BUSINESS_INVITATION_TOKENS) private readonly tokens: BusinessInvitationTokens) {}
 async execute(input: BusinessSubject & BusinessSchemas.AdmitBusinessInput) {
  const now = this.clock.now();
  const token = this.tokens.issue();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const result = await this.repository.admit({ ...input, tokenHash: this.tokens.hash(token), expiresAt }, now);
  return { ...result, token, expiresAt: expiresAt.toISOString() };
 }
}
