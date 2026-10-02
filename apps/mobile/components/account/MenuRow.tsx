import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface MenuRowProps {
  label: string;
  onPress: () => void;
  /** A small grey icon before the label. */
  icon?: LucideIcon;
  /** Replaces the icon, such as the avatar on the large profile row. */
  lead?: ReactNode;
  /** A second line under the label. */
  sub?: string;
  /** The current value, shown at the end of the row. */
  value?: string;
  /** `link` shows the value as an action, such as Add on an empty Sign-in Method. */
  valueTone?: "default" | "link";
  chevron?: boolean;
  size?: "default" | "large";
  variant?: "default" | "danger";
}

/**
 * One plain menu row, as Cabinet and Profile list them: icon, label, optional
 * value and chevron. Screen readers read the label, then the second line and
 * the value.
 */
export function MenuRow({
  label,
  onPress,
  icon,
  lead,
  sub,
  value,
  valueTone = "default",
  chevron = false,
  size = "default",
  variant = "default",
}: MenuRowProps) {
  const large = size === "large";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, sub, value].filter(Boolean).join(", ")}
      className={cn(
        "flex-row items-center gap-3.5 px-4 py-2 active:bg-secondary",
        large ? "min-h-[76px]" : "min-h-14",
      )}
      onPress={onPress}
    >
      {lead ?? (icon ? <Icon as={icon} className="size-6 text-muted-foreground" /> : null)}
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            large ? "text-lg font-semibold" : "text-base",
            variant === "danger" ? "text-destructive" : "text-foreground",
          )}
        >
          {label}
        </Text>
        {sub ? (
          <Text className="text-[13px] text-muted-foreground" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          numberOfLines={1}
          className={cn(
            "shrink text-[15px]",
            valueTone === "link" ? "text-info-600 dark:text-info-400" : "text-muted-foreground",
          )}
        >
          {value}
        </Text>
      ) : null}
      {chevron ? <Icon as={ChevronRight} className="size-[18px] text-muted-foreground opacity-60" /> : null}
    </Pressable>
  );
}

/** Hairline divider between rows, inset to the label after the icon. */
export function MenuDivider() {
  return <View className="ml-[54px] h-px bg-border" />;
}

/** The thin gap between groups of rows. */
export function MenuGap() {
  return <View className="h-2 bg-secondary" />;
}
