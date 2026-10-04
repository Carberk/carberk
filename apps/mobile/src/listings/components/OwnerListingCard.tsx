import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { MoreHorizontal } from "lucide-react-native";
import { Enums } from "@auto-tm/contracts";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { buildVariantUrl } from "../detail/buildVariantUrl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/src/listings/formatPrice";

type ListingSummary = ListingsSchemas.ListingSummary;

interface OwnerListingCardProps {
  listing: ListingSummary;
  brandName?: string;
  modelName?: string;
  cityName?: string;
  onOpen: (id: string) => void;
  /** Opens the ⋯ sheet; the card passes the title the sheet shows. */
  onMore: (listing: ListingSummary, title: string) => void;
}

/** The row label: none for an active Listing, which is the norm in Active. */
function statusLabelKey(status: ListingSummary["status"]): string | null {
  switch (status) {
    case Enums.ListingStatus.Sold:
      return "myListingsStatusSold";
    case Enums.ListingStatus.Archived:
      return "removedFromSale";
    case Enums.ListingStatus.Banned:
      return "myListingsStatusBlocked";
    default:
      return null;
  }
}

/**
 * A My listings row. Tapping it opens the Listing in owner view and ⋯ opens
 * the actions its status allows. A blocked Listing shows a neutral note and
 * offers nothing: no ⋯, no tap, no reason and no appeal.
 */
export function OwnerListingCard({
  listing,
  brandName,
  modelName,
  cityName,
  onOpen,
  onMore,
}: OwnerListingCardProps) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = listing.coverMediaKey
    ? buildVariantUrl(listing.coverMediaKey, "list")
    : null;

  const title = [
    listing.year ? String(listing.year) : null,
    brandName ?? listing.brandId,
    modelName ?? listing.modelId,
  ].filter(Boolean).join(" ");

  const isBlocked = listing.status === Enums.ListingStatus.Banned;
  const isActive = listing.status === Enums.ListingStatus.Active;
  const labelKey = statusLabelKey(listing.status);

  const body = (
    <View className="flex-row gap-3 py-3 pl-4">
      <View
        className={cn(
          "h-[100px] w-[140px] shrink-0 overflow-hidden rounded-lg bg-muted",
          isActive ? "opacity-100" : "opacity-60",
        )}
      >
        {imageUrl && !imageFailed ? (
          <Image
            source={{ uri: imageUrl }}
            className="h-[100px] w-[140px]"
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Text className="text-xs text-muted-foreground">{t("noPhoto")}</Text>
          </View>
        )}
      </View>

      <View className="min-w-0 flex-1 gap-1 py-0.5">
        <Text
          className="text-base font-semibold leading-5 text-foreground"
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          className={cn("text-lg font-heading", isActive ? "text-primary" : "text-muted-foreground")}
          numberOfLines={1}
        >
          {formatPrice(listing.displayPriceTmt, i18n.language)}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2">
          {labelKey ? (
            <Text
              className={cn("text-xs font-semibold", isBlocked ? "text-destructive" : "text-foreground")}
            >
              {t(labelKey)}
            </Text>
          ) : null}
          <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
            {cityName ?? listing.cityId}
          </Text>
        </View>
        {isBlocked ? (
          <Text className="text-xs text-muted-foreground">{t("myListingsBlockedNote")}</Text>
        ) : null}
      </View>
    </View>
  );

  // ⋯ sits beside the tappable row, not inside it, so a screen reader reaches
  // it on its own instead of folding it into the row's label.
  return (
    <View className="flex-row items-start pr-1">
      {isBlocked ? (
        <View accessible className="flex-1 pr-12">{body}</View>
      ) : (
        <>
          <Pressable
            className="flex-1 active:opacity-90"
            onPress={() => onOpen(listing.id)}
            accessibilityRole="button"
            accessibilityLabel={labelKey ? `${title}, ${t(labelKey)}` : title}
          >
            {body}
          </Pressable>
          <Button
            variant="ghost"
            size="icon"
            className="mt-2 h-11 w-11"
            onPress={() => onMore(listing, title)}
            accessibilityLabel={t("myListingsActionsFor", { title })}
          >
            <Icon as={MoreHorizontal} className="size-5 text-foreground" />
          </Button>
        </>
      )}
    </View>
  );
}
