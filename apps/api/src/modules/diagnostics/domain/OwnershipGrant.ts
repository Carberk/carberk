/** Source permission is separate from staff observation and publication authority. */
export interface OwnershipSource {
  listingId: string; identityDigest: string; sellerId: string; commissionerId: string;
  businessId: string | null; membershipId: string | null;
}
export interface OwnershipGrantor {
  id: string; active: boolean;
  membership: { id: string; businessId: string; role: string; active: boolean; businessActive: boolean } | null;
}
export interface OwnershipGrantBinding {
  orderId: string; state: string; listingId: string | null; identityDigest: string | null;
  sellerId: string | null; commissionerId: string | null; businessId: string | null; membershipId: string | null;
  grantorId: string | null; grantorMembershipId: string | null; rightsUntil: Date | null; erasedAt: Date | null;
}
export function ownershipGrantAuthority(actor: OwnershipGrantor, source: OwnershipSource): boolean {
  if (!actor.active) return false;
  if (!source.businessId) return actor.id === source.sellerId && source.membershipId === null;
  const member = actor.membership;
  return !!source.membershipId && !!member && member.businessId === source.businessId && member.active && member.businessActive && member.role === "owner";
}
export function compatibleOwnershipGrant(grant: OwnershipGrantBinding, orderId: string, source: OwnershipSource, actor: OwnershipGrantor, now: Date): boolean {
  return grant.state === "available" && !grant.erasedAt && !!grant.rightsUntil && grant.rightsUntil > now && grant.orderId === orderId &&
    grant.grantorId === actor.id && ownershipGrantAuthority(actor, source) && grant.grantorMembershipId === (source.businessId ? actor.membership?.id : null) &&
    grant.listingId === source.listingId && grant.identityDigest === source.identityDigest && grant.sellerId === source.sellerId &&
    grant.commissionerId === source.commissionerId && grant.businessId === source.businessId && grant.membershipId === source.membershipId;
}
