import { useCallback, useMemo } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { buildChatImageUrl } from "../upload/buildChatImageUrl";
import { buildMessageRows, type MessageRow } from "../messageRows";
import { formatMessageDay } from "../messageTime";

import {
  MessageBubble,
  type MessageStatus,
  type ImageMessageMetadata,
  type PostRefMessageMetadata,
} from "./MessageBubble";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";

export interface MessageItem {
  id: string;
  senderId: string;
  kind?: "text" | "image" | "post_ref";
  text: string;
  metadata?: ImageMessageMetadata | PostRefMessageMetadata;
  localImageUri?: string;
  createdAt: string;
  status: MessageStatus;
  deletedAt?: string | null;
  canDelete?: boolean;
  postRefBrandName?: string;
  postRefModelName?: string;
}

interface MessageListProps {
  messages: MessageItem[];
  currentUserId: string;
  reportedMessageIds?: Set<string>;
  onRetry?: (tempId: string) => void;
  onDelete?: (messageId: string) => void;
  onReport?: (messageId: string) => void;
  onImagePress?: (uri: string) => void;
  onPostRefPress?: (listingId: string) => void;
  /** Called at the top of the history to load an older page. */
  onLoadOlder?: () => void;
  /** An older page is loading. */
  loadingOlder?: boolean;
  /** An older page failed; the loaded Messages stay and the top offers Retry. */
  olderFailed?: boolean;
  onRetryOlder?: () => void;
}

function OlderMessagesRow({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t("conversations:loadingOlderMessages")}
        className="items-center py-4"
      >
        <Skeleton className="h-4 w-32 rounded" />
      </View>
    );
  }
  if (failed) {
    return (
      <View className="flex-row items-center justify-center gap-2 px-4 py-2">
        <Text className="text-xs text-muted-foreground">
          {t("conversations:olderMessagesFailed")}
        </Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t("retry")}
            style={{ minHeight: 44, minWidth: 44 }}
            className="items-center justify-center px-2"
          >
            <Text className="text-xs font-semibold text-primary underline">{t("retry")}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return null;
}

function DaySeparator({ label }: { label: string }) {
  return (
    <View className="items-center py-2" accessibilityRole="header">
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

export function MessageList({
  messages,
  currentUserId,
  reportedMessageIds,
  onRetry,
  onDelete,
  onReport,
  onImagePress,
  onPostRefPress,
  onLoadOlder,
  loadingOlder = false,
  olderFailed = false,
  onRetryOlder,
}: MessageListProps) {
  const { t, i18n } = useTranslation();
  const reported = reportedMessageIds ?? new Set<string>();
  const rows = useMemo(
    () => buildMessageRows(messages, currentUserId),
    [messages, currentUserId],
  );

  const renderItem = useCallback(
    ({ item: { message: item, startsDay, showReadLabel } }: { item: MessageRow<MessageItem> }) => (
      <>
        {startsDay && (
          <DaySeparator label={formatMessageDay(item.createdAt, i18n.language, t)} />
        )}
        <MessageBubble
          id={item.id}
          text={item.text}
          kind={item.kind ?? "text"}
          metadata={item.metadata}
          localImageUri={item.localImageUri}
          isMine={item.senderId === currentUserId}
          status={item.status}
          createdAt={item.createdAt}
          deletedAt={item.deletedAt}
          canDelete={item.canDelete}
          canReport={item.senderId !== currentUserId && !item.deletedAt}
          reported={reported.has(item.id)}
          showReadLabel={showReadLabel}
          postRefBrandName={item.postRefBrandName}
          postRefModelName={item.postRefModelName}
          onRetry={item.status === "failed" ? () => onRetry?.(item.id) : undefined}
          onDelete={item.canDelete && !item.deletedAt ? () => onDelete?.(item.id) : undefined}
          onReport={item.senderId !== currentUserId && !item.deletedAt ? () => onReport?.(item.id) : undefined}
          onImagePress={item.kind === "image" && !item.deletedAt ? () => {
            const uri = item.localImageUri ?? (item.metadata && "key" in item.metadata && item.metadata.key
              ? buildChatImageUrl(item.metadata.key)
              : undefined);
            if (uri) onImagePress?.(uri);
          } : undefined}
          onPostRefPress={item.kind === "post_ref" && !item.deletedAt ? onPostRefPress : undefined}
        />
      </>
    ),
    [currentUserId, reported, onRetry, onDelete, onReport, onImagePress, onPostRefPress, i18n.language, t],
  );

  const keyExtractor = useCallback((row: MessageRow<MessageItem>) => row.message.id, []);

  return (
    <FlatList
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={{ paddingVertical: 8 }}
      inverted
      onEndReached={onLoadOlder}
      onEndReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      // The list is inverted, so its footer sits above the oldest Message.
      ListFooterComponent={
        <OlderMessagesRow loading={loadingOlder} failed={olderFailed} onRetry={onRetryOlder} />
      }
      ListEmptyComponent={
        <View
          style={{ transform: [{ scaleY: -1 }] }}
          className="flex-1 items-center justify-center px-6 py-12"
        >
          <Text className="text-sm text-muted-foreground">
            {t("noMessagesYet")}
          </Text>
        </View>
      }
    />
  );
}
