import { View } from "react-native";
import { Eye } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/** Shared footer/owner-card wording; no optimistic increment or compact notation. */
export function ListingViewCount({ total, today, className = "text-caption text-muted-foreground" }: {
  total?: number; today?: number; className?: string;
}) {
  const { t, i18n } = useTranslation();
  if (!total || total < 0) return null;
  const number = new Intl.NumberFormat(i18n.language);
  const lifetime = t("listingViews", { count: total, number: number.format(total) });
  return <View className="flex-row items-center gap-1">
    <Icon as={Eye} className="size-3.5 text-muted-foreground" accessibilityElementsHidden importantForAccessibility="no" />
    <Text className={className}>{today && today > 0
    ? `${lifetime} · ${t("listingViewsToday", { number: number.format(today) })}`
    : lifetime}</Text>
  </View>;
}
