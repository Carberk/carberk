import type { ListingsSchemas } from "@auto-tm/contracts";
import { Camera } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { AuthHref } from "../../auth/intentStore";
import { useListingFavorite } from "../useListingFavorite";

import { listingGridCardText } from "./listingGridCardText";
import { ListingPhoto, PhotoChip, PhotoFavoriteButton } from "./ListingPhoto";

import { EnterOnce, MotionView, usePressScale } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";

interface ListingGridCardProps {
  listing: ListingsSchemas.ListingSummary;
  onPress: (id: string) => void;
  brandName?: string;
  modelName?: string;
  isAuthenticated: boolean | null;
  returnTo: AuthHref;
  /** Brand and model names are still loading; show a title placeholder. */
  titlePending?: boolean;
  /**
   * The card's place in the first page's staggered arrival; leave it out for
   * a card that should simply be there (see `useListEntrance`).
   */
  enterOrder?: number;
}

/**
 * Home "New listings" card (32 — Listings, Cards; Auto.ru AR-01-002). The
 * photo is the card: a 3:2 picture rounded on all four corners, with ♡ on it
 * and the photo count when there is more than one, and no raised box around
 * it. The text sits on the page under it: the price loudest in bold tabular
 * figures, "Brand Model" regular, and "year, km" or "year, New" quietest.
 * Two sit side by side. The whole card gives under a finger; the heart is a
 * control of its own beside the pressable area.
 */
export const ListingGridCard = memo(function ListingGridCard({
  listing,
  onPress,
  brandName,
  modelName,
  isAuthenticated,
  returnTo,
  titlePending = false,
  enterOrder,
}: ListingGridCardProps) {
  const { t, i18n } = useTranslation();
  const coverKey = listing.photoKeys[0] ?? listing.coverMediaKey;
  const press = usePressScale("surface");
  const { favorited, toggle } = useListingFavorite({
    listingId: listing.id,
    isFavorited: listing.isFavorited ?? false,
    isAuthenticated,
    returnTo,
  });

  const text = listingGridCardText({
    listing,
    brandName,
    modelName,
    locale: i18n.language,
    newLabel: t("new"),
    kmLabel: t("km"),
  });

  return (
    <EnterOnce order={enterOrder} className="min-w-0 flex-1">
      {/* No `flex-1` below the root: these two size to their content. A view
          that flexes down the card measures 0 tall when the list re-measures
          its row, and the row collapses into the one above it. */}
      <MotionView style={press.style}>
        <Pressable
          onPress={() => onPress(listing.id)}
          {...press.handlers}
          accessibilityRole="button"
          accessibilityLabel={[text.title, text.price, text.meta]
            .filter(Boolean)
            .join(", ")}
        >
          <View className="aspect-photo w-full overflow-hidden rounded-2xl bg-secondary">
            <ListingPhoto mediaKey={coverKey} emptyLabel={t("noPhoto")} />
            {listing.photoCount > 1 ? (
              <PhotoChip
                icon={Camera}
                label={String(listing.photoCount)}
                className="bottom-2 left-2"
              />
            ) : null}
          </View>

          <View className="px-1 pb-2 pt-2">
            <Text
              className="font-heading text-subhead font-bold text-foreground"
              style={tabularFigures}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {text.price}
            </Text>
            {text.title ? (
              <Text className="text-callout text-foreground" numberOfLines={1}>
                {text.title}
              </Text>
            ) : titlePending ? (
              <Skeleton className="my-1 h-3 w-4/5" />
            ) : null}
            {text.meta ? (
              <Text className="text-footnote text-muted-foreground" style={tabularFigures} numberOfLines={1}>
                {text.meta}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <PhotoFavoriteButton
          favorited={favorited}
          onPress={toggle}
          accessibilityLabel={t("favorite")}
          accessibilityState={{ selected: favorited }}
        />
      </MotionView>
    </EnterOnce>
  );
});

/** Same shape as `ListingGridCard`, for the first load. */
export function ListingGridCardSkeleton() {
  return (
    <View className="min-w-0 flex-1">
      {/* aspect-ratio does not reach the animated Skeleton, so a plain View
          owns the 3:2 frame. */}
      <View className="aspect-photo w-full overflow-hidden rounded-2xl">
        <Skeleton className="h-full w-full rounded-none" />
      </View>
      {/* Each bar fills its text line (24, 20 and 18 dp), so the grid does not
          jump when the first page replaces the skeletons. */}
      <View className="px-1 pb-2 pt-2">
        <Skeleton className="my-1 h-4 w-3/5" />
        <Skeleton className="my-1 h-3 w-4/5" />
        <Skeleton className="my-1 h-2.5 w-2/5" />
      </View>
    </View>
  );
}

const SKELETON_ROWS = [0, 1, 2];

/** Three rows of two card skeletons, for the grid's first load. */
export function ListingGridSkeleton() {
  return (
    <View className="mt-3 gap-3 px-4">
      {SKELETON_ROWS.map((row) => (
        <View key={row} className="flex-row gap-3">
          <ListingGridCardSkeleton />
          <ListingGridCardSkeleton />
        </View>
      ))}
    </View>
  );
}
