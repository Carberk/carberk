import { View } from "react-native";
import * as Linking from "expo-linking";
import { ArrowLeft, BellOff, MoreHorizontal, Phone } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import type { ConversationDetail } from "../../api/conversations/useConversation";
import { usePeerName } from "../usePeerName";

import { PeerPresenceLabel, type PeerPresence } from "./PeerPresenceLabel";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ConversationHeaderProps {
  /** Undefined until the Conversation arrives, or when it failed to load. */
  conversation: ConversationDetail | undefined;
  /** Skeletons stand in for the participant while true. */
  loading: boolean;
  presence: PeerPresence;
  /** The Listing contact phone; Call is shown only when present. */
  callPhone?: string;
  isMuted: boolean;
  isBlocked: boolean;
  muteDisabled?: boolean;
  onBack: () => void;
  onToggleMute: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}

export function ConversationHeader({
  conversation,
  loading,
  presence,
  callPhone,
  isMuted,
  isBlocked,
  muteDisabled = false,
  onBack,
  onToggleMute,
  onBlock,
  onUnblock,
}: ConversationHeaderProps) {
  const { t, i18n } = useTranslation();
  const { t: tConv } = useTranslation("conversations");
  const peerName = usePeerName(conversation);

  const handleCall = async () => {
    if (!callPhone) return;
    const url = `tel:${callPhone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  return (
    <View className="flex-row items-center gap-2 px-2 py-2 border-b border-border bg-background">
      <Button
        variant="ghost"
        className="h-11 w-11"
        size="icon"
        onPress={onBack}
        accessibilityLabel={t("goBack")}
      >
        <Icon as={ArrowLeft} className="size-5 text-foreground" />
      </Button>

      {conversation && peerName ? (
        <>
          <View
            className="h-9 w-9 items-center justify-center rounded-full bg-muted"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className="text-base font-bold text-foreground">
              {peerName.charAt(0).toLocaleUpperCase(i18n.language)}
            </Text>
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-1.5">
              <Text
                className="shrink text-base font-semibold text-foreground"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {peerName}
              </Text>
              {isMuted && (
                <View accessible accessibilityLabel={t("conversationMuted")}>
                  <Icon as={BellOff} className="size-4 text-muted-foreground" />
                </View>
              )}
            </View>
            <PeerPresenceLabel presence={presence} locale={i18n.language} />
          </View>
        </>
      ) : loading ? (
        <View className="flex-1 flex-row items-center gap-2" testID="conversation-header-skeleton">
          <Skeleton className="h-9 w-9 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </View>
        </View>
      ) : (
        <View className="flex-1" />
      )}

      {callPhone && (
        <Button
          variant="ghost"
          className="h-11 w-11"
          size="icon"
          onPress={handleCall}
          accessibilityLabel={tConv("callSeller")}
        >
          <Icon as={Phone} className="size-5 text-foreground" />
        </Button>
      )}

      {conversation && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-11 w-11"
              size="icon"
              accessibilityLabel={tConv("conversationMenu")}
            >
              <Icon as={MoreHorizontal} className="size-5 text-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onPress={onToggleMute} disabled={muteDisabled}>
              <Text>
                {isMuted ? t("unmuteConversation") : t("muteConversation")}
              </Text>
            </DropdownMenuItem>
            {isBlocked ? (
              <DropdownMenuItem onPress={onUnblock}>
                <Text>{t("unblockUser")}</Text>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onPress={onBlock}>
                <Text>{t("blockUser")}</Text>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </View>
  );
}
