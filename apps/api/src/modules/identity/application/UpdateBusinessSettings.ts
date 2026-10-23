import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { BUSINESS_REPOSITORY, type BusinessRepository } from "../domain/ports/BusinessRepository";
import type { BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import type { BusinessSchemas } from "@auto-tm/contracts";
@Injectable()
export class UpdateBusinessSettings {
 constructor(@Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository, @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort) {}
 execute(input: BusinessSubject & BusinessSchemas.BusinessSettingsInput & { businessId: string }) { return this.repository.settings(input, this.clock.now()); }
}
