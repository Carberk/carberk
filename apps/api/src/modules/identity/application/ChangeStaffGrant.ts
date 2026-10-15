import { Inject, Injectable } from "@nestjs/common";
import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import { assertStaffGrantChange } from "../domain/staffPolicy";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { STAFF_AUTHORITY_REPOSITORY, type StaffAuthorityRepository, type StaffGrantChange } from "../domain/ports/StaffAuthorityRepository";
@Injectable()
export class ChangeStaffGrant {
  constructor(@Inject(STAFF_AUTHORITY_REPOSITORY) private readonly repository: StaffAuthorityRepository,
    @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort) {}
  async execute(input: StaffGrantChange): Promise<void> {
    const now = this.clock.now();
    const actor = await this.repository.current(input);
    if (!actor) throw new StaffAuthorityDenied("SESSION_REQUIRED");
    assertStaffGrantChange(actor, input, now);
    // The adapter repeats authorization under the transition locks. A read here
    // cannot establish authority for a later commit after concurrent revocation.
    await this.repository.change(input, now);
  }
}
