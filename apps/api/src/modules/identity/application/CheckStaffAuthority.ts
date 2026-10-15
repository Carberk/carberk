import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { STAFF_AUTHORITY_REPOSITORY, type StaffAuthorityRepository } from "../domain/ports/StaffAuthorityRepository";
import { StaffAuthorityDenied, type StaffAuthorityPort, type StaffSubject, type StaffSummary } from "../domain/ports/StaffAuthorityPort";
@Injectable()
export class CheckStaffAuthority implements StaffAuthorityPort {
  constructor(@Inject(STAFF_AUTHORITY_REPOSITORY) private readonly repository: StaffAuthorityRepository,
    @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort) {}
  async authorize(_input: StaffSubject & { capability: string }): Promise<void> { throw new StaffAuthorityDenied("CAPABILITY_REQUIRED"); }
  async summary(_input: StaffSubject): Promise<StaffSummary> { return { capabilities: [], elevated: false }; }
}
