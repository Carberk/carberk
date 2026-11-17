import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, FlatList, KeyboardAvoidingView, RefreshControl, View, type ViewToken } from "react-native";
import { useTranslation } from "react-i18next";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";

import { ApiError } from "../api/client";
import { useDisplayName } from "../identity/useDisplayName";
import { localeTag } from "../i18n/resources";
import { mapErrorToCopy } from "../api/getErrorCopy";

import type { HistoryViewer } from "./session";
import { StopReminders } from "./StopReminders";
import { useHistoryReply } from "./useHistoryReply";
import { useRequestConversation } from "./useRequestConversation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { ErrorState } from "@/components/ErrorState";

export function RequestConversation({ viewer, request, header, metadataError, metadataCurrent, metadataRefreshing }: {
  viewer: HistoryViewer; request: VehicleHistorySchemas.HistoryRequest; header: ReactNode;
  metadataError: unknown; metadataCurrent: boolean; metadataRefreshing: boolean;
}) {
  const { t, i18n } = useTranslation();
  const name = useDisplayName();
  const thread = useRequestConversation(viewer, request, metadataCurrent);
  const { pages, receipts } = thread;
  const onVisible = useRef(({ viewableItems }: { viewableItems: ViewToken<VehicleHistorySchemas.HistoryMessage>[] }) => {
    thread.setVisibleIds(viewableItems.filter((item) => item.isViewable).map((item) => item.item.id));
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50, minimumViewTime: 300 }).current;
  const denied = [pages.error, receipts.error, thread.receiptError].some((error) =>
    error instanceof ApiError && [401, 403, 404].includes(error.status));
  const ready = metadataCurrent && thread.connected && thread.active && !denied && !pages.isPending && !pages.error;
  const reply = useHistoryReply(viewer, request, ready, thread.active, thread.messages, thread.refresh);
  const outgoing = reply.outgoing.filter((intent) => !thread.messages.some((message) =>
    message.author.kind === "requester" && message.author.id === viewer.userId
    && message.clientMessageId === intent.clientMessageId && message.text === intent.text))
    .sort((a, b) => a.message && b.message ? (BigInt(a.message.order) < BigInt(b.message.order) ? -1 : 1)
      : a.message ? -1 : b.message ? 1 : 0);
  const unresolved = outgoing.some((intent) => intent.state === "uncertain" || intent.state === "failed");
  const sendFailure = outgoing.find((intent) => intent.error);
  const sendError = sendFailure?.error;
  const sendNotice = sendError instanceof ApiError && [401, 403, 404].includes(sendError.status) ? t("vehicleHistory.denied")
    : sendError instanceof ApiError && sendError.status === 409 && sendError.code !== "HISTORY_READER_CHANGED" ? t("vehicleHistory.threadChanged")
      : sendFailure ? t(sendFailure.state === "uncertain" ? "vehicleHistory.sendUncertain" : "vehicleHistory.sendFailed") : null;
  const announcement = denied ? t("vehicleHistory.denied") : !thread.connected ? t("vehicleHistory.offline")
    : sendNotice ? sendNotice : pages.error ? pages.isFetchNextPageError ? t("vehicleHistory.pageFailed") : mapErrorToCopy(pages.error, t).title
      : metadataError ? t("vehicleHistory.requestRefreshFailed")
        : thread.receiptError || receipts.error ? t("vehicleHistory.receiptFailed") : null;
  useEffect(() => { if (announcement) AccessibilityInfo.announceForAccessibility(announcement); }, [announcement]);
  const other = receipts.data?.items.find((receipt) => receipt.participantId === request.assignedOperator?.id
    && receipt.participantId !== viewer.userId && receipt.assignmentVersion === request.assignmentVersion);
  const status = (message: VehicleHistorySchemas.HistoryMessage) => {
    if (other && BigInt(other.readOrder) >= BigInt(message.order)) return t("conversations:messageRead");
    if (other && BigInt(other.receivedOrder) >= BigInt(message.order)) return t("conversations:messageDelivered");
    return t("conversations:messageSent");
  };
  const retry = () => { void thread.refresh(); };
  let notice: ReactNode = null;
  if (denied) notice = <Text accessibilityRole="alert">{t("vehicleHistory.denied")}</Text>;
  else if (pages.isPending) notice = <ActivityIndicator accessibilityLabel={t("loading")} />;
  else if (pages.error && !pages.isFetchNextPageError && (thread.messages.length === 0
    || (pages.error instanceof ApiError && pages.error.status === 409))) notice = <ErrorState error={pages.error} onRetry={retry}
    title={pages.error instanceof ApiError && pages.error.status === 409 ? t("vehicleHistory.threadChanged") : undefined} />;
  else if (thread.messages.length === 0) notice = <Text className="text-body text-muted-foreground">{t("vehicleHistory.emptyEnquiry")}</Text>;

  return <KeyboardAvoidingView behavior="padding" className="flex-1">
    <FlatList
    className="flex-1" contentContainerClassName="gap-3 px-5 pb-8 pt-3"
    data={notice ? [] : thread.messages} keyExtractor={(message) => message.id}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
    onViewableItemsChanged={onVisible} viewabilityConfig={viewabilityConfig}
    refreshControl={<RefreshControl refreshing={metadataRefreshing || pages.isRefetching} onRefresh={retry} />}
    ListHeaderComponent={<View className="gap-4 pb-3">
      {header}
      {!denied && <StopReminders viewer={viewer} request={request} ready={metadataCurrent} active={thread.active} connected={thread.connected}
        revision={pages.dataUpdatedAt} />}
      {!thread.connected && <Text accessibilityRole="alert">{t("vehicleHistory.offline")}</Text>}
      {notice}
    </View>}
    renderItem={({ item }) => {
      const own = item.author.kind === "requester" && item.author.id === viewer.userId;
      return <View className={own ? "ml-8 gap-2 rounded-2xl bg-message-own p-4" : "mr-8 gap-2 rounded-2xl bg-card p-4"}>
        <Text className="text-footnote font-semibold text-foreground">{own ? t("vehicleHistory.you") : name(item.author)}</Text>
        <Text selectable className="text-body leading-6 text-foreground">{item.text}</Text>
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          <Text className="text-caption text-foreground/70">{new Date(item.createdAt).toLocaleString(localeTag(i18n.language))}</Text>
          {own && <Text className="text-caption text-foreground/70">{status(item)}</Text>}
        </View>
      </View>;
    }}
    ListFooterComponent={denied ? null : <View className="gap-3 pt-3">
      {pages.isFetchNextPageError && <Text accessibilityRole="alert">{t("vehicleHistory.pageFailed")}</Text>}
      {metadataError ? <View className="gap-3">
        <Text accessibilityRole="alert">{t("vehicleHistory.requestRefreshFailed")}</Text>
        <Button variant="secondary" disabled={metadataRefreshing} onPress={retry}><Text>{t("retry")}</Text></Button>
      </View> : pages.isRefetchError && !notice && <View className="gap-3">
        <Text accessibilityRole="alert">{mapErrorToCopy(pages.error, t).title}</Text>
        <Button variant="secondary" onPress={retry}><Text>{t("retry")}</Text></Button>
      </View>}
      {pages.hasNextPage && !pages.isRefetchError && <Button variant="secondary" disabled={!metadataCurrent || pages.isFetching}
        accessibilityState={{ busy: pages.isFetching }} onPress={() => void pages.fetchNextPage({ cancelRefetch: false })}>
        <Text>{t(pages.isFetchingNextPage ? "loading" : pages.isFetchNextPageError ? "retry" : "vehicleHistory.moreMessages")}</Text>
      </Button>}
      {outgoing.length > 0 && <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.recentSends")}</Text>}
      {outgoing.map((intent) => <View key={intent.clientMessageId} className="ml-8 gap-2 rounded-2xl bg-message-own p-4">
        <Text className="text-footnote font-semibold">{t("vehicleHistory.you")}</Text>
        <Text selectable className="text-body leading-6">{intent.text}</Text>
        {intent.message && <Text className="text-caption text-foreground/70">{new Date(intent.message.createdAt).toLocaleString(localeTag(i18n.language))}</Text>}
        <Text accessibilityLiveRegion="polite" className="text-footnote">
          {intent.message ? status(intent.message) : t(intent.state === "pending" ? "vehicleHistory.sending"
            : intent.state === "uncertain" ? "vehicleHistory.sendUncertain" : "vehicleHistory.sendFailed")}
        </Text>
        {intent.error instanceof ApiError && [401, 403, 404, 409].includes(intent.error.status) && intent.error.code !== "HISTORY_READER_CHANGED"
          ? <View className="gap-2"><Text accessibilityRole="alert">{t(intent.error.status === 409 ? "vehicleHistory.threadChanged" : "vehicleHistory.denied")}</Text>
            <Button variant="secondary" disabled={metadataRefreshing} onPress={() => { void thread.refresh().then(reply.resume); }}><Text>{t("vehicleHistory.refreshRequest")}</Text></Button></View>
          : intent.error != null && <Button variant="secondary" disabled={!ready || reply.pending || reply.blocked}
            accessibilityLabel={t("vehicleHistory.retryMessage", { text: intent.text, interpolation: { escapeValue: false } })} onPress={() => void reply.retry(intent)}>
            <Text>{t("retry")}</Text>
          </Button>}
      </View>)}
      {(thread.receiptError || receipts.error) && <View className="gap-3">
        <Text accessibilityRole="alert">{t("vehicleHistory.receiptFailed")}</Text>
        <Button variant="secondary" disabled={!metadataCurrent} onPress={() => { thread.retryReceipt(); void receipts.refetch(); }}>
          <Text>{t("vehicleHistory.retryReceipts")}</Text>
        </Button>
      </View>}
    </View>}
    />
    {!denied && <View className="gap-3 border-t-hairline border-border bg-background px-5 py-3">
      <Text nativeID="history-reply-label" className="text-footnote font-semibold">{t("vehicleHistory.replyLabel")}</Text>
      <Input accessibilityLabel={t("vehicleHistory.replyLabel")} accessibilityLabelledBy="history-reply-label"
        className="max-h-36 min-h-20 py-3" multiline textAlignVertical="top" maxLength={4000}
        placeholder={t("vehicleHistory.replyPlaceholder")} value={reply.draft} onChangeText={reply.edit} />
      {unresolved && <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.newIntentHint")}</Text>}
      <Button disabled={!ready || !reply.valid || reply.pending || reply.blocked} accessibilityState={{ busy: reply.pending }}
        onPress={() => void reply.send()}>
        <Text>{t(reply.pending ? "vehicleHistory.sending" : unresolved ? "vehicleHistory.sendNew" : "vehicleHistory.sendMessage")}</Text>
      </Button>
    </View>}
  </KeyboardAvoidingView>;
}
