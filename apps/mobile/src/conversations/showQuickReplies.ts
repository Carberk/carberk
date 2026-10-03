import type { ConversationsSchemas, Enums } from "@auto-tm/contracts";

import { isClosedForContact } from "@/src/listings/detail/closedListing";

export interface QuickRepliesInput {
  /** The loaded Conversation; `sendRestriction` is undefined until the read by ID answers. */
  conversation:
    | {
        myRole: ConversationsSchemas.ParticipantRole;
        sellerId: string;
        sendRestriction?: ConversationsSchemas.SendRestriction | null;
        listing?: { status: Enums.ListingStatus } | null;
      }
    | undefined;
  /** Every loaded Message, server and local. */
  messages: readonly { senderId: string }[];
  /** Older history exists that has not been loaded yet. */
  hasOlderMessages: boolean;
  loading: boolean;
  failed: boolean;
  /** The viewer has blocked the other participant. */
  blocked: boolean;
}

/**
 * Quick replies are for the buyer until the seller sends a Message (D7). They
 * are hidden whenever the buyer cannot send, and while any of that is unknown.
 * They are not offered for a sold or removed-from-sale Listing: the buyer can
 * still write, but there is nothing left to ask about (#352 D1).
 */
export function showQuickReplies({
  conversation,
  messages,
  hasOlderMessages,
  loading,
  failed,
  blocked,
}: QuickRepliesInput): boolean {
  if (!conversation || loading || failed || blocked) return false;
  if (conversation.myRole !== "buyer") return false;
  if (conversation.sendRestriction !== null) return false;
  if (conversation.listing && isClosedForContact(conversation.listing.status)) return false;
  // A seller Message could be in the history not loaded yet.
  if (hasOlderMessages) return false;
  return !messages.some((message) => message.senderId === conversation.sellerId);
}
