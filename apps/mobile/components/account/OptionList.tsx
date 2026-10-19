import { Check } from "lucide-react-native";
import { Fragment } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Where the list sits: `card` inside a `MenuGroup` on the page, `sheet` on a
 * sheet's surface, where the rows reach the sheet's edges so their press tone
 * does too, and the text lines up with the sheet's title.
 */
type OptionListPlacement = "card" | "sheet";

const ROW_PADDING: Record<OptionListPlacement, string> = { card: "px-4", sheet: "px-5" };
const DIVIDER_INSET: Record<OptionListPlacement, string> = { card: "ml-4", sheet: "ml-5" };

/**
 * One radio row per option, as iOS Settings draws a choice: the label, and a
 * checkmark in the text colour on the chosen row. Rows are 56 dp and separated
 * by inset hairlines. Pressing a row reports its value; the caller decides
 * what happens next.
 */
export function OptionList<T extends string>({
  options,
  value,
  onSelect,
  accessibilityLabel,
  placement = "card",
}: {
  options: readonly PickerOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  /** Names the radio group for screen readers. */
  accessibilityLabel: string;
  placement?: OptionListPlacement;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className={placement === "sheet" ? "-mx-5" : undefined}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <Fragment key={option.value}>
            {index > 0 ? (
              <View className={cn("h-px bg-border", DIVIDER_INSET[placement])} />
            ) : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              className={cn(
                "min-h-14 flex-row items-center justify-between gap-3 py-2 active:bg-secondary",
                ROW_PADDING[placement],
              )}
              onPress={() => onSelect(option.value)}
            >
              <Text className="min-w-0 flex-1 text-body text-foreground" numberOfLines={1}>
                {option.label}
              </Text>
              {/* The column keeps its width on every row, so labels never shift. */}
              <View className="size-6 items-center justify-center">
                {checked ? <Icon as={Check} className="size-5 text-foreground" /> : null}
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}
