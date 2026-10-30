import { router } from "expo-router";
import { useState } from "react";
import { Car, ChevronRight, Search } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { useListingCount } from "../../api/listings/useListingCount";
import { HistoryEntry } from "../../services/HistoryEntry";
import { BrandLogo } from "../../auth/BrandLogo";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/navigation/ScreenHeader";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";
import { localeTag } from "@/src/i18n/resources";

/**
 * Home's header above the New listings grid: the Carberk wordmark with 🔍
 * (opens Search), the "Brand, model" card with the live Listing count (opens
 * the Brand picker), and the New listings heading with See all (opens Results).
 *
 * The "Brand, model" entry stays compact: a plain muted car mark, a
 * body-size semibold label, a quiet live count and a small chevron. The
 * raised surface separates it from the page without competing with photos.
 */
export function HomeHeader() {
  const { t, i18n } = useTranslation();
  const count = useListingCount({});
  const [seeAllPressed, setSeeAllPressed] = useState(false);

  return (
    <View className="gap-5 pb-1">
      <View className="flex-row items-center justify-between px-5 pt-2">
        <View className="h-11 justify-center">
          <BrandLogo width={132} height={24} />
        </View>
        <Button
          variant="secondary"
          size="icon"
          className="h-11 w-11"
          onPress={() => router.push("/(tabs)/(search)/search")}
          accessibilityLabel={t("search")}
        >
          <Icon as={Search} className="size-5 text-foreground" strokeWidth={2.2} />
        </Button>
      </View>

      <View className="mx-4"><HistoryEntry/></View>

      <PressableScale
        feedback="surface"
        className="mx-4 min-h-16 flex-row items-center gap-3 rounded-2xl border-hairline border-border bg-card px-4 py-3 active:bg-secondary"
        onPress={() => router.push("/(tabs)/(search)/brands")}
        accessibilityRole="button"
        accessibilityLabel={t("brandModel")}
      >
        <Icon as={Car} className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className="text-body font-semibold text-foreground"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t("brandModel")}
          </Text>
          {count.data ? (
            <Text className="text-footnote text-muted-foreground" style={tabularFigures} numberOfLines={1}>
              {t("listingsCount", {
                total: count.data.totalMatching.toLocaleString(
                  localeTag(i18n.language),
                ),
              })}
            </Text>
          ) : count.isPending ? (
            <Skeleton className="my-1 h-3 w-24" />
          ) : null}
        </View>
        <Icon as={ChevronRight} className="size-4 shrink-0 text-muted-foreground" />
      </PressableScale>

      <SectionHeader
        title={t("newListings")}
        className="pr-2"
        trailing={
          <Button
            variant="ghost"
            className="min-h-11 px-3 active:bg-transparent"
            feedback="none"
            style={{ backgroundColor: "transparent", opacity: seeAllPressed ? 0.6 : 1 }}
            onPressIn={() => setSeeAllPressed(true)}
            onPressOut={() => setSeeAllPressed(false)}
            onPress={() => {
              setSeeAllPressed(false);
              router.push("/(tabs)/(search)/results");
            }}
          >
            <Text className="text-body font-medium text-foreground">{t("seeAll")}</Text>
          </Button>
        }
      />
    </View>
  );
}
