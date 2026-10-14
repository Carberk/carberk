import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useListingDetail } from "../../../src/api/listings/useListingDetail";
import { useListingPreview } from "../../../src/api/listings/useListingPreview";
import { useCatalogMaps } from "../../../src/listings/detail/useCatalogMaps";
import { useSafeBack } from "../../../src/navigation/useSafeBack";
import { ListingDetailView } from "../../../src/listings/components/ListingDetail";
import {
  isClosedForContact,
  similarListingsHref,
} from "../../../src/listings/detail/closedListing";
import { ContactCtaBar } from "../../../src/listings/components/ContactCtaBar";
import { useViewer } from "../../../src/auth/useViewer";
import {
  useReplayAuthAction,
  useAuthIntentStore,
} from "../../../src/auth/intentStore";
import { useAuth } from "../../../src/auth/useAuth";
import { CollapsingHeader } from "../../../src/listings/detail/CollapsingHeader";
import { DetailSkeleton } from "../../../src/listings/detail/DetailSkeleton";
import { ListingPreview } from "../../../src/listings/detail/ListingPreview";
import { useDetailPhotosBottom } from "../../../src/listings/components/DetailPhotoStrip";
import { OwnerActions } from "../../../src/listings/components/OwnerActions";
import { HOME_HREF } from "../../../src/navigation/homeHref";
import { useConfig } from "../../../src/api/admin/useConfig";
import { ReportSheet } from "../../../src/admin/components/ReportSheet";

import { ErrorState } from "@/components/ErrorState";
import { StickyActionBar, useStickyActionBar } from "@/components/navigation/StickyActionBar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

function UnavailableState({
  insets,
}: {
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const { t } = useTranslation();
  const goBack = useSafeBack();
  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6 gap-4"
      style={{ paddingBottom: insets.bottom }}
    >
      <Text className="text-subhead font-semibold text-foreground">
        {t("notAvailable")}
      </Text>
      <Button size="pill" onPress={() => router.navigate(HOME_HREF)}>
        <Text>{t("goHome")}</Text>
      </Button>
      <Button variant="outline" size="pill" onPress={goBack}>
        <Text>{t("back")}</Text>
      </Button>
    </View>
  );
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();
  const insets = useSafeAreaInsets();
  const { data, isPending, error, refetch } = useListingDetail(id ?? "");
  const preview = useListingPreview(id ?? "");
  const viewer = useViewer();
  const { data: config } = useConfig();
  const [reportOpen, setReportOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  // Two flags, not the offset, so a scroll re-renders the screen only when one flips.
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // The header shows the price and title once the photos have scrolled away.
  const photosBottom = useDetailPhotosBottom();
  // The screen reaches the bottom edge, so the bar clears the system inset itself.
  const bar = useStickyActionBar("screen");

  const { maps } = useCatalogMaps(data?.brandId, data?.modelId, data?.regionId);

  const isOwner =
    viewer != null && data != null && viewer.userId === data.sellerId;

  // Reporting while signed out parks a pending action; returning from
  // authentication reopens the report sheet on this same screen.
  useReplayAuthAction("report", id, () => setReportOpen(true));

  const handleReport = () => {
    if (isAuthenticated === false) {
      useAuthIntentStore
        .getState()
        .requireSignIn(router, {
          returnTo: `/(public)/listings/${id}`,
          action: { kind: "report", listingId: id },
        });
    } else if (isAuthenticated === true) {
      setReportOpen(true);
    }
  };

  if (isPending) {
    // A tapped card seeds the screen at once; a deep link has no card.
    return preview ? (
      <ListingPreview
        summary={preview}
        isOwner={viewer != null && viewer.userId === preview.sellerId}
        reportEnabled={config?.reportEntryEnabled !== false}
        onBack={goBack}
      />
    ) : (
      <DetailSkeleton bottomInset={insets.bottom} onBack={goBack} />
    );
  }

  if (error || !data) {
    const isNotFound =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status?: number }).status === 404;

    if (isNotFound) {
      return <UnavailableState insets={insets} />;
    }

    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingBottom: insets.bottom }}
      >
        <ErrorState error={error} onRetry={() => refetch()} />
      </View>
    );
  }

  const showContactBar = !isOwner && !isClosedForContact(data.status);
  const hasBar = showContactBar || isOwner;

  return (
    <View className="flex-1 bg-background">
      <CollapsingHeader
        listing={data}
        maps={maps}
        collapsed={collapsed}
        scrolled={scrolled}
        topInset={insets.top}
        onBack={goBack}
        onReport={
          config?.reportEntryEnabled !== false ? handleReport : undefined
        }
        ownerMenu={
          isOwner ? (
            <OwnerActions
              listingId={data.id}
              status={data.status}
              mode="menu"
            />
          ) : undefined
        }
      />

      {/* Main content: the page scrolls below the header row, runs under the
          floating action bar and ends clear of it. */}
      <View className="flex-1" style={hasBar ? undefined : { paddingBottom: insets.bottom }}>
        <ListingDetailView
          bottomSpace={hasBar ? bar.space : 0}
          listing={data}
          maps={maps}
          isOwner={isOwner}
          onReport={
            config?.reportEntryEnabled !== false ? handleReport : undefined
          }
          onScroll={(event) => {
            const y = event.nativeEvent.contentOffset.y;
            setScrolled(y > 0);
            setCollapsed(y >= photosBottom);
          }}
          onSeeSimilar={() => router.navigate(similarListingsHref(data))}
        />
      </View>

      {/* Buyer CTAs only for non-owners on Listings still open for contact */}
      {showContactBar && (
        <StickyActionBar {...bar.barProps}>
          <ContactCtaBar
            variant="floating"
            listingId={data.id}
            contactPhone={data.contactPhone}
            allowCalls={data.allowCalls}
            allowChat={data.allowChat}
            status={data.status}
          />
        </StickyActionBar>
      )}

      {isOwner && (
        <StickyActionBar {...bar.barProps}>
          <OwnerActions listingId={data.id} status={data.status} mode="bar" />
        </StickyActionBar>
      )}

      <ReportSheet
        targetType="listing"
        targetId={data.id}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </View>
  );
}
