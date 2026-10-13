import { View } from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { SkeletonText } from "@/components/ui/skeleton-text";
import { Text } from "@/components/ui/text";

/**
 * The owner's own Listing status and saves, above the title. The card-seeded
 * preview knows the status but not the saves, so they hold a placeholder.
 */
export function OwnerStatusCard({
  status,
  favoriteCount,
}: {
  status: ListingsSchemas.ListingSummary["status"];
  favoriteCount?: number;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2 rounded-xl bg-muted p-4">
      <Text className="text-body font-semibold">
        {t("yourListing")} · {t(status)}
      </Text>
      {/* Saves are counted by the API. Views are not counted yet, so no view figure is shown. */}
      {favoriteCount === undefined ? (
        <SkeletonText testID="owner-saves-loading" className="text-callout" width="40%" />
      ) : (
        <Text className="text-callout text-muted-foreground">
          {t("listingSaves", { count: favoriteCount })}
        </Text>
      )}
    </View>
  );
}
