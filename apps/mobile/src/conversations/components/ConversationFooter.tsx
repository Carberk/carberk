import type { ComponentProps } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ConversationsSchemas } from "@auto-tm/contracts";

import { MessageComposer } from "./MessageComposer";
import { TypingIndicator } from "./TypingIndicator";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** The one line shown in place of the composer for each closed case. */
const CLOSED_LINE_KEYS = {
  listing_unavailable: "closedListingUnavailable",
  chat_disabled: "closedChatDisabled",
  participant_unavailable: "closedParticipantUnavailable",
} as const;

interface ConversationFooterProps {
  isBlocked: boolean;
  /** From the loaded Conversation. `blocked_by_me` is `isBlocked`, which wins. */
  sendRestriction?: ConversationsSchemas.SendRestriction | null;
  unblockPending: boolean;
  onUnblock: () => void;
  peerTyping: boolean;
  /** Omitted when there is no signed-in viewer to send as. */
  composer?: ComponentProps<typeof MessageComposer>;
}

/**
 * Under the Messages: the typing indicator and composer, or, when the viewer
 * blocked the other participant, only the blocked banner with Unblock (#352 D3),
 * or, when the Conversation is closed to new Messages, one line (#352 Q3).
 * Blocked wins over the closed lines.
 */
export function ConversationFooter({
  isBlocked,
  sendRestriction,
  unblockPending,
  onUnblock,
  peerTyping,
  composer,
}: ConversationFooterProps) {
  const { t } = useTranslation();
  const { t: tConv } = useTranslation("conversations");

  if (isBlocked) {
    return (
      <View className="px-4 py-3 border-t border-border bg-muted">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">
              {t("blockedStateTitle")}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {t("blockedStateDescription")}
            </Text>
          </View>
          <Button
            variant="outline"
            className="h-11"
            onPress={onUnblock}
            disabled={unblockPending}
          >
            <Text>{t("blockedStateUnblock")}</Text>
          </Button>
        </View>
      </View>
    );
  }

  if (sendRestriction && sendRestriction !== "blocked_by_me") {
    return (
      <View
        className="px-4 py-3.5 border-t border-border bg-muted"
        testID="conversation-closed-footer"
        accessibilityLiveRegion="polite"
      >
        <Text className="text-center text-sm text-muted-foreground">
          {tConv(CLOSED_LINE_KEYS[sendRestriction])}
        </Text>
      </View>
    );
  }

  return (
    <>
      <TypingIndicator visible={peerTyping} />

      {composer && <MessageComposer {...composer} />}
    </>
  );
}
