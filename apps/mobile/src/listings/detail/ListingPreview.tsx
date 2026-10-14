import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBodyTypes } from "../../api/catalog/useBodyTypes";
import { useColors } from "../../api/catalog/useColors";
import { useDriveTypes } from "../../api/catalog/useDriveTypes";
import { useEngineTypes } from "../../api/catalog/useEngineTypes";
import { useTransmissions } from "../../api/catalog/useTransmissions";
import type { CachedListingSummary } from "../../api/listings/findCachedListingSummary";
import { ContactCtaBar } from "../components/ContactCtaBar";
import { DetailPhotoStrip, type StripPhoto } from "../components/DetailPhotoStrip";
import { keySpecs, PENDING, specRows } from "../components/ListingSpecs";
import { PriceDisplay } from "../components/PriceDisplay";
import { feedCardPhotoKeys, feedCardPhotoThumbHashes } from "../feed/feedCardFields";
import { useFeedCatalogMaps } from "../feed/useFeedCatalogMaps";
import { ownerListingActions } from "../ownerListingActions";

import { closedListingBannerKey, isClosedForContact } from "./closedListing";
import { DetailHeader, PendingDetailActions } from "./DetailHeader";
import { DetailSkeletonBody } from "./DetailSkeleton";
import { OwnerStatusCard } from "./OwnerStatusCard";
import { detailDate } from "./presentation";

import { StickyActionBar, useStickyActionBar } from "@/components/navigation/StickyActionBar";
import { Text } from "@/components/ui/text";

export interface ListingPreviewProps {
  /** The tapped card's cached data. */
  summary: CachedListingSummary;
  isOwner: boolean;
  /** Reporting is on, so a buyer's loaded header will hold ⋯. */
  reportEnabled?: boolean;
  onBack: () => void;
}

/**
 * Listing detail before its own request returns, built only from the tapped
 * card and laid out as the loaded detail is: the same header row, the photos
 * the card knows in the same strip (the rest of the Listing's photos as grey
 * tiles), title, price, date and city, and the specifications the card knows
 * in their final cells. The rest of the specifications, the description and the
 * seller load behind placeholders of their own shape, and Call and Message
 * stay disabled until the full detail replaces this screen. Nothing here is
 * written to the detail cache.
 */
export function ListingPreview({ summary, isOwner, reportEnabled = true, onBack }: ListingPreviewProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const bar = useStickyActionBar("screen");
  const listings = useMemo(() => [summary], [summary]);
  const names = useFeedCatalogMaps(listings);
  const transmissions = useTransmissions();
  const engineTypes = useEngineTypes();
  const driveTypes = useDriveTypes();
  const bodyTypes = useBodyTypes();
  const colors = useColors();

  const closed = !isOwner && isClosedForContact(summary.status);
  const bannerKey = closed ? closedListingBannerKey(summary.status) : null;
  // Every photo the card knows, at the `detail` size the Results strip
  // already decoded, so each paints from memory; the Listing's other photos
  // hold their tiles until detail names them.
  const photos = useMemo<StripPhoto[]>(() => {
    const hashes = feedCardPhotoThumbHashes(summary);
    const known = feedCardPhotoKeys(summary).map((key, index) => ({ key, thumbHash: hashes[index] }));
    const pending = Array.from({ length: Math.max(0, summary.photoCount - known.length) }, (_, index) => ({
      key: `pending-${index}`,
      pending: true as const,
    }));
    return [...known, ...pending];
  }, [summary]);

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
      <DetailHeader
        topInset={insets.top}
        onBack={onBack}
        trailing={
          <PendingDetailActions
            favorite={!isOwner && !closed}
            favorited={summary.isFavorited ?? false}
            more={isOwner ? ownerListingActions(summary.status).length > 0 : !closed && reportEnabled}
          />
        }
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: bar.space }}>
        <DetailPhotoStrip photos={photos} banner={bannerKey ? t(bannerKey) : undefined} />

        <View testID="detail-body" className="gap-4 px-4 py-5">
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
