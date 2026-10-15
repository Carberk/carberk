import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { STAFF_AUTHORITY_REPOSITORY, type StaffAuthorityRepository } from "../domain/ports/StaffAuthorityRepository";
import { StaffSchemas } from "@auto-tm/contracts";
import { assertCurrentStaffSession, assertStaffElevation } from "../domain/staffPolicy";
import { StaffAuthorityDenied, type StaffAuthorityPort, type StaffSubject, type StaffSummary } from "../domain/ports/StaffAuthorityPort";
@Injectable()
export class CheckStaffAuthority implements StaffAuthorityPort {
  constructor(@Inject(STAFF_AUTHORITY_REPOSITORY) private readonly repository: StaffAuthorityRepository,
    @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort) {}
  async authorize(input: StaffSubject & { capability: string }, transaction?: unknown): Promise<void> {
    const actor = await this.repository.current(input, transaction);
    const now = this.clock.now();
    assertCurrentStaffSession(actor, input, now);
    if (!StaffSchemas.StaffCapabilitySchema.safeParse(input.capability).success || !actor.capabilities.includes(input.capability)) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED");
    assertStaffElevation(actor, now);
  }
  async summary(input: StaffSubject): Promise<StaffSummary> {
    const actor = await this.repository.current(input);
    const now = this.clock.now();
    assertCurrentStaffSession(actor, input, now);
    const capabilities = actor.capabilities.filter((capability) => StaffSchemas.StaffCapabilitySchema.safeParse(capability).success).sort();
    if (actor.role !== "admin" && !capabilities.length) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED");
    return { capabilities, elevated: !!actor.elevatedUntil && actor.elevatedUntil > now,
      ...(actor.elevatedUntil ? { adminTotpExpiresAt: actor.elevatedUntil.toISOString() } : {}) };
  }
}
