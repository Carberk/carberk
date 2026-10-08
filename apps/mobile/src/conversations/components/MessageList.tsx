import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { buildChatImageUrl } from "../upload/buildChatImageUrl";
import { buildMessageRows, type MessageListRow } from "../messageRows";
import { formatMessageDay } from "../messageTime";

import { MessageActionsSheet } from "./MessageActionsSheet";
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
  /** Incremented by an explicit send, never by a server acknowledgement. */
  sendCount?: number;
  reportedMessageIds?: Set<string>;
  /** Report message is offered only while reporting is switched on for the environment. */
  reportEnabled?: boolean;
  onCopy?: (text: string) => void;
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
  /** Shown after the last Message (the list is inverted, so this is its header). */
  afterLast?: ReactNode;
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
        <Text className="text-caption text-muted-foreground">
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
            <Text className="text-caption font-semibold text-primary underline">{t("retry")}</Text>
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
      <Text className="text-caption text-muted-foreground">{label}</Text>
    </View>
  );
}

export function MessageList({
  messages,
  currentUserId,
  sendCount = 0,
  reportedMessageIds,
  reportEnabled = true,
  onCopy,
  onRetry,
  onDelete,
  onReport,
  onImagePress,
  onPostRefPress,
  onLoadOlder,
  loadingOlder = false,
  olderFailed = false,
  onRetryOlder,
  afterLast,
}: MessageListProps) {
  const { t, i18n } = useTranslation();
  const listRef = useRef<FlatList<MessageListRow<MessageItem>>>(null);
  useEffect(() => {
    if (sendCount > 0) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sendCount]);
  const reported = reportedMessageIds ?? new Set<string>();
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const rows = useMemo(
    () => buildMessageRows(messages, currentUserId),
    [messages, currentUserId],
  );

  /** What a long press offers on a Message (D4); none means no sheet. */
  const actionsFor = useCallback(
    (item: MessageItem) => {
      const isMine = item.senderId === currentUserId;
      const live = !item.deletedAt && item.status !== "pending" && item.status !== "failed";
      const kind = item.kind ?? "text";
      return {
        copy: live && kind === "text",
        report: live && !isMine && reportEnabled && !reported.has(item.id),
        delete: live && isMine && !!item.canDelete,
      };
    },
    [currentUserId, reportEnabled, reported],
  );

  const renderItem = useCallback(
    ({ item }: { item: MessageListRow<MessageItem> }) => {
      // A day separator is its own row: an inverted cell lays its children out
      // bottom-up, so nesting the separator in the Message cell would put it
      // below the bubble.
      if (item.kind === "separator") {
        return (
          <DaySeparator label={formatMessageDay(item.day, i18n.language, t)} />
        );
      }
      const message = item.message;
      return (
        <MessageBubble
          id={message.id}
          text={message.text}
          kind={message.kind ?? "text"}
          metadata={message.metadata}
          localImageUri={message.localImageUri}
          isMine={message.senderId === currentUserId}
          status={message.status}
          createdAt={message.createdAt}
          deletedAt={message.deletedAt}
          reported={reported.has(message.id)}
          showReadLabel={item.showReadLabel}
          postRefBrandName={message.postRefBrandName}
          postRefModelName={message.postRefModelName}
          onRetry={message.status === "failed" ? () => onRetry?.(message.id) : undefined}
          onOpenActions={
            Object.values(actionsFor(message)).some(Boolean) ? () => setActionTargetId(message.id) : undefined
          }
          onImagePress={message.kind === "image" && !message.deletedAt ? () => {
            const uri = message.localImageUri ?? (message.metadata && "key" in message.metadata && message.metadata.key
              ? buildChatImageUrl(message.metadata.key)
              : undefined);
            if (uri) onImagePress?.(uri);
          } : undefined}
          onPostRefPress={message.kind === "post_ref" && !message.deletedAt ? onPostRefPress : undefined}
        />
      );
    },
    [currentUserId, reported, actionsFor, onRetry, onImagePress, onPostRefPress, i18n.language, t],
  );

  const keyExtractor = useCallback((row: MessageListRow<MessageItem>) => row.key, []);

  const actionTarget = messages.find((item) => item.id === actionTargetId);
  const targetActions = actionTarget ? actionsFor(actionTarget) : null;
  const actionsOpen = targetActions !== null && Object.values(targetActions).some(Boolean);

  return (
    <>
    <FlatList
      ref={listRef}
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={{ paddingVertical: 8 }}
      inverted
      ListHeaderComponent={afterLast ? <>{afterLast}</> : null}
      onEndReached={onLoadOlder}
      onEndReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      // The list is inverted, so its footer sits above the oldest Message.
      ListFooterComponent={
        <OlderMessagesRow loading={loadingOlder} failed={olderFailed} onRetry={onRetryOlder} />
      }
      ListEmptyComponent={
        <View
          className="flex-1 items-center justify-center px-6 py-12"
        >
          <Text className="text-callout text-muted-foreground">
            {t("noMessagesYet")}
          </Text>
        </View>
      }
    />
    <MessageActionsSheet
      open={actionsOpen}
      onOpenChange={(open) => {
        if (!open) setActionTargetId(null);
      }}
      canCopy={targetActions?.copy ?? false}
      canReport={targetActions?.report ?? false}
      canDelete={targetActions?.delete ?? false}
      onCopy={() => targetActions?.copy && actionTarget && onCopy?.(actionTarget.text)}
      onReport={() => targetActions?.report && actionTarget && onReport?.(actionTarget.id)}
      onDelete={() => targetActions?.delete && actionTarget && onDelete?.(actionTarget.id)}
    />
    </>
  );
}
