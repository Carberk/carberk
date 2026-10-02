import { useTranslation } from "react-i18next";

import type { ConversationSummaryData } from "../api/conversations/useConversation";

/** The name shown for the other participant, with the role fallback when they have none. */
export function usePeerName(conversation: ConversationSummaryData | undefined) {
  const { t } = useTranslation();
  const { t: tConv } = useTranslation("conversations");
  if (!conversation) return undefined;
  const displayName = conversation.peer.displayName?.trim();
  if (displayName) return displayName;
  // The viewer's peer is the seller when the viewer is the buyer.
  return conversation.myRole === "buyer" ? t("privateSeller") : tConv("peerBuyer");
}
