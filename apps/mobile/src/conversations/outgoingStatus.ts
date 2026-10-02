/** How far the viewer's own Message got: one tick for sent, two for delivered or read. */
export type OutgoingStatus = "sent" | "delivered" | "read";

/**
 * The status of a Message the viewer sent, from the other participant's read and
 * delivery watermarks. Shared by the Messages row tick and the Conversation's bubbles.
 */
export function outgoingStatus(
  messageCreatedAt: string,
  peerLastReadAt?: string,
  peerLastDeliveredAt?: string,
): OutgoingStatus {
  const created = new Date(messageCreatedAt).getTime();
  if (peerLastReadAt && new Date(peerLastReadAt).getTime() >= created) {
    return "read";
  }
  if (peerLastDeliveredAt && new Date(peerLastDeliveredAt).getTime() >= created) {
    return "delivered";
  }
  return "sent";
}
