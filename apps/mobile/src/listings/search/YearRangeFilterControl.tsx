import { useState, useEffect } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { FilterLabel, FilterRange } from "./FilterSection";
import { parseYearInput } from "./yearRangeFilterLogic";
import type { ListingFilter, UseListingFiltersReturn } from "./useListingFilters";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

interface YearRangeFilterControlProps {
  draft: ListingFilter;
  setField: UseListingFiltersReturn["setField"];
}

export function YearRangeFilterControl({
  draft,
  setField,
}: YearRangeFilterControlProps) {
  const { t } = useTranslation();
  const [minText, setMinText] = useState(draft.yearMin?.toString() ?? "");
  const [maxText, setMaxText] = useState(draft.yearMax?.toString() ?? "");
  const hasYearMin = Object.prototype.hasOwnProperty.call(draft, "yearMin");
  const hasYearMax = Object.prototype.hasOwnProperty.call(draft, "yearMax");

  useEffect(() => {
    setMinText(draft.yearMin?.toString() ?? "");
  }, [draft.yearMin, hasYearMin]);

  useEffect(() => {
    setMaxText(draft.yearMax?.toString() ?? "");
  }, [draft.yearMax, hasYearMax]);

  function handleMinChange(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 4);
    setMinText(digits);
    if (digits.length === 0 || digits.length === 4) {
      setField("yearMin", parseYearInput(digits));
    }
  }

  function handleMaxChange(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 4);
    setMaxText(digits);
    if (digits.length === 0 || digits.length === 4) {
      setField("yearMax", parseYearInput(digits));
    }
  }

  const isInvalid =
    draft.yearMin != null && draft.yearMax != null && draft.yearMin > draft.yearMax;

  return (
    <View className="gap-2">
      <FilterLabel>{t("yearRange")}</FilterLabel>
      {/* flex-row: the two fields sit side by side on one raised surface. */}
      <FilterRange>
        <View className="min-w-0 flex-1">
          <Input
            value={minText}
            onChangeText={handleMinChange}
            placeholder={t("from")}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel={t("from")}
            className={isInvalid ? "border-destructive" : undefined}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Input
            value={maxText}
            onChangeText={handleMaxChange}
            placeholder={t("to")}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel={t("to")}
            className={isInvalid ? "border-destructive" : undefined}
          />
        </View>
      </FilterRange>
      {isInvalid && (
        <Text className="px-1 text-callout text-destructive">
          {t("minYearExceedsMax")}
        </Text>
      )}
    </View>
  );
}
