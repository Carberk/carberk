import { useEffect } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { formatAmountInput, parseAmountInput } from "../formatPrice";

import { FilterLabel, FilterRange } from "./FilterSection";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { FIELD_SUFFIX_MAX_FONT_SCALE } from "@/lib/font-scale";

interface PriceRangeFilterControlProps {
  priceMin?: number;
  priceMax?: number;
  setField: (key: "priceMin" | "priceMax", value: number | undefined) => void;
  onValidityChange?: (valid: boolean) => void;
}

export function PriceRangeFilterControl({
  priceMin,
  priceMax,
  setField,
  onValidityChange,
}: PriceRangeFilterControlProps) {
  const { t, i18n } = useTranslation();
  const isInvalid =
    priceMin !== undefined && priceMax !== undefined && priceMin > priceMax;

  useEffect(() => {
    onValidityChange?.(!isInvalid);
  }, [isInvalid, onValidityChange]);

  // Cap whole digits before numeric conversion: every 15-digit integer is exact.
  // Keep the shared parser's pasted-decimal handling before counting digits.
  const setPrice = (key: "priceMin" | "priceMax", text: string) => {
    const digits = text.replace(/[.,]\d{1,2}(?=\D*$)/, "").replace(/\D/g, "");
    setField(key, parseAmountInput(digits.slice(0, 15)));
  };
  const handleMinChange = (text: string) => setPrice("priceMin", text);
  const handleMaxChange = (text: string) => setPrice("priceMax", text);

  return (
    <View className="gap-2">
      <FilterLabel>{t("priceRange")}</FilterLabel>
      <FilterRange>
        {/* The currency sits inside each field at its trailing edge, where the amount ends. */}
        <View className="min-w-0 flex-1 justify-center">
          <Input
            value={formatAmountInput(priceMin, i18n.language)}
            onChangeText={handleMinChange}
            placeholder={t("min")}
            keyboardType="number-pad"
            className={isInvalid ? "border-destructive pr-14" : "pr-14"}
          />
          <Text pointerEvents="none" maxFontSizeMultiplier={FIELD_SUFFIX_MAX_FONT_SCALE} className="absolute right-4 text-footnote font-medium text-muted-foreground">TMT</Text>
        </View>
        <View className="min-w-0 flex-1 justify-center">
          <Input
            value={formatAmountInput(priceMax, i18n.language)}
            onChangeText={handleMaxChange}
            placeholder={t("max")}
            keyboardType="number-pad"
            className={isInvalid ? "border-destructive pr-14" : "pr-14"}
          />
          <Text pointerEvents="none" maxFontSizeMultiplier={FIELD_SUFFIX_MAX_FONT_SCALE} className="absolute right-4 text-footnote font-medium text-muted-foreground">TMT</Text>
        </View>
      </FilterRange>
      {isInvalid && (
        <Text
          className="px-1 text-callout text-destructive"
          accessibilityLiveRegion="polite"
        >
          {t("minPriceExceedsMax")}
        </Text>
      )}
    </View>
  );
}
