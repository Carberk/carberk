import { SlidersHorizontal, X } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { localeTag } from "../../i18n/resources";

import type { ListingFilter } from "./useListingFilters";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { Presence } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";
import { cn } from "@/lib/utils";

export type ChipGroup = "city" | "price" | "year" | "seller";

/**
 * The Filters entry and one chip per active filter group, in a row that
 * scrolls sideways. Every chip is the same capsule: Filters names itself in
 * semibold with its icon and, when filters apply, their count in a small ink
 * badge; each active filter shows its value and a ✕ that removes it.
 *
 * In the list's header the chips are raised capsules on the page. `floating`
 * is the same row pinned above the tab bar while the list scrolls under it:
 * there every chip is glass.
 *
 * A chip fades in when its filter is applied and out when it is removed, and
 * its neighbours slide to close the gap.
 */
export function FilterChipsRow({ filters, cityName, onOpen, onRemove, floating = false }: {
  filters: ListingFilter; cityName?: string; onOpen: () => void; onRemove: (group: ChipGroup) => void;
  /** Pinned over scrolling content: glass chips and a floating shadow. */
  floating?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const chips: { group: ChipGroup; label: string }[] = [];
  const range = (min?: number, max?: number, unit = "") => {
    const format = (n: number) => n.toLocaleString(localeTag(i18n.language), { useGrouping: unit === "TMT" });
    return min != null && max != null ? `${format(min)} – ${format(max)} ${unit}`.trim() : min != null ? t("resultsFrom", { value: `${format(min)} ${unit}`.trim() }) : max != null ? t("resultsUpTo", { value: `${format(max)} ${unit}`.trim() }) : "";
  };
  if (filters.sellerType) chips.push({ group: "seller", label: t(filters.sellerType === "business" ? "sellerTypeBusiness" : "sellerTypePersonal") });
  if (filters.cityId) chips.push({ group: "city", label: cityName ?? t("city") });
  if (filters.priceMin != null || filters.priceMax != null) chips.push({ group: "price", label: range(filters.priceMin, filters.priceMax, "TMT") });
  if (filters.yearMin != null || filters.yearMax != null) chips.push({ group: "year", label: range(filters.yearMin, filters.yearMax) });
  const filtersChip = <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={t("resultsFilterCount", { count: chips.length })}
    className={cn("min-h-11 flex-row items-center gap-2 rounded-full py-1 pl-4", chips.length > 0 ? "pr-2.5" : "pr-5", floating ? "active:opacity-80" : "bg-card active:bg-secondary")}>
    <Icon as={SlidersHorizontal} className="size-4 text-foreground" strokeWidth={2.2} /><Text className="text-callout font-semibold text-foreground">{t("filters")}</Text>
    {chips.length > 0 ? <View className="h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5"><Text className="text-caption font-semibold text-background" style={tabularFigures}>{chips.length}</Text></View> : null}
  </PressableScale>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    // A floating chip's shadow reaches past the row; the row must not cut it.
    className={floating ? "overflow-visible" : undefined} contentContainerClassName="items-center gap-2 px-4 py-2">
    {floating ? <GlassSurface className="rounded-full">{filtersChip}</GlassSurface> : filtersChip}
    {chips.map((chip) => {
      const body = <PressableScale onPress={() => onRemove(chip.group)} accessibilityRole="button" accessibilityLabel={t(`resultsRemove_${chip.group}`)}
        className={cn("min-h-11 flex-row items-center gap-1.5 rounded-full py-1 pl-4 pr-3", floating ? "active:opacity-80" : "bg-card active:bg-secondary")}>
        <Text className="text-callout font-medium text-foreground">{chip.label}</Text><Icon as={X} className="size-4 text-muted-foreground" strokeWidth={2.2} />
      </PressableScale>;
      return <Presence key={chip.group}>
        {floating ? <GlassSurface className="rounded-full">{body}</GlassSurface> : body}
      </Presence>;
    })}
  </ScrollView>;
}
