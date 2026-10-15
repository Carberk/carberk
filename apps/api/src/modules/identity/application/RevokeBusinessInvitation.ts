import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { BUSINESS_REPOSITORY, type BusinessRepository } from "../domain/ports/BusinessRepository";
import type { BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
@Injectable()
export class RevokeBusinessInvitation {
 constructor(@Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository, @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort) {}
 execute(input: BusinessSubject & { businessId: string; invitationId: string }) { return this.repository.revoke(input, this.clock.now()); }
}
