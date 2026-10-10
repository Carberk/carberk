import { useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEngineTypes } from "../../api/catalog/useEngineTypes";
import { useTransmissions } from "../../api/catalog/useTransmissions";
import { GalleryBanner, GalleryCounter } from "../components/GalleryImage";
import { ContactCtaBar } from "../components/ContactCtaBar";
import { PriceDisplay } from "../components/PriceDisplay";
import { listingSpecLine } from "../feed/listingSpecLine";
import { useFeedCatalogMaps } from "../feed/useFeedCatalogMaps";

import { buildOriginalUrl, buildVariantUrl } from "./buildVariantUrl";
import { closedListingBannerKey, isClosedForContact } from "./closedListing";
import { DetailSkeletonBody } from "./DetailSkeleton";
import { detailDate } from "./presentation";

import { BackButton } from "@/components/navigation/StackHeader";
import { StickyActionBar, useStickyActionBar } from "@/components/navigation/StickyActionBar";
import { Text } from "@/components/ui/text";

export interface ListingPreviewProps {
  /** The tapped card's cached data. */
  summary: ListingsSchemas.ListingSummary;
  isOwner: boolean;
  onBack: () => void;
}

/**
 * Listing detail before its own request returns, built only from the tapped
 * card: the photo, title, price, spec line, city and date. Specs, description
 * and seller load behind skeletons, and Call and Message stay disabled until
 * the full detail replaces this screen. Nothing here is written to the detail
 * cache.
 */
export function ListingPreview({ summary, isOwner, onBack }: ListingPreviewProps) {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bar = useStickyActionBar("screen");
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const listings = useMemo(() => [summary], [summary]);
  const names = useFeedCatalogMaps(listings);
  const transmissions = useTransmissions();
  const engineTypes = useEngineTypes();

  const closed = !isOwner && isClosedForContact(summary.status);
  const bannerKey = closed ? closedListingBannerKey(summary.status) : null;
  const coverKey = summary.photoKeys[0] ?? summary.coverMediaKey;
  // The card decoded the `list` size already, so it shows at once while the
  // `detail` size the gallery opens on loads behind it. The gallery then finds
  // that size cached, and the photo never blanks when the full detail arrives.
  const imageUri = coverKey
    ? useOriginalImage
      ? buildOriginalUrl(coverKey)
      : buildVariantUrl(coverKey, "detail")
    : null;
  const placeholderUri = coverKey ? buildVariantUrl(coverKey, "list") : null;

  const title = [
    [names.brandName(summary.brandId), names.modelName(summary.modelId)]
      .filter(Boolean)
      .join(" "),
    summary.year,
  ]
    .filter(Boolean)
    .join(", ");

  const specLine = listingSpecLine({
    mileageKm: summary.mileageKm,
    transmissionName: summary.transmissionId
      ? transmissions.data?.items.find((item) => item.id === summary.transmissionId)?.name
      : undefined,
    engineTypeName: summary.engineTypeId
      ? engineTypes.data?.items.find((item) => item.id === summary.engineTypeId)?.name
      : undefined,
    locale: i18n.language,
    kmLabel: t("km"),
  });

  const dateAndCity = [
    detailDate(summary.publishedAt, i18n.language),
    names.cityName(summary.cityId),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="flex-1 bg-background">
      <View
        className="absolute left-0 right-0 top-0 z-20 px-3 py-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <BackButton tone="glass" accessibilityLabel={t("back")} onPress={onBack} />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: bar.space }}>
        {imageUri ? (
          <View style={{ width, height: width * 0.65 }}>
            <Image
              source={{ uri: imageUri }}
              placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
              placeholderContentFit="cover"
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              priority="high"
              cachePolicy="memory-disk"
              onError={() => setUseOriginalImage(true)}
            />
            {summary.photoCount > 0 && (
              <GalleryCounter
                position={1}
                total={summary.photoCount}
                aboveBanner={Boolean(bannerKey)}
              />
            )}
            {bannerKey && <GalleryBanner label={t(bannerKey)} />}
          </View>
        ) : (
          <View className="h-[240px] w-full items-center justify-center bg-muted">
            <Text className="text-callout text-muted-foreground">{t("noPhotos")}</Text>
            {bannerKey && <GalleryBanner label={t(bannerKey)} />}
          </View>
        )}

        <View className="gap-4 px-5 py-5">
          <Text className="text-headline font-heading font-semibold text-foreground" numberOfLines={2}>
            {title || t("listing")}
          </Text>
          <PriceDisplay
            displayPriceTmt={summary.displayPriceTmt}
            priceAmount={summary.priceAmount}
            priceCurrency={summary.priceCurrency}
            acceptsExchange={false}
            installmentAvailable={false}
            muted={closed}
          />
          {specLine.length > 0 && (
            <Text className="text-callout text-foreground">{specLine}</Text>
          )}
          {dateAndCity.length > 0 && (
            <Text className="text-callout text-muted-foreground">{dateAndCity}</Text>
          )}
          <DetailSkeletonBody />
        </View>
      </ScrollView>

      {!isOwner && !closed && (
        <StickyActionBar {...bar.barProps}>
          <ContactCtaBar
            variant="floating"
            listingId={summary.id}
            allowCalls={false}
            allowChat={false}
            status={summary.status}
            pending
            replayAuth={false}
          />
        </StickyActionBar>
      )}
    </View>
  );
}
