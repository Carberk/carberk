import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";

import { useHistoryRequest, useHistoryRequests } from "../api/vehicle-history/requests";
import { mapErrorToCopy } from "../api/getErrorCopy";
import { ApiError } from "../api/client";
import { localeTag } from "../i18n/resources";
import { useSafeBack } from "../navigation/useSafeBack";

import { vehicleHistoryAvailable } from "./availability";
import { historySessionCurrent, useHistoryViewer } from "./session";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ErrorState } from "@/components/ErrorState";

type Viewer = ReturnType<typeof useHistoryViewer>;
const historyPath = "/vehicle-history/requests";

function Reader({ viewer, error, loading, retry, refreshing, detail = false, children }: {
  viewer: Viewer;
  error: unknown;
  loading: boolean;
  retry: () => void;
  refreshing: boolean;
  detail?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const back = useSafeBack(detail ? historyPath : "/(tabs)/chat");
  const navigation = useNavigation();
  useEffect(() => {
    const state = navigation.getState();
    const previous = state?.routes[(state.index ?? 0) - 1];
    const current = state?.routes[state.index];
    if (current?.name !== (detail ? "vehicle-history/requests/[id]" : "vehicle-history/requests/index")) return;
    const tabs = previous?.state;
    const routes = tabs?.routes ?? [];
    const chatIndex = routes.findIndex((route) => route.name === "chat");
    const fromMessages = routes[tabs?.index ?? 0]?.name === "chat";
    if (state?.index !== 1 || previous?.name !== "(tabs)" || !current || (!detail && fromMessages)) return;
    // Cold links need real parents so header, gesture and system Back agree.
    navigation.dispatch({ type: "RESET", payload: { ...state,
      index: detail ? 2 : 1,
      routes: [
        { ...previous, state: { ...tabs, index: chatIndex < 0 ? routes.length : chatIndex,
          routes: chatIndex < 0 ? [...routes, { name: "chat" }] : routes } },
        ...(detail ? [{ name: "vehicle-history/requests/index" }] : []),
        current,
      ],
    } });
  }, [detail, navigation]);
  const heading = useRef<View>(null);
  const available = vehicleHistoryAvailable();
  const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
  let notice: string | null = null;
  if (!available) notice = t("vehicleHistory.unavailable");
  else if (viewer === undefined) notice = t("loading");
  else if (!viewer) notice = t("vehicleHistory.privateSignIn");
  else if (denied) notice = t("vehicleHistory.denied");

  const offlineTitle = error instanceof ApiError && error.status === 0 ? t("vehicleHistory.offline") : undefined;
  const announcement = notice ?? offlineTitle ?? (error ? mapErrorToCopy(error, t).title : loading ? t("loading") : null);
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  let content = children;
  if (notice) {
    content = (
      <Text accessibilityRole={viewer === undefined && available ? "text" : "alert"}
        accessibilityLiveRegion="polite" className="text-body text-muted-foreground">
        {notice}
      </Text>
    );
  } else if (error) {
    content = <ErrorState error={error} title={offlineTitle} onRetry={retry} />;
  } else if (loading) {
    content = (
      <View accessibilityLiveRegion="polite" className="gap-3">
        <ActivityIndicator accessibilityLabel={t("loading")} />
        <Text>{t("loading")}</Text>
      </View>
    );
  }

  return (
    <SafeScreen>
      <StackHeader large
        title={detail ? `Carberk · ${t("vehicleHistory.title")}` : t("vehicleHistory.historyTitle")}
        leading={<BackButton ref={heading} onPress={back}
          accessibilityLabel={t(detail ? "vehicleHistory.backRequests" : "back")} />}
        onLayout={() => {
          if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
        }} />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-8 pt-3"
        refreshControl={viewer && available
          ? <RefreshControl refreshing={refreshing} onRefresh={retry} /> : undefined}>
        {content}
      </ScrollView>
    </SafeScreen>
  );
}

export function HistoryList() {
  const { t, i18n } = useTranslation();
  const viewer = useHistoryViewer();
  const query = useHistoryRequests(viewer, vehicleHistoryAvailable());
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  return (
    <Reader viewer={viewer} error={query.error} loading={query.isPending}
      refreshing={query.isRefetching} retry={() => void query.refetch()}>
      {items.length === 0 ? (
        <Text className="text-body text-muted-foreground">{t("vehicleHistory.emptyRequests")}</Text>
      ) : items.map((request) => (
        <View key={request.id} className="gap-3 border-b-hairline border-border pb-5">
          <Text className="text-headline font-semibold">{t("vehicleHistory.enquiry")}</Text>
          <Text className="text-callout text-muted-foreground">
            {new Date(request.createdAt).toLocaleString(localeTag(i18n.language))}
          </Text>
          <Text className="text-footnote text-muted-foreground">
            {t("vehicleHistory.reference", { id: request.id.slice(0, 8).toUpperCase() })}
          </Text>
          <Text className="text-callout">{t("vehicleHistory.awaitingOperator")}</Text>
          <Button variant="secondary"
            accessibilityLabel={t("vehicleHistory.openRequest", { id: request.id.slice(0, 8).toUpperCase() })}
            onPress={() => {
              if (mounted.current && viewer && historySessionCurrent(viewer)) {
                router.push({ pathname: "/vehicle-history/requests/[id]", params: { id: request.id } });
              }
            }}>
            <Text>{t("vehicleHistory.open")}</Text>
          </Button>
        </View>
      ))}
      {query.hasNextPage && (
        <Button variant="secondary" disabled={query.isFetchingNextPage}
          accessibilityState={{ busy: query.isFetchingNextPage }} onPress={() => void query.fetchNextPage()}>
          <Text>{t(query.isFetchingNextPage ? "loading" : "vehicleHistory.older")}</Text>
        </Button>
      )}
    </Reader>
  );
}

export function RequestDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const viewer = useHistoryViewer();
  const query = useHistoryRequest(id, viewer, vehicleHistoryAvailable());
  const request = query.data;
  return (
    <Reader detail viewer={viewer} error={query.error} loading={query.isPending}
      refreshing={query.isRefetching} retry={() => void query.refetch()}>
      {request && <>
        <View className="gap-3 border-b-hairline border-border pb-5">
          <Text accessibilityRole="header" className="text-headline font-semibold">
            {t("vehicleHistory.enquiry")}
          </Text>
          <Text className="text-body">{t("vehicleHistory.awaitingOperator")}</Text>
          <Text className="text-callout text-muted-foreground">
            {new Date(request.createdAt).toLocaleString(localeTag(i18n.language))}
          </Text>
          <Text selectable className="text-footnote text-muted-foreground">
            {t("vehicleHistory.reference", { id: request.id.slice(0, 8).toUpperCase() })}
          </Text>
        </View>
        {request.sourceListingId && (
          <Text className="text-callout text-muted-foreground">{t("vehicleHistory.listingContext")}</Text>
        )}
        <Text className="text-body leading-6 text-muted-foreground">{t("vehicleHistory.emptyEnquiry")}</Text>
      </>}
    </Reader>
  );
}
