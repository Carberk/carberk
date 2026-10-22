import { BusinessAuthorityDenied } from "./ports/BusinessAuthorityPort";
export interface PublisherParticipant {
  userId: string; active: boolean;
  membership: { id: string; businessId: string; active: boolean; businessStatus: string; role: string } | null;
}
/** Nonacting publisher eligibility. This does not grant staff authority or create a Session. */
export function publisherParticipant(participant: PublisherParticipant | null, listing: { sellerId: string; businessId: string | null }): void {
  void participant; void listing;
  throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
}
