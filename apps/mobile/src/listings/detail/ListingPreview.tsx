import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBodyTypes } from "../../api/catalog/useBodyTypes";
import { useColors } from "../../api/catalog/useColors";
import { useDriveTypes } from "../../api/catalog/useDriveTypes";
import { useEngineTypes } from "../../api/catalog/useEngineTypes";
import { useTransmissions } from "../../api/catalog/useTransmissions";
import type { CachedListingSummary } from "../../api/listings/findCachedListingSummary";
import { GalleryBanner, GalleryCounter } from "../components/GalleryImage";
import { ContactCtaBar } from "../components/ContactCtaBar";
import { keySpecs, PENDING, specRows } from "../components/ListingSpecs";
import { NoPhotosFrame, useListingPhotoFrame } from "../components/ListingPhotoFrame";
import { LISTING_PHOTO_POSITION, ListingPhotoUnderlay } from "../components/ListingPhotoUnderlay";
import { PriceDisplay } from "../components/PriceDisplay";
import { useFeedCatalogMaps } from "../feed/useFeedCatalogMaps";

import { buildOriginalUrl, buildVariantUrl } from "./buildVariantUrl";
import { closedListingBannerKey, isClosedForContact } from "./closedListing";
import { DetailSkeletonBody } from "./DetailSkeleton";
import { OwnerStatusCard } from "./OwnerStatusCard";
import { detailDate } from "./presentation";

import { BackButton } from "@/components/navigation/StackHeader";
import { StickyActionBar, useStickyActionBar } from "@/components/navigation/StickyActionBar";
import { Text } from "@/components/ui/text";

export interface ListingPreviewProps {
  /** The tapped card's cached data. */
  summary: CachedListingSummary;
  isOwner: boolean;
  onBack: () => void;
}

/**
 * Listing detail before its own request returns, built only from the tapped
 * card and laid out as the loaded detail is: the photo in the same frame and
 * fit, title, price, date and city, and the specifications the card knows in
 * their final cells. The rest of the specifications, the description and the
 * seller load behind placeholders of their own shape, and Call and Message
 * stay disabled until the full detail replaces this screen. Nothing here is
 * written to the detail cache.
 */
export function ListingPreview({ summary, isOwner, onBack }: ListingPreviewProps) {
  const { t, i18n } = useTranslation();
  const frame = useListingPhotoFrame();
  const insets = useSafeAreaInsets();
  const bar = useStickyActionBar("screen");
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const listings = useMemo(() => [summary], [summary]);
  const names = useFeedCatalogMaps(listings);
  const transmissions = useTransmissions();
  const engineTypes = useEngineTypes();
  const driveTypes = useDriveTypes();
  const bodyTypes = useBodyTypes();
  const colors = useColors();

  const closed = !isOwner && isClosedForContact(summary.status);
  const bannerKey = closed ? closedListingBannerKey(summary.status) : null;
  const coverKey = summary.photoKeys[0] ?? summary.coverMediaKey;
  // The `detail` size the gallery opens on loads here, so the gallery finds it
  // cached and the photo never blanks when the full detail arrives. It is drawn
  // whole in the gallery's frame, fit and position, so nothing moves.
  const imageUri = coverKey
    ? useOriginalImage
      ? buildOriginalUrl(coverKey)
      : buildVariantUrl(coverKey, "detail")
    : null;
  const placeholderUri = coverKey ? buildVariantUrl(coverKey, "list") : null;
  // Until `detail` loads, the frame shows what will not move when it does
  // (`ListingPhotoUnderlay`): the card's `list` crop only on an about 4:3
  // cover, and the cover's blurred colours.
  const thumbHash = summary.photoKeys[0] ? summary.photoThumbHashes?.[0] : undefined;

  const title = [
    [names.brandName(summary.brandId), names.modelName(summary.modelId)]
      .filter(Boolean)
      .join(" "),
    summary.year,
  ]
    .filter(Boolean)
    .join(", ");

  // A card from an API that sends `hasVin` also says which optional
  // specifications the Listing has (#867), so every entry takes its final
  // place; an older API's card holds them as placeholders. A name still
  // loading keeps its cell.
  const knowsAll = summary.hasVin !== undefined;
  const named = (id: string | undefined, items: { id: string; name: string }[] | undefined) =>
    id ? (items?.find((item) => item.id === id)?.name ?? PENDING) : undefined;
  const specs = keySpecs(
    {
      year: summary.year,
      mileageKm: summary.mileageKm,
      transmission: named(summary.transmissionId, transmissions.data?.items),
      engineType: named(summary.engineTypeId, engineTypes.data?.items),
      enginePower: knowsAll ? summary.enginePower : PENDING,
      driveType: knowsAll ? named(summary.driveTypeId, driveTypes.data?.items) : PENDING,
    },
    t,
    i18n.language,
  );
  const rows = specRows(
    {
      condition: summary.condition,
      bodyType: knowsAll ? named(summary.bodyTypeId, bodyTypes.data?.items) : PENDING,
      color: knowsAll ? named(summary.colorId, colors.data?.items) : PENDING,
      vin: summary.hasVin ? PENDING : undefined,
    },
    t,
  );

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
          <View testID="listing-photo-frame" className="bg-muted" style={frame}>
            {!photoLoaded && (
              <ListingPhotoUnderlay thumbHash={thumbHash} listUri={placeholderUri ?? undefined} />
            )}
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              contentPosition={LISTING_PHOTO_POSITION}
              priority="high"
              cachePolicy="memory-disk"
              onLoad={() => setPhotoLoaded(true)}
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
          <NoPhotosFrame banner={bannerKey ? t(bannerKey) : undefined} />
        )}

        <View className="gap-4 px-5 py-5">
          {isOwner && <OwnerStatusCard status={summary.status} />}
          <Text className="text-headline font-heading font-semibold text-foreground" numberOfLines={2}>
            {title || t("listing")}
          </Text>
          <PriceDisplay
            displayPriceTmt={summary.displayPriceTmt}
            priceAmount={summary.priceAmount}
            priceCurrency={summary.priceCurrency}
            acceptsExchange={summary.acceptsExchange ?? false}
            installmentAvailable={summary.installmentAvailable ?? false}
            isOwner={isOwner}
            muted={closed}
          />
          {dateAndCity.length > 0 && (
            <Text className="text-callout text-muted-foreground">{dateAndCity}</Text>
          )}
          <DetailSkeletonBody specs={specs} rows={rows} seller={!isOwner} />
        </View>
      </ScrollView>

      {!isOwner && !closed && (
        <StickyActionBar {...bar.barProps}>
          <ContactCtaBar
            variant="floating"
            listingId={summary.id}
            // Laid out as the loaded bar: Call only when the seller takes
            // calls and the Listing has a contact phone; an older API's card
            // keeps the disabled Call.
            allowCalls={(summary.allowCalls ?? true) && summary.hasContactPhone !== false}
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
