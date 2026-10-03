import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Enums } from "@auto-tm/contracts";
import { AlertCircle } from "lucide-react-native";

import { Text } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { buildVariantUrl } from "@/src/listings/detail/buildVariantUrl";
import { formatPrice } from "@/src/listings/formatPrice";

export interface PostRefCardProps {
  listingId: string;
  brandId: string;
  modelId: string;
  year?: number;
  displayPriceTmt: number;
  priceCurrency: string;
  coverMediaKey?: string;
  status: Enums.ListingStatus;
  available: boolean;
  brandName?: string;
  modelName?: string;
  loading?: boolean;
  error?: string | null;
  onPress?: (listingId: string) => void;
  /** Long press on the card; an unavailable card has no press target, so the bubble handles it. */
  onLongPress?: () => void;
}

export function PostRefCard({
  listingId,
  brandId,
  modelId,
  year,
  displayPriceTmt,
  coverMediaKey,
  status,
  available,
  brandName,
  modelName,
  loading,
  error,
  onPress,
  onLongPress,
}: PostRefCardProps) {
  const { t, i18n } = useTranslation();

  const title = [
    year ? String(year) : null,
    brandName ?? brandId.slice(0, 8),
    modelName ?? modelId.slice(0, 8),
  ]
    .filter(Boolean)
    .join(" ");

  const priceText = formatPrice(displayPriceTmt, i18n.language);

  const imageUrl = coverMediaKey
    ? buildVariantUrl(coverMediaKey, "thumbnail")
    : null;

  const isUnavailable = !available || status !== Enums.ListingStatus.Active;

  let unavailableLabel = t("unavailable");
  if (status === Enums.ListingStatus.Sold) {
    unavailableLabel = t("sold");
  } else if (status === Enums.ListingStatus.Archived) {
    unavailableLabel = t("archived");
  }

  if (loading) {
    return (
      <View className="flex-row items-center gap-3 w-full">
        <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
        <View className="flex-1 gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-row items-center gap-2 px-1 py-2">
        <Icon as={AlertCircle} className="size-5 text-destructive shrink-0" />
        <Text className="text-sm text-destructive flex-1" numberOfLines={2}>
          {error}
        </Text>
      </View>
    );
  }

  const cardBody = (
    <View
      className={`flex-row items-center gap-3 w-full overflow-hidden rounded-xl border p-2 ${
        isUnavailable
          ? "bg-muted/60 border-border opacity-80"
          : "bg-card border-border"
      }`}
    >
      <View className="w-16 h-16 rounded-lg bg-muted overflow-hidden shrink-0">
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

      <View className="flex-1 gap-1 min-w-0">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-sm text-muted-foreground">{priceText}</Text>
        <View className="flex-row items-center gap-2">
          <Badge
            variant={isUnavailable ? "secondary" : "outline"}
            className="px-1.5 py-0"
          >
            <Text
              className={`text-xs ${
                isUnavailable
                  ? "text-secondary-foreground"
                  : "text-foreground"
              }`}
            >
              {isUnavailable ? unavailableLabel : t("active")}
            </Text>
          </Badge>
        </View>
      </View>
    </View>
  );

  if (isUnavailable) {
    return cardBody;
  }

  return (
    <Pressable
      onPress={() => onPress?.(listingId)}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${t("open")}: ${title}`}
    >
      {cardBody}
    </Pressable>
  );
}
