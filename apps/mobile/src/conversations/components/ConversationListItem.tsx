import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Enums } from "@auto-tm/contracts";
import { BellOff, Car, Check, CheckCheck, Image as ImageIcon, Trash2, type LucideIcon } from "lucide-react-native";

import {
  seedConversationDetail,
  type ConversationSummaryData,
} from "../../api/conversations/useConversation";
import { outgoingStatus } from "../outgoingStatus";
import { usePeerName } from "../usePeerName";

import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { buildVariantUrl } from "@/src/listings/detail/buildVariantUrl";
import { formatPrice } from "@/src/listings/formatPrice";

interface ConversationListItemProps {
  conversation: ConversationSummaryData;
  brandName?: string;
  modelName?: string;
}

type LastMessage = NonNullable<ConversationSummaryData["lastMessage"]>;

/** The preview's words, also read out in the row's accessibility label, and its leading icon. */
function usePreview(conversation: ConversationSummaryData): { text: string; icon: LucideIcon | null } {
  const { t } = useTranslation();
  const { t: tConv } = useTranslation("conversations");
  const lastMessage = conversation.lastMessage;
  if (conversation.blockedByMe) return { text: t("blockedStateTitle"), icon: null };
  if (!lastMessage) return { text: t("noMessagesYet"), icon: null };
  if (lastMessage.deletedAt) return { text: tConv("messageDeleted"), icon: Trash2 };
  if (lastMessage.kind === Enums.MessageKind.Image) return { text: t("photo"), icon: ImageIcon };
  if (lastMessage.kind === Enums.MessageKind.PostRef) return { text: t("listing"), icon: Car };
  return { text: lastMessage.text ?? "", icon: null };
}

/** The viewer's own last Message gets a tick; a deleted one does not. */
function lastMessageTick(conversation: ConversationSummaryData, lastMessage: LastMessage | undefined) {
  if (!lastMessage || lastMessage.deletedAt) return null;
  const viewerId = conversation.myRole === "buyer" ? conversation.buyerId : conversation.sellerId;
  if (lastMessage.senderId !== viewerId) return null;
  return outgoingStatus(lastMessage.createdAt, conversation.peerLastReadAt, conversation.peerLastDeliveredAt);
}

function formatConversationTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}

/** One Messages row (D8 on #352): thumbnail, name, Listing, last Message, time and tick. */
export function ConversationListItem({
  conversation,
  brandName,
  modelName,
}: ConversationListItemProps) {
  const { t, i18n } = useTranslation();
  const { t: tConv } = useTranslation("conversations");
  const queryClient = useQueryClient();
  const [imageFailed, setImageFailed] = useState(false);
  const listing = conversation.listing;
  const peerName = usePeerName(conversation) ?? "";
  const { text: previewText, icon: PreviewIcon } = usePreview(conversation);
  const tick = lastMessageTick(conversation, conversation.lastMessage);
  const unreadCount = conversation.unreadCount ?? 0;
  const isUnread = unreadCount > 0;

  const listingLine = listing
    ? [
        [
          listing.year ? String(listing.year) : null,
          brandName ?? listing.brandId.slice(0, 8),
          modelName ?? listing.modelId.slice(0, 8),
        ]
          .filter(Boolean)
          .join(" "),
        formatPrice(listing.displayPriceTmt, i18n.language),
      ].join(" · ")
    : tConv("listingUnavailable");

  const isClosed = !!listing && listing.status !== Enums.ListingStatus.Active;
  const isSold = listing?.status === Enums.ListingStatus.Sold;
  // Sold and Removed from sale are the approved badges; any other closed status
  // (in review, rejected, banned) reads Unavailable rather than dimming silently.
  const closedLabel = !isClosed
    ? null
    : isSold
      ? t("sold")
      : listing?.status === Enums.ListingStatus.Archived
        ? t("removedFromSale")
        : t("unavailable");

  const imageUrl = listing?.coverMediaKey
    ? buildVariantUrl(listing.coverMediaKey, "thumbnail")
    : null;

  const accessibilityLabel = [
    peerName,
    listingLine,
    previewText,
    isUnread ? t("unreadCount", { count: unreadCount }) : null,
  ]
    .filter(Boolean)
    .join(", ");

  const handlePress = () => {
    seedConversationDetail(queryClient, conversation);
    router.push({
      pathname: "/conversations/[id]",
      params: { id: conversation.id },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-border active:bg-muted/50"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        testID="conversation-row-thumbnail"
        className={cn("w-16 h-16 rounded-xl bg-muted overflow-hidden", isClosed && "opacity-60")}
      >
        {imageUrl && !imageFailed ? (
          <Image
            source={{ uri: imageUrl }}
            className="w-full h-full"
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View testID="conversation-row-placeholder" className="w-full h-full items-center justify-center">
            <Icon as={Car} className="size-6 text-muted-foreground" />
          </View>
        )}
      </View>

      <View className="flex-1 gap-0.5 min-w-0">
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-1 flex-1 min-w-0">
            <Text className="text-base font-semibold text-foreground shrink" numberOfLines={1}>
              {peerName}
            </Text>
            {conversation.mutedAt ? (
              <View testID="conversation-row-muted">
                <Icon as={BellOff} className="size-3.5 text-muted-foreground" />
              </View>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1 shrink-0">
            {tick ? (
              <View testID={`conversation-row-tick-${tick}`}>
                <Icon as={tick === "sent" ? Check : CheckCheck} className="size-3.5 text-muted-foreground" />
              </View>
            ) : null}
            <Text className="text-xs text-muted-foreground">
              {formatConversationTime(conversation.updatedAt, i18n.language)}
            </Text>
          </View>
        </View>

        <Text className="text-sm text-foreground" numberOfLines={1}>
          {listingLine}
        </Text>

        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
            {PreviewIcon ? (
              <Icon as={PreviewIcon} className="size-3.5 text-muted-foreground shrink-0" />
            ) : null}
            <Text
              className={cn(
                "text-sm flex-1",
                isUnread ? "font-semibold text-foreground" : "text-muted-foreground",
                conversation.lastMessage?.deletedAt && !conversation.blockedByMe && "italic",
              )}
              numberOfLines={1}
            >
              {previewText}
            </Text>
          </View>
          {isUnread ? (
            <View
              testID="conversation-row-unread"
              className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary items-center justify-center"
            >
              <Text className="text-xs text-primary-foreground font-medium">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : null}
          {closedLabel ? (
            <View
              className={cn(
                "rounded-full border px-2 py-0.5",
                isSold ? "border-foreground bg-foreground" : "border-transparent bg-secondary",
              )}
            >
              <Text
                className={cn(
                  "text-xs font-medium",
                  isSold ? "text-background" : "text-secondary-foreground",
                )}
              >
                {closedLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
