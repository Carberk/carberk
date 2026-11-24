import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, FlatList, Keyboard, Platform, RefreshControl, View, type TextInput, type ViewToken } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";

import { ApiError } from "../api/client";
import { useDisplayName } from "../identity/useDisplayName";
import { localeTag } from "../i18n/resources";
import { mapErrorToCopy } from "../api/getErrorCopy";

import { historySessionCurrent, type HistoryViewer } from "./session";
import { OrderStatus } from "./OrderStatus";
import { OfferPreview } from "./OfferPreview";
import { StopReminders } from "./StopReminders";
import { useHistoryReply } from "./useHistoryReply";
import { useRequestConversation } from "./useRequestConversation";
import { DeliveredReport } from "./DeliveredReport";
import { PromiseRecovery } from "./PromiseRecovery";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { ErrorState } from "@/components/ErrorState";

function reportTargets(text: string) {
  const targets: string[] = [];
  const scanner = /https:\/\/[^\s<>"“”‘’«»]+/giu;
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text)) !== null) {
    const before = text[match.index - 1] ?? "";
    if (before && !/[\s([{"'<“‘«]/u.test(before)) continue;
    let target = match[0];
    const closing = new Map([["(", ")"], ["[", "]"], ["{", "}"], ["'", "'"],
      ['"', '"'], ["<", ">"], ["“", "”"], ["‘", "’"], ["«", "»"]]).get(before);
    const after = text[match.index + match[0].length];
    if (after && !/\s/u.test(after) && after !== closing) continue;
    if (before === "'") {
      const end = target.lastIndexOf("'");
      if (end >= 0) target = target.slice(0, end);
    } else if (closing) {
      let depth = 0;
      for (let index = 0; index < target.length; index++) {
        if (target[index] === closing && depth === 0) { target = target.slice(0, index); break; }
        if (target[index] === before) depth++;
        else if (target[index] === closing) depth--;
      }
    } else if (target !== text && !/[?#]/u.test(target)) target = target.replace(/[.,;!]+$/u, "");
    scanner.lastIndex = match.index + target.length;
    try {
      const parsed = new URL(target);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password
        && /^https:\/\/[^/?#@]+/iu.test(target) && !/[\s\\\p{Cc}]/u.test(target)
        && !/%(?![\da-f]{2})/iu.test(target)) targets.push(target);
    } catch { continue; }
  }
  return targets;
}

export function RequestConversation({ viewer, request, header, metadataError, metadataCurrent, metadataRefreshing }: {
  viewer: HistoryViewer; request: VehicleHistorySchemas.HistoryRequest; header: ReactNode;
  metadataError: unknown; metadataCurrent: boolean; metadataRefreshing: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copyFailure, setCopyFailure] = useState<string | null>(null);
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<{ key: string; action: "open" | "copy" } | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const linkAttempt = useRef(0);
  const linkReader = useRef({ mounted: true, ready: false });
  const list = useRef<FlatList<VehicleHistorySchemas.HistoryMessage>>(null);
  const composer = useRef<TextInput>(null);
  const position = useRef({ offset: 0, height: 0 });
  const browserPosition = useRef<{ offset: number; height: number; away: boolean; keyboardReady: boolean } | null>(null);
  const name = useDisplayName();
  const thread = useRequestConversation(viewer, request, metadataCurrent);
  const { pages, receipts } = thread;
  const onVisible = useRef(({ viewableItems }: { viewableItems: ViewToken<VehicleHistorySchemas.HistoryMessage>[] }) => {
    thread.setVisibleIds(viewableItems.filter((item) => item.isViewable).map((item) => item.item.id));
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50, minimumViewTime: 300 }).current;
  const denied = [pages.error, receipts.error, thread.receiptError].some((error) =>
    error instanceof ApiError && [401, 403, 404].includes(error.status));
  const metadataAvailable = metadataCurrent || (metadataRefreshing && !metadataError);
  const delivered = request.reportReady || thread.order.data?.preparation === "delivered";
  const ready = metadataCurrent && thread.connected && thread.active && !denied && !pages.isPending && !pages.error;
  linkReader.current.ready = ready;
  const linkCurrent = () => linkReader.current.mounted && linkReader.current.ready
    && historySessionCurrent(viewer) && AppState.currentState === "active"
    && focusManager.isFocused() && onlineManager.isOnline();
  const restoreBrowserPosition = () => {
    const saved = browserPosition.current;
    if (!saved?.away || !saved.keyboardReady || !linkCurrent() || Math.abs(position.current.height - saved.height) > 1) return;
    requestAnimationFrame(() => {
      if (browserPosition.current !== saved || !linkCurrent() || Math.abs(position.current.height - saved.height) > 1) return;
      browserPosition.current = null;
      list.current?.scrollToOffset({ offset: saved.offset, animated: false });
    });
  };
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    if (!thread.active && browserPosition.current) browserPosition.current.away = true;
    else restoreBrowserPosition();
    const keyboard = Keyboard.addListener("keyboardDidShow", () => {
      if (browserPosition.current?.away) {
        browserPosition.current.keyboardReady = true;
        restoreBrowserPosition();
      }
    });
    return () => keyboard.remove();
  });
  useEffect(() => {
    if (!ready) {
      linkAttempt.current++;
      setCopiedLink(null);
      setCopyFailure(null);
      setOpenFailure(null);
      setPendingLink(null);
    }
  }, [ready]);
  useEffect(() => {
    const reader = linkReader.current;
    reader.mounted = true;
    return () => { reader.mounted = false; };
  }, []);
  const actOnReport = async (key: string, target: string, action: "open" | "copy") => {
    if (!linkCurrent()) return;
    const attempt = ++linkAttempt.current;
    setPendingLink({ key, action });
    if (action === "copy") { setCopiedLink(null); setCopyFailure(null); }
    else setOpenFailure(null);
    const beforeOpen = action === "open" && position.current.height > 0
      ? { ...position.current, away: false, keyboardReady: !Keyboard.isVisible() } : null;
    browserPosition.current = beforeOpen;
    let succeeded = false;
    try {
      if (action === "copy") succeeded = await Clipboard.setStringAsync(target) === true;
      else {
        const result: unknown = await Linking.openURL(target);
        succeeded = result !== false;
      }
    } catch { succeeded = false; }
    if (!succeeded && browserPosition.current === beforeOpen) browserPosition.current = null;
    if (attempt !== linkAttempt.current || !linkCurrent()) return;
    setPendingLink(null);
    if (action === "copy") {
      if (succeeded) setCopiedLink(key);
      else setCopyFailure(key);
      AccessibilityInfo.announceForAccessibility(t(succeeded ? "vehicleHistory.linkCopied" : "vehicleHistory.copyLinkFailed"));
    } else if (!succeeded) {
      setOpenFailure(key);
      AccessibilityInfo.announceForAccessibility(t("vehicleHistory.openReportFailed"));
    }
  };
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
  const pullRefresh = async () => {
    setPullRefreshing(true);
    try { await thread.refresh(); }
    finally { if (linkReader.current.mounted) setPullRefreshing(false); }
  };
  let notice: ReactNode = null;
  if (denied) notice = <Text accessibilityRole="alert">{t("vehicleHistory.denied")}</Text>;
  else if (pages.isPending) notice = <ActivityIndicator accessibilityLabel={t("loading")} />;
  else if (pages.error && !pages.isFetchNextPageError && (thread.messages.length === 0
    || (pages.error instanceof ApiError && pages.error.status === 409))) notice = <ErrorState error={pages.error} onRetry={retry}
    title={pages.error instanceof ApiError && pages.error.status === 409 ? t("vehicleHistory.threadChanged") : undefined} />;
  else if (thread.messages.length === 0) notice = <Text className="text-body text-muted-foreground">
    {t(delivered ? "vehicleHistory.reportNoMessages" : "vehicleHistory.emptyEnquiry")}
  </Text>;

  return <View className="flex-1">
    {!denied && delivered && thread.active && !keyboardVisible && <View className="border-b border-border bg-card px-5 py-2">
      <Button variant="secondary" className="min-h-12" onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}>
        <Text>{t("vehicleHistory.viewDeliveredReport")}</Text>
      </Button>
    </View>}
    {!denied && !delivered && thread.active && thread.order.data?.order && !thread.order.error && <OrderStatus state={thread.order.data}
      compact={keyboardVisible} ready={metadataCurrent && thread.connected} onDetails={() => list.current?.scrollToOffset({ offset: 0, animated: true })} />}
    <FlatList
    ref={list}
    className="flex-1" contentContainerClassName="gap-3 px-5 pb-8 pt-3"
    data={notice ? [] : thread.messages} keyExtractor={(message) => message.id}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    maintainVisibleContentPosition={delivered && thread.messages.length === 0 ? undefined : { minIndexForVisible: 0 }}
    scrollEventThrottle={16}
    onScroll={(event) => { position.current.offset = event.nativeEvent.contentOffset.y; }}
    onScrollBeginDrag={() => { browserPosition.current = null; }}
    onLayout={(event) => { position.current.height = event.nativeEvent.layout.height; restoreBrowserPosition(); }}
    onViewableItemsChanged={onVisible} viewabilityConfig={viewabilityConfig}
    refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => { void pullRefresh(); }} />}
    ListHeaderComponent={<View className="gap-4 pb-3">
      {!denied && delivered && <DeliveredReport viewer={viewer} requestId={request.id}
        active={thread.active} online={thread.connected} ready={metadataCurrent} openComposer={() => composer.current?.focus()} />}
      {!denied && delivered && thread.active && !thread.order.error && thread.order.data?.recovery &&
        <PromiseRecovery recovery={thread.order.data.recovery} delivered />}
      {!thread.order.data?.recovery && header}
      {!denied && !delivered && <OfferPreview viewer={viewer} request={request} ready={metadataCurrent} metadataAvailable={metadataAvailable}
        recoveryVersion={thread.order.data?.recovery?.version}
        active={thread.active} connected={thread.connected} reconcileOrder={() => thread.order.refetch()} />}
      {thread.order.data?.recovery && header}
      {!denied && <StopReminders viewer={viewer} request={request} ready={metadataCurrent} active={thread.active} connected={thread.connected}
        revision={pages.dataUpdatedAt} />}
      {!thread.connected && <Text accessibilityRole="alert">{t("vehicleHistory.offline")}</Text>}
      {notice}
    </View>}
    renderItem={({ item }) => {
      const own = item.author.kind === "requester" && item.author.id === viewer.userId;
      const targets = reportTargets(item.text);
      return <View className={own ? "ml-8 gap-2 rounded-2xl bg-message-own p-4" : "mr-8 gap-2 rounded-2xl bg-card p-4"}>
        <Text className="text-footnote font-semibold text-foreground">{own ? t("vehicleHistory.you") : name(item.author)}</Text>
        <Text selectable className="text-body leading-6 text-foreground">{item.text}</Text>
        {targets.map((reportTarget, index) => {
          const linkKey = `${item.id}:${index}`;
          const opening = pendingLink?.key === linkKey && pendingLink.action === "open";
          const copying = pendingLink?.key === linkKey && pendingLink.action === "copy";
          const suffix = targets.length > 1 ? ` ${index + 1}` : "";
          const openLabel = t(openFailure === linkKey ? "vehicleHistory.retryOpenReport" : "vehicleHistory.openReport") + suffix;
          const copyLabel = t(copyFailure === linkKey ? "vehicleHistory.retryCopyLink" : "vehicleHistory.copyLink") + suffix;
          return <View key={linkKey} className="gap-2">
          <View className="flex-row flex-wrap gap-1">
            <Button variant="link" className="relative max-w-full" disabled={!ready}
              accessibilityLabel={openLabel}
              accessibilityState={{ busy: opening }}
              onPress={() => actOnReport(linkKey, reportTarget, "open")}>
              <Text className={opening ? "opacity-0" : undefined}>{openLabel}</Text>
              {opening && <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                <ActivityIndicator accessible={false} />
              </View>}
            </Button>
            <Button variant="link" className="relative max-w-full" disabled={!ready}
              accessibilityLabel={copyLabel}
              accessibilityState={{ busy: copying }}
              onPress={() => actOnReport(linkKey, reportTarget, "copy")}>
              <Text className={copying ? "opacity-0" : undefined}>{copyLabel}</Text>
              {copying && <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                <ActivityIndicator accessible={false} />
              </View>}
            </Button>
          </View>
        {openFailure === linkKey && <Text accessibilityRole="alert">{t("vehicleHistory.openReportFailed")}</Text>}
        {copyFailure === linkKey && <Text accessibilityRole="alert">{t("vehicleHistory.copyLinkFailed")}</Text>}
        {copiedLink === linkKey && <Text accessibilityLiveRegion="polite">{t("vehicleHistory.linkCopied")}</Text>}
        </View>; })}
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
            : intent.error != null && <Button variant="secondary" disabled={!ready || reply.pending || reply.blocked || !reply.saved || !!reply.storageError}
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
      <Input ref={composer} accessibilityLabel={t("vehicleHistory.replyLabel")} accessibilityLabelledBy="history-reply-label"
        className="max-h-36 min-h-20 py-3" multiline textAlignVertical="top" maxLength={4000}
        editable={reply.loaded}
        placeholder={t("vehicleHistory.replyPlaceholder")} value={reply.draft} onChangeText={reply.edit} />
      {!reply.loaded && !reply.storageError && <ActivityIndicator accessibilityLabel={t("loading")} />}
      {reply.storageError && <View className="gap-2">
        <Text accessibilityRole="alert">{t(reply.storageError === "load" ? "vehicleHistory.draftLoadError"
          : reply.storageError === "corrupt" ? "vehicleHistory.draftCorrupt" : "vehicleHistory.draftSaveError")}</Text>
        {reply.storageError === "corrupt"
          ? <Button variant="secondary" onPress={reply.resetDraft}><Text>{t("vehicleHistory.newDraft")}</Text></Button>
          : <Button variant="secondary" onPress={() => void reply.retryStorage()}><Text>{t(reply.storageError === "load" ? "vehicleHistory.retryDraftLoad" : "vehicleHistory.retryDraft")}</Text></Button>}
      </View>}
      {unresolved && <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.newIntentHint")}</Text>}
      <Button disabled={!ready || !reply.valid || reply.pending || reply.blocked || !reply.saved || !!reply.storageError} accessibilityState={{ busy: reply.pending }}
        onPress={() => void reply.send()}>
        <Text>{t(reply.pending ? "vehicleHistory.sending" : unresolved ? "vehicleHistory.sendNew" : "vehicleHistory.sendMessage")}</Text>
      </Button>
    </View>}
  </View>;
}
