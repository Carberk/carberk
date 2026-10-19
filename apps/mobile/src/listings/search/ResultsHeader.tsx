import type { ListingsSchemas } from "@auto-tm/contracts";
import { ArrowDownUp } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { formatPriceRange } from "../formatPrice";

import { BackButton, HeaderButton, StackHeader } from "@/components/navigation/StackHeader";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";

/**
 * The Results header: the circular back button, the matching count as the
 * title, and under it two quiet lines, the price range of the matches and the
 * chosen sort (one line cannot hold both in Turkmen or Russian without
 * cutting the sort). Sort is a circular button on the trailing edge, like
 * back; Results has no other header action.
 */
export function ResultsHeader({ count, sort, onSort, onBack }: {
  count?: ListingsSchemas.ListingCountResponse; sort: ListingsSchemas.FeedSort; onSort: () => void; onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const range = count?.priceMinTmt != null && count.priceMaxTmt != null
    ? formatPriceRange(count.priceMinTmt, count.priceMaxTmt, i18n.language) : null;
  return (
    <StackHeader
      leading={<BackButton onPress={onBack} accessibilityLabel={t("back")} />}
      trailing={<HeaderButton icon={ArrowDownUp} onPress={onSort} accessibilityLabel={t("resultsSort")} />}
    >
      <View className="min-w-0 flex-1">
        <Text className="font-heading text-subhead font-semibold text-foreground" style={tabularFigures} numberOfLines={1}>
          {count ? t("listingsCount", { total: count.totalMatching }) : t("carsBrowseTitle")}
        </Text>
        {range ? <Text className="text-caption text-muted-foreground" style={tabularFigures} numberOfLines={1}>{range}</Text> : null}
        <Text className="text-caption text-muted-foreground" numberOfLines={1}>{t(`resultsSort_${sort}`)}</Text>
      </View>
    </StackHeader>
  );
}
