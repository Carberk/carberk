import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";
import { BUSINESS_AUTHORITY_REPOSITORY, type BusinessAuthorityRepository } from "../domain/ports/BusinessAuthorityRepository";
import { BusinessAuthorityDenied, type BusinessAuthorityPort, type BusinessPrincipal, type BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
@Injectable()
export class CheckBusinessAuthority implements BusinessAuthorityPort {
 constructor(@Inject(BUSINESS_AUTHORITY_REPOSITORY) private readonly repository: BusinessAuthorityRepository,
 @Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort) {}
 async resolve(input: BusinessSubject & { businessId?: string }): Promise<BusinessPrincipal> {
  const current = await this.repository.current(input);
  if (!current || current.userId !== input.userId || current.expiresAt <= this.clock.now()) throw new BusinessAuthorityDenied("SESSION_REQUIRED");
  if (current.suspended || current.deleting) throw new BusinessAuthorityDenied("USER_INACTIVE");
  if (!input.businessId) return { kind: "personal", userId: input.userId };
  const member = current.membership;
  if (!member || member.businessId !== input.businessId || !member.active) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
  return { kind: "business", userId: input.userId, businessId: member.businessId, membershipId: member.id, role: member.role, status: member.status };
 }
 async authorize(input: BusinessSubject & { businessId: string; owner?: boolean; history?: boolean }) {
  const principal = await this.resolve(input);
  if (principal.kind !== "business") throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
  if (!input.history && principal.status !== "active") throw new BusinessAuthorityDenied("BUSINESS_INACTIVE");
  if (input.owner && principal.role !== "owner") throw new BusinessAuthorityDenied("OWNER_REQUIRED");
  return principal;
 }
}
