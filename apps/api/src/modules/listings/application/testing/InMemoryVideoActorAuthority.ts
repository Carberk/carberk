import type { BusinessAuthorityPort, BusinessPrincipal, BusinessSubject } from "../../../identity/identity.public";

export class InMemoryVideoActorAuthority implements BusinessAuthorityPort {
  active = true;
  async resolve(input: BusinessSubject): Promise<BusinessPrincipal> {
    if (!this.active || !input.sessionId) throw new Error("SESSION_REQUIRED");
    return { kind: "personal", userId: input.userId };
  }
  async authorize(input: BusinessSubject & { businessId: string }): Promise<Extract<BusinessPrincipal, { kind: "business" }>> {
    await this.resolve(input);
    return { kind: "business", userId: input.userId, businessId: input.businessId, membershipId: "synthetic", role: "owner", status: "active" };
  }
}
