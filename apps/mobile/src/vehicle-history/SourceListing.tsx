import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";

import { useListingDetail } from "../api/listings/useListingDetail";
import { useHistoryRequest } from "../api/vehicle-history/requests";
import { useCatalogMaps } from "../listings/detail/useCatalogMaps";
import { ListingDetailView } from "../listings/components/ListingDetail";
import { useSafeBack } from "../navigation/useSafeBack";
import { ApiError } from "../api/client";

import { vehicleHistoryAvailable } from "./availability";
import { useHistoryViewer } from "./session";

import { StackHeader, BackButton } from "@/components/navigation/StackHeader";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { ErrorState } from "@/components/ErrorState";
import { Text } from "@/components/ui/text";

export function HistorySourceListing({ requestId, listingId }: { requestId: string; listingId: string }) {
  const { t } = useTranslation();
  const viewer = useHistoryViewer();
  const available = vehicleHistoryAvailable();
  const request = useHistoryRequest(requestId, viewer, available);
  const authorized = available && !!viewer && !request.isPending && !request.error && request.data?.sourceListingId === listingId;
  const listing = useListingDetail(listingId, { enabled: authorized });
  const data = authorized && !listing.error && listing.data && ["active", "sold", "archived"].includes(listing.data.status) ? listing.data : null;
  const { maps } = useCatalogMaps(data?.brandId, data?.modelId, data?.regionId);
  const back = useSafeBack(`/vehicle-history/requests/${encodeURIComponent(requestId)}`);
  const navigation = useNavigation("/");
  const publicNavigation = useNavigation();
  useEffect(() => {
    const state = navigation.getState();
    const previous = state?.routes[(state.index ?? 0) - 1];
    const current = state?.routes[state.index];
    const publicState = publicNavigation.getState();
    const source = publicState?.routes[publicState.index ?? 0];
    const params = source?.params as { id?: string; historyRequest?: string } | undefined;
    if (state?.index !== 1 || previous?.name !== "(tabs)" || current?.name !== "(public)"
      || publicState?.index !== 0 || source?.name !== "listings/[id]" || params?.id !== listingId || params.historyRequest !== requestId) return;
    const tabs = previous.state;
    const routes = tabs?.routes ?? [];
    const chat = routes.findIndex((route) => route.name === "chat");
    navigation.dispatch({ type: "RESET", payload: { ...state, index: 3, routes: [
      { ...previous, state: { ...tabs, index: chat < 0 ? routes.length : chat, routes: chat < 0 ? [...routes, { name: "chat" }] : routes } },
      { name: "vehicle-history/requests/index" },
      { name: "vehicle-history/requests/[id]", params: { id: requestId } },
      current,
    ] } });
  }, [navigation, publicNavigation, requestId, listingId]);
  const error = request.error ?? (authorized ? listing.error : null);
  const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
  const loading = available && viewer !== null && (viewer === undefined || request.isPending || authorized && listing.isPending);
  return <SafeScreen>
    <StackHeader title={t("vehicleHistory.sourceListing")} leading={<BackButton accessibilityLabel={t("vehicleHistory.backRequest")} onPress={back} />} />
    {!available || viewer === null || denied ? <Text accessibilityRole="alert" className="px-5 py-5">{t("vehicleHistory.sourceUnavailable")}</Text>
      : loading ? <ActivityIndicator accessibilityLabel={t("loading")} />
        : error ? <ErrorState error={error} onRetry={() => { void request.refetch(); if (authorized) void listing.refetch(); }} />
          : data ? <ListingDetailView listing={data} maps={maps} readOnly />
            : <Text accessibilityRole="alert" className="px-5 py-5">{t("vehicleHistory.sourceUnavailable")}</Text>}
  </SafeScreen>;
}
