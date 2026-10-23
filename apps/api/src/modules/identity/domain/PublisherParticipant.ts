import { BusinessAuthorityDenied } from "./ports/BusinessAuthorityPort";
export interface PublisherParticipant {
  userId: string; active: boolean;
  membership: { id: string; businessId: string; active: boolean; businessStatus: string; role: string } | null;
}
/** Nonacting publisher eligibility. This does not grant staff authority or create a Session. */
export function publisherParticipant(participant: PublisherParticipant | null, listing: { sellerId: string; businessId: string | null }): void {
  if (!participant?.active) throw new BusinessAuthorityDenied("USER_INACTIVE");
  if (!listing.businessId) {
    if (participant.userId !== listing.sellerId) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
    return;
  }
  const member = participant.membership;
  if (!member?.active || member.businessId !== listing.businessId) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
  if (member.businessStatus !== "active") throw new BusinessAuthorityDenied("BUSINESS_INACTIVE");
}
