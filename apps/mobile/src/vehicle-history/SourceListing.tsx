import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const error = request.error ?? (authorized ? listing.error : null);
  const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
  const loading = available && viewer !== null && (viewer === undefined || request.isPending || authorized && listing.isPending);
  return <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
    <StackHeader title={t("vehicleHistory.sourceListing")} leading={<BackButton accessibilityLabel={t("vehicleHistory.backRequest")} onPress={back} />} />
    {!available || viewer === null || denied ? <Text accessibilityRole="alert" className="px-5 py-5">{t("vehicleHistory.sourceUnavailable")}</Text>
      : loading ? <ActivityIndicator accessibilityLabel={t("loading")} />
        : error ? <ErrorState error={error} onRetry={() => { void request.refetch(); if (authorized) void listing.refetch(); }} />
          : data ? <ListingDetailView listing={data} maps={maps} readOnly />
            : <Text accessibilityRole="alert" className="px-5 py-5">{t("vehicleHistory.sourceUnavailable")}</Text>}
  </View>;
}
