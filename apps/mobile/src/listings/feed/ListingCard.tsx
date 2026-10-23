import { View } from "react-native";
import { Enums } from "@auto-tm/contracts";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { BusinessIdentityLink } from "../../business/BusinessIdentityLink";
import { formatPrice } from "../formatPrice";

import { ListingPhoto, cardPhotoThumbHash } from "./ListingPhoto";

import { Badge } from "@/components/ui/badge";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Text } from "@/components/ui/text";

type ListingSummary = ListingsSchemas.ListingSummary;

interface ListingCardProps {
  listing: ListingSummary;
  onPress: (id: string) => void;
  brandName?: string;
  modelName?: string;
  cityName?: string;
}

/**
 * The row card: the same raised object as the grid and large cards, laid on
 * its side. A 3:2 thumbnail sits inside the card's padding, so its 16 dp
 * corners are concentric with the card's 24 dp; beside it the price is the
 * loudest line, the title a step quieter and the city quietest.
 */
export function ListingCard({
  listing,
  onPress,
  brandName,
  modelName,
  cityName,
}: ListingCardProps) {
  const { t, i18n } = useTranslation();

  const titleParts = [
    listing.year ? String(listing.year) : null,
    brandName ?? t("loading"),
    modelName ?? t("loading"),
  ].filter(Boolean);

  return (
    <PressableScale
      feedback="surface"
      className="mx-4 flex-row gap-3 rounded-2xl bg-card p-2"
      onPress={() => onPress(listing.id)}
    >
      <View className="aspect-photo w-32 shrink-0 overflow-hidden rounded-lg bg-secondary">
        <ListingPhoto
          mediaKey={listing.coverMediaKey}
          thumbHash={cardPhotoThumbHash(listing, listing.coverMediaKey)}
          emptyLabel={t("noPhoto")}
          compact
        />
      </View>

      <View className="min-w-0 flex-1 justify-between py-1 pr-2">
        <View className="gap-0.5">
          <Text className="font-heading text-subhead font-bold text-foreground" numberOfLines={1}>
            {formatPrice(listing.displayPriceTmt, i18n.language)}
          </Text>
          <Text className="text-callout font-medium text-foreground" numberOfLines={2}>
            {titleParts.join(" ")}
          </Text>
        </View>

        {listing.business ? <BusinessIdentityLink business={listing.business} compact /> : null}
        <View className="flex-row flex-wrap items-center gap-2">
          {listing.status === Enums.ListingStatus.Sold && (
            <Badge variant="secondary" className="shrink-0 px-2 py-0.5">
              <Text className="text-caption text-secondary-foreground">{t("sold")}</Text>
            </Badge>
          )}
          <Text className="min-w-0 flex-1 text-footnote text-muted-foreground" numberOfLines={1}>
            {cityName ?? t("loading")}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}
