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
import { useListingPhotoFrame } from "../components/ListingPhotoFrame";

import { BackButton } from "@/components/navigation/StackHeader";
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

      <View className="gap-2">
        <Separator className="mb-3" />
        <SkeletonText className="text-subhead font-semibold" width="35%" />
        <View>
          <SkeletonText className="text-body leading-6" width="100%" />
          <SkeletonText className="text-body leading-6" width="100%" />
          <SkeletonText className="text-body leading-6" width="60%" />
        </View>
      </View>

      {seller && (
        <View className="gap-3">
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
 * A deep link has no card to borrow from: the loaded detail's shape with
 * nothing filled in, under the same photo frame and Back button.
 */
export function DetailSkeleton({
  bottomInset,
  onBack,
}: {
  bottomInset: number;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const frame = useListingPhotoFrame();
  return (
    <View
      testID="detail-skeleton"
      className="flex-1 bg-background"
      style={{ paddingBottom: bottomInset }}
    >
      <Skeleton testID="listing-photo-frame" className="rounded-none" style={frame} />

      <View className="gap-4 px-5 py-5">
        <SkeletonText className="text-headline font-heading font-semibold" width="70%" />
        <SkeletonText className="text-title font-heading" width="45%" />
        <SkeletonText className="text-callout" width="40%" />
        <DetailSkeletonBody />
      </View>

      <View
        className="absolute left-0 right-0 top-0 z-20 px-3 py-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <BackButton tone="glass" accessibilityLabel={t("back")} onPress={onBack} />
      </View>
    </View>
  );
}
