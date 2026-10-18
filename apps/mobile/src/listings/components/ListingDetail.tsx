import { useRef, useState } from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { ChevronRight, Flag } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import type { CatalogMaps } from "../detail/useCatalogMaps";
import {
  closedListingBannerKey,
  isClosedForContact,
} from "../detail/closedListing";
import { AskSellerChips } from "../detail/AskSellerChips";
import { ListingViewCount } from "../detail/ListingViewCount";
import { OwnerStatusCard } from "../detail/OwnerStatusCard";
import { listingTitle, detailDate } from "../detail/presentation";
import { ViewerFavorite } from "../detail/ViewerFavorite";

import { ContactCtaBar } from "./ContactCtaBar";
import { keySpecs, specRows, SpecificationsSection } from "./ListingSpecs";
import { PhotoGallery } from "./PhotoGallery";
import { PriceDisplay } from "./PriceDisplay";
import { SellerBlock } from "./SellerBlock";

import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type ListingDetail = ListingsSchemas.ListingDetail;
interface ListingDetailProps {
  listing: ListingDetail;
  maps: CatalogMaps;
  isOwner?: boolean;
  onReport?: () => void;
  onSeeSimilar?: () => void;
  onScroll?: ScrollViewProps["onScroll"];
  /** Room kept at the end of the scroll for a bar that floats over it. */
  bottomSpace?: number;
}
export function ListingDetailView({
  listing,
  maps,
  isOwner = false,
  onReport,
  onSeeSimilar,
  onScroll,
  bottomSpace = 0,
}: ListingDetailProps) {
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<View>(null);
  const [visibleTop, setVisibleTop] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const closed = !isOwner && isClosedForContact(listing.status);
  const banner = closed ? closedListingBannerKey(listing.status) : null;
  // The viewer's ♡ and Call + Message follow the screen's own rules: not for
  // the owner, and not on a Listing closed for contact.
  const showViewerActions = !isOwner && !closed;
  const brandName = maps.brandName(listing.brandId);
  const modelName = maps.modelName(listing.modelId);
  const specs = keySpecs(
    {
      year: listing.year,
      mileageKm: listing.mileageKm,
      transmission: listing.transmissionId
        ? maps.transmissionName(listing.transmissionId)
        : undefined,
      engineType: listing.engineTypeId
        ? maps.engineTypeName(listing.engineTypeId)
        : undefined,
      enginePower: listing.enginePower,
      driveType: listing.driveTypeId
        ? maps.driveTypeName(listing.driveTypeId)
        : undefined,
    },
    t,
    i18n.language,
  );
  const rows = specRows(
    {
      condition: listing.condition,
      bodyType: listing.bodyTypeId
        ? maps.bodyTypeName(listing.bodyTypeId)
        : undefined,
      color: listing.colorId ? maps.colorName(listing.colorId) : undefined,
      vin: listing.vin,
    },
    t,
  );
  return (
    <View ref={scrollRef} collapsable={false} className="flex-1" onLayout={() => scrollRef.current?.measureInWindow((_x, y) => setVisibleTop(y))}>
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: bottomSpace }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <PhotoGallery
        listingId={listing.id}
        visibleTop={visibleTop}
        media={listing.media}
        banner={banner ? t(banner) : undefined}
        viewerHeaderAction={
          showViewerActions
            ? (close) => (
                <ViewerFavorite
                  listingId={listing.id}
                  isFavorited={listing.isFavorited ?? false}
                  onBeforeSignIn={close}
                />
              )
            : undefined
        }
        viewerFooter={
          showViewerActions
            ? (close) => (
                <ContactCtaBar
                  variant="viewer"
                  replayAuth={false}
                  onBeforeMessage={close}
                  listingId={listing.id}
                  contactPhone={listing.contactPhone}
                  allowCalls={listing.allowCalls}
                  allowChat={listing.allowChat}
                  status={listing.status}
                />
              )
            : undefined
        }
      />
      <View testID="detail-body" className="gap-4 px-4 py-5">
        {isOwner && (
          <OwnerStatusCard status={listing.status} favoriteCount={listing.favoriteCount} viewCount={listing.viewCount} viewsToday={listing.viewsToday} />
        )}
        <Text
          className="text-headline font-heading font-semibold text-foreground"
          numberOfLines={2}
        >
          {listingTitle(listing, maps) || t("listing")}
        </Text>
        <PriceDisplay
          displayPriceTmt={listing.displayPriceTmt}
          priceAmount={listing.priceAmount}
          priceCurrency={listing.priceCurrency}
          acceptsExchange={listing.acceptsExchange}
          installmentAvailable={listing.installmentAvailable}
          isOwner={isOwner}
          muted={closed}
        />
        <Text className="text-callout text-muted-foreground">
          {[
            detailDate(listing.publishedAt, i18n.language),
            maps.cityName(listing.cityId),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {closed && onSeeSimilar && brandName && modelName && (
          <Button variant="secondary" size="sm" onPress={onSeeSimilar}>
            <Text numberOfLines={1}>
              {t("seeOtherBrandModel", { brand: brandName, model: modelName })}
            </Text>
            <Icon as={ChevronRight} className="size-4" />
          </Button>
        )}
        <SpecificationsSection specs={specs} rows={rows} />
        {listing.description && (
          <View className="gap-2">
            <Separator className="mb-3" />
            <Text className="text-subhead font-semibold">{t("description")}</Text>
            <Text
              className="text-body leading-6"
              numberOfLines={expanded ? undefined : 3}
            >
              {listing.description}
            </Text>
            {!expanded && (
              <Button
                variant="link"
                size="sm"
                className="self-start px-0"
                onPress={() => setExpanded(true)}
              >
                <Text>{t("detailMore")}</Text>
              </Button>
            )}
          </View>
        )}
        {!isOwner && !closed && listing.allowChat && (
          <View className="gap-3">
            <Separator />
            <AskSellerChips
              listingId={listing.id}
              isOwner={isOwner}
              status={listing.status}
              allowChat={listing.allowChat}
            />
          </View>
        )}
        {listing.conditionDisclosure && (
          <View className="gap-3">
            <Separator />
            <ConditionDisclosureSection
              disclosure={listing.conditionDisclosure}
            />
          </View>
        )}
        {listing.vinHistory?.decoded === true && (
          <View className="gap-3">
            <Separator />
            <VinHistorySection vinHistory={listing.vinHistory} />
          </View>
        )}
        {!isOwner && (
          <View className="gap-3">
            <Separator />
            <SellerBlock
              seller={listing.seller}
              cityName={maps.cityName(listing.cityId)}
              locationText={listing.locationText}
            />
          </View>
        )}
        {!isOwner && listing.status === "active" && onReport && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onPress={onReport}
          >
            <Icon as={Flag} className="size-4 text-muted-foreground" />
            <Text className="text-muted-foreground">{t("report")}</Text>
          </Button>
        )}
        <Separator />
        <View className="gap-1 pb-5">
          {(isOwner || !closed) && <ListingViewCount total={listing.viewCount} today={listing.viewsToday} />}
          <Text className="text-caption text-muted-foreground">
            {t("publicListingId", { id: listing.publicNumber })}
          </Text>
          <View className="flex-row gap-2">
            <Text className="text-caption text-muted-foreground">
              {t("detailPublished")}
            </Text>
            <Text className="text-caption text-muted-foreground">
              {detailDate(listing.publishedAt, i18n.language)}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Text className="text-caption text-muted-foreground">
              {t("detailEdited")}
            </Text>
            <Text className="text-caption text-muted-foreground">
              {detailDate(listing.updatedAt, i18n.language)}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
    </View>
  );
}
function VinHistorySection({
  vinHistory,
}: {
  vinHistory: Extract<
    NonNullable<ListingDetail["vinHistory"]>,
    { decoded: true }
  >;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1">
      <Text className="text-subhead font-semibold">{t("vinHistory")}</Text>
      {vinHistory.brand && (
        <VinHistoryRow label={t("brand")} value={vinHistory.brand} />
      )}
      {vinHistory.model && (
        <VinHistoryRow label={t("model")} value={vinHistory.model} />
      )}
      {vinHistory.year !== undefined && (
        <VinHistoryRow label={t("year")} value={String(vinHistory.year)} />
      )}
      {vinHistory.bodyType && (
        <VinHistoryRow label={t("bodyType")} value={vinHistory.bodyType} />
      )}
      {vinHistory.engineType && (
        <VinHistoryRow label={t("engineType")} value={vinHistory.engineType} />
      )}
      <Text className="text-callout text-muted-foreground">
        {t("vinConfidence", { value: Math.round(vinHistory.confidence * 100) })}
      </Text>
    </View>
  );
}
function VinHistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-body text-foreground">{label}:</Text>
      <Text
        className="min-w-0 flex-1 text-body font-medium text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** ADR-0052: the seller's own statement; renders nothing without an answer. */
function ConditionDisclosureSection({
  disclosure,
}: {
  disclosure: ListingsSchemas.ListingDetail["conditionDisclosure"];
}) {
  const { t } = useTranslation();
  if (!disclosure) return null;

  return (
    <View className="gap-1">
      <Text className="text-callout font-semibold uppercase tracking-wide text-muted-foreground">
        {t("conditionAsStatedBySeller")}
      </Text>
      <View className="flex-row items-start gap-2">
        <Text className="text-body text-foreground">{t("damaged")}:</Text>
        <Text
          className={cn(
            "min-w-0 flex-1 text-body font-medium",
            disclosure.damaged ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {disclosure.damaged ? t("yes") : t("no")}
        </Text>
      </View>
      {disclosure.knownIssuesText && (
        <View className="gap-0.5">
          <Text className="text-callout text-muted-foreground">
            {t("knownIssuesText")}
          </Text>
          <Text className="text-body text-foreground">
            {disclosure.knownIssuesText}
          </Text>
        </View>
      )}
    </View>
  );
}
