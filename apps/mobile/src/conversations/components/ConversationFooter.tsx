import type { ComponentProps } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { MessageComposer } from "./MessageComposer";
import { TypingIndicator } from "./TypingIndicator";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

interface ConversationFooterProps {
  isBlocked: boolean;
  unblockPending: boolean;
  onUnblock: () => void;
  peerTyping: boolean;
  /** Omitted when there is no signed-in viewer to send as. */
  composer?: ComponentProps<typeof MessageComposer>;
}

/**
 * Under the Messages: the typing indicator and composer, or, when the viewer
 * blocked the other participant, only the blocked banner with Unblock (#352 D3).
 */
export function ConversationFooter({
  isBlocked,
  unblockPending,
  onUnblock,
  peerTyping,
  composer,
}: ConversationFooterProps) {
  const { t } = useTranslation();

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

  return (
    <>
      <TypingIndicator visible={peerTyping} />

      {composer && <MessageComposer {...composer} />}
    </>
  );
}
