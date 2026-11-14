import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, FlatList, RefreshControl, View, type ViewToken } from "react-native";
import { useTranslation } from "react-i18next";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";

import { ApiError } from "../api/client";
import { useDisplayName } from "../identity/useDisplayName";
import { localeTag } from "../i18n/resources";
import { mapErrorToCopy } from "../api/getErrorCopy";

import type { HistoryViewer } from "./session";
import { useRequestConversation } from "./useRequestConversation";

import { Button } from "@/components/ui/button";
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
  const announcement = denied ? t("vehicleHistory.denied") : !thread.connected ? t("vehicleHistory.offline")
    : pages.error ? pages.isFetchNextPageError ? t("vehicleHistory.pageFailed") : mapErrorToCopy(pages.error, t).title
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

  return <FlatList
    className="flex-1" contentContainerClassName="gap-3 px-5 pb-8 pt-3"
    data={notice ? [] : thread.messages} keyExtractor={(message) => message.id}
    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
    onViewableItemsChanged={onVisible} viewabilityConfig={viewabilityConfig}
    refreshControl={<RefreshControl refreshing={metadataRefreshing || pages.isRefetching} onRefresh={retry} />}
    ListHeaderComponent={<View className="gap-4 pb-3">
      {header}
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
      {(thread.receiptError || receipts.error) && <View className="gap-3">
        <Text accessibilityRole="alert">{t("vehicleHistory.receiptFailed")}</Text>
        <Button variant="secondary" disabled={!metadataCurrent} onPress={() => { thread.retryReceipt(); void receipts.refetch(); }}>
          <Text>{t("vehicleHistory.retryReceipts")}</Text>
        </Button>
      </View>}
    </View>}
  />;
}
