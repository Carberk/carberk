import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { FilterLabel } from "./FilterSection";

import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";

type SellerTypeValue = "personal" | "business" | undefined;

interface SellerTypeFilterControlProps {
  value: SellerTypeValue;
  onChange: (value: SellerTypeValue) => void;
}

export function SellerTypeFilterControl({
  value,
  onChange,
}: SellerTypeFilterControlProps) {
  const { t } = useTranslation();

  const segments: { value: SellerTypeValue; label: string }[] = [
    { value: undefined, label: t("any") },
    { value: "personal", label: t("sellerTypePersonal") },
    { value: "business", label: t("sellerTypeBusiness") },
  ];

  return (
    <View className="gap-2">
      <FilterLabel>{t("sellerType")}</FilterLabel>
      <View className="flex-row rounded-lg bg-secondary p-1">
        {segments.map((segment) => {
          const selected = value === segment.value;
          return (
            <Pressable
              key={segment.label}
              onPress={() => onChange(segment.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${segment.label} ${t("sellerType")}`}
              className={cn(
                "min-h-11 flex-1 items-center justify-center rounded-md px-2",
                selected && "bg-card",
                selected && "shadow-raised dark:bg-accent",
              )}
            >
              <Text
                className={cn(
                  "text-callout",
                  selected ? "font-semibold" : "font-medium",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
