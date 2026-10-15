import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { BUSINESS_REPOSITORY, type BusinessRepository , BUSINESS_INVITATION_TOKENS, type BusinessInvitationTokens } from "../domain/ports/BusinessRepository";
import type { BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
@Injectable()
export class RedeemBusinessInvitation {
 constructor(@Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository, @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort, @Inject(BUSINESS_INVITATION_TOKENS) private readonly tokens: BusinessInvitationTokens) {}
 execute(input: BusinessSubject & { token: string }) { return this.repository.redeem({ userId: input.userId, sessionId: input.sessionId, tokenHash: this.tokens.hash(input.token) }, this.clock.now()); }
}
