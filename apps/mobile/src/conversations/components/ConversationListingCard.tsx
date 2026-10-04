import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Enums, type ConversationsSchemas } from "@auto-tm/contracts";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { closedListingBannerKey } from "@/src/listings/detail/closedListing";
import { buildVariantUrl } from "@/src/listings/detail/buildVariantUrl";
import { formatPrice } from "@/src/listings/formatPrice";
import { listingStatusLabel } from "@/src/listings/listingStatusLabel";

type ConversationListingCardProps =
  | {
      loading: true;
      listing?: undefined;
      brandName?: undefined;
      modelName?: undefined;
      unavailable?: undefined;
    }
  | {
      loading?: false;
      /** Null when the Listing is banned or deleted. */
      listing: ConversationsSchemas.ConversationListingCard | null;
      brandName?: string;
      modelName?: string;
      /** The Listing is banned or deleted: the strip stays readable but opens nothing. */
      unavailable?: boolean;
    };

/** The Listing strip pinned under the Conversation header. */
export function ConversationListingCard(props: ConversationListingCardProps) {
  const { t, i18n } = useTranslation();
  const { t: tConv } = useTranslation("conversations");

  if (props.loading) {
    return (
      <View
        className="flex-row items-center gap-3 px-4 py-2.5 border-b border-border"
        testID="conversation-listing-skeleton"
      >
        <Skeleton className="h-14 w-14 rounded-lg" />
        <View className="flex-1 gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </View>
      </View>
    );
  }

  const { listing, brandName, modelName, unavailable = false } = props;

  if (!listing) {
    return (
      <View className="flex-row items-center gap-3 px-4 py-2.5 border-b border-border">
        <View className="h-14 w-14 rounded-lg bg-muted" />
        <Text className="flex-1 text-sm text-muted-foreground">
          {tConv("listingUnavailable")}
        </Text>
      </View>
    );
  }

  const title = [listing.year ? String(listing.year) : null, brandName, modelName]
    .filter(Boolean)
    .join(" ");

  const priceText = formatPrice(listing.displayPriceTmt, i18n.language);

  const imageUrl = listing.coverMediaKey
    ? buildVariantUrl(listing.coverMediaKey, "thumbnail")
    : null;

  const closedKey = closedListingBannerKey(listing.status);
  const Wrapper = unavailable ? View : Pressable;

  return (
    <Wrapper
      {...(unavailable
        ? {}
        : {
            onPress: () => router.push(`/(public)/listings/${listing.id}`),
            accessibilityRole: "button" as const,
            accessibilityLabel: `${t("open")}: ${[title, priceText, closedKey && t(closedKey)].filter(Boolean).join(", ")}`,
          })}
      className={`flex-row items-center gap-3 px-4 py-2.5 border-b border-border${unavailable ? "" : " active:bg-muted/50"}`}
    >
      <View
        className={`h-14 w-14 rounded-lg bg-muted overflow-hidden${closedKey ? " opacity-60" : ""}`}
        testID="conversation-listing-thumbnail"
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            className="w-full h-full"
            contentFit="cover"
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <Text className="text-xs text-muted-foreground">{t("noImage")}</Text>
          </View>
        )}
      </View>

      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
          {title}
        </Text>
        <Text
          className={`text-sm ${closedKey ? "text-muted-foreground" : "text-foreground"}`}
        >
          {priceText}
        </Text>
        {closedKey ? (
          <Badge variant="secondary" className="self-start">
            <Text>{t(closedKey)}</Text>
          </Badge>
        ) : (
          listing.status !== Enums.ListingStatus.Active && (
            <Text className="text-xs text-muted-foreground">
              {listingStatusLabel(listing.status, t)}
            </Text>
          )
        )}
      </View>

      {!unavailable && (
        <View testID="conversation-listing-chevron">
          <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
        </View>
      )}
    </Wrapper>
  );
}
