export const PUBLISHER_BINDING_PORT = "IDENTITY_PUBLISHER_BINDING_PORT";
/** Complete transaction participants, including acting staff. Identity discovers their current
 * businesses while all Users are locked, before acquiring any Business lock. */
export interface PublisherParticipants { userIds: string[]; businessIds: string[] }
export interface PublisherBinding {
  userId: string; sellerId: string; businessId: string | null; membershipId: string | null; generation: string;
}
export interface PublisherBindingPort {
  /** Call once, before any authority or feature lock. Discovery grants no authority. */
  lock(participants: PublisherParticipants, transaction: unknown): Promise<PublisherParticipants>;
  /** Re-read current nonacting publisher eligibility. No Session or diagnostic staff power. */
  bind(input: { userId: string; sellerId: string; businessId: string | null }, locked: PublisherParticipants, transaction: unknown): Promise<PublisherBinding>;
}
