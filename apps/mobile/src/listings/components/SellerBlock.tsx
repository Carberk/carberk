import { View } from "react-native";
import { MapPin } from "lucide-react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { BusinessIdentityLink } from "../../business/BusinessIdentityLink";
import { localeTag } from "../../i18n/resources";
import { useDisplayName } from "../../identity/useDisplayName";

import { PublicUserAvatar } from "@/components/identity/PublicUserAvatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface SellerBlockProps {
  seller: ListingsSchemas.ListingDetail["seller"];
  business?: ListingsSchemas.ListingDetail["business"];
  cityName?: string;
  locationText?: string;
}
export function SellerBlock({
  seller,
  business,
  cityName,
  locationText,
}: SellerBlockProps) {
  const { t, i18n } = useTranslation();
  const displayNameOf = useDisplayName();
  // A deleted seller has no name; "Private seller" then stands alone.
  const name = seller.deleted ? null : displayNameOf(seller);
  const joined = new Intl.DateTimeFormat(localeTag(i18n.language), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(seller.memberSince));
  const location = [cityName, locationText].filter(Boolean).join(" · ");
  if (business) return <BusinessIdentityLink business={business} />;
  return (
    <View className="gap-3">
      <Text className="text-subhead font-semibold">{t("seller")}</Text>
      <View className="flex-row gap-3 items-center">
        <PublicUserAvatar size={44} user={seller} />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            className="text-body font-semibold"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {name ?? t("privateSeller")}
          </Text>
          {name && (
            <Text className="text-callout text-muted-foreground">
              {t("privateSeller")}
            </Text>
          )}
          <Text className="text-callout text-muted-foreground">
            {t("sellerSince", { date: joined })}
          </Text>
        </View>
      </View>
      {!!location && (
        <View className="flex-row gap-2">
          <Icon as={MapPin} className="size-4 text-muted-foreground" />
          <Text className="flex-1 text-callout text-muted-foreground">
            {location}
          </Text>
        </View>
      )}
    </View>
  );
}
