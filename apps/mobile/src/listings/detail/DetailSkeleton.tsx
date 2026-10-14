import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  keySpecs,
  PENDING_KEY_SPECS,
  PENDING_SPEC_ROWS,
  specRows,
  SpecificationsSection,
  type ListingSpec,
} from "../components/ListingSpecs";
import { DetailPhotoStripSkeleton } from "../components/DetailPhotoStrip";

import { DetailHeader } from "./DetailHeader";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonText } from "@/components/ui/skeleton-text";

/**
 * The part of Listing detail that loads behind placeholders, in the loaded
 * sections' own shape: Specifications (heading, key-figure grid, rows), the
 * description and the seller. The deep-link skeleton and the card-seeded
 * preview both end with it; the preview passes the specifications it knows.
 */
export function DetailSkeletonBody({
  specs,
  rows,
  seller = true,
}: {
  specs?: ListingSpec[];
  rows?: ListingSpec[];
  /** The owner's own Listing has no Seller card. */
  seller?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View testID="detail-skeleton-body" className="gap-4">
      <SpecificationsSection
        specs={specs ?? keySpecs(PENDING_KEY_SPECS, t, i18n.language)}
        rows={rows ?? specRows(PENDING_SPEC_ROWS, t)}
      />

      <View testID="description-loading" className="gap-2">
        <Separator className="mb-3" />
        <SkeletonText className="text-subhead font-semibold" width="35%" />
        <View>
          <SkeletonText className="text-body leading-6" width="100%" />
          <SkeletonText className="text-body leading-6" width="100%" />
          <SkeletonText className="text-body leading-6" width="60%" />
        </View>
      </View>

      {seller && (
        <View testID="seller-loading" className="gap-3">
          <Separator />
          <View className="gap-3">
            <SkeletonText className="text-subhead font-semibold" width="30%" />
            <View className="flex-row items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <View className="min-w-0 flex-1 gap-1">
                <SkeletonText className="text-body font-semibold" width="45%" />
                <SkeletonText className="text-callout" width="35%" />
                <SkeletonText className="text-callout" width="55%" />
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * A deep link has no card to borrow from: the loaded detail's top with
 * nothing filled in (the header row with Back, one grey photo tile, then
 * title, price and date lines), then the same placeholder body.
 */
export function DetailSkeleton({
  bottomInset,
  onBack,
}: {
  bottomInset: number;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="detail-skeleton"
      className="flex-1 bg-background"
      style={{ paddingBottom: bottomInset }}
    >
      <DetailHeader topInset={insets.top} onBack={onBack} />
      <DetailPhotoStripSkeleton />

      <View testID="detail-body" className="gap-4 px-4 py-5">
        <SkeletonText
          testID="title-loading"
          className="text-headline font-heading font-semibold"
          width="70%"
        />
        <SkeletonText testID="price-loading" className="text-title font-heading" width="45%" />
        <SkeletonText testID="date-loading" className="text-callout" width="40%" />
        <DetailSkeletonBody />
      </View>
    </View>
  );
}
