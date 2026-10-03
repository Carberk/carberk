import { View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { Enums } from "@auto-tm/contracts";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  closedListingBannerKey,
  similarListingsHref,
} from "@/src/listings/detail/closedListing";

interface ListingClosedBannerProps {
  listing: { status: Enums.ListingStatus; brandId: string; modelId: string };
  brandName?: string;
  modelName?: string;
}

/**
 * The inline notice after the last Message when the Listing is sold or removed
 * from sale. The Conversation stays open; the link opens Results for the same
 * brand and model, as Listing detail's "See other" does (#352 D1, Q3).
 */
export function ListingClosedBanner({
  listing,
  brandName,
  modelName,
}: ListingClosedBannerProps) {
  const { t } = useTranslation();
  const { t: tConv } = useTranslation("conversations");

  const closed = closedListingBannerKey(listing.status);
  if (!closed) return null;

  const linkLabel =
    brandName && modelName
      ? t("seeOtherBrandModel", { brand: brandName, model: modelName })
      : null;

  return (
    <View
      className="mx-4 my-2.5 rounded-xl bg-secondary px-3 py-2.5"
      testID="listing-closed-banner"
    >
      <View className="flex-row items-start gap-2">
        <Icon as={Info} className="mt-0.5 size-4 text-muted-foreground" />
        <Text className="flex-1 text-sm text-foreground">
          {tConv(closed === "sold" ? "closedBannerSold" : "closedBannerRemoved")}
        </Text>
      </View>
      {linkLabel && (
        <Button
          variant="link"
          onPress={() => router.navigate(similarListingsHref(listing))}
          className="h-11 self-start px-0"
          accessibilityLabel={linkLabel}
        >
          <Text>{linkLabel}</Text>
          <Icon as={ChevronRight} className="size-4 text-info-600 dark:text-info-400" />
        </Button>
      )}
    </View>
  );
}
