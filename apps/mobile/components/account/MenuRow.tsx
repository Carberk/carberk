import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import { ArrowUpRight, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { cn } from "@/lib/utils";
import { tabularFigures } from "@/lib/font";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface MenuRowProps {
  label: string;
  onPress: () => void;
  /** A small icon before the label, on a tonal disc. */
  icon?: LucideIcon;
  /** Replaces the icon, such as the avatar on the large profile row. */
  lead?: ReactNode;
  /** A second line under the label. */
  sub?: string;
  /** The current value, shown at the end of the row. */
  value?: string;
  /** `link` shows the value as an action, such as Add on an empty Sign-in Method. */
  valueTone?: "default" | "link";
  /** A chevron: the row opens a screen or a sheet inside the app. */
  chevron?: boolean;
  /** An arrow out of the row: it opens a page outside the app, such as a legal page. */
  external?: boolean;
  size?: "default" | "large";
  /** Ends a long label in "…" instead of wrapping, as on the Cabinet profile row. */
  singleLineLabel?: boolean;
  variant?: "default" | "danger";
}

/**
 * One menu row, as Cabinet and Profile list them: an icon on a tonal disc,
 * the label, an optional value and a trailing mark. Rows sit inside a
 * `MenuGroup`, so every row in the app shares one height, one icon tone and
 * one trailing column. Screen readers read the label, then the second line
 * and the value.
 *
 * Geometry: 16 dp of padding, a 36 dp disc and a 12 dp gap put the label at
 * 64 dp, where `MenuDivider` starts. Rows are 56 dp, the large row 80 dp.
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
  external = false,
  size = "default",
  singleLineLabel = false,
  variant = "default",
}: MenuRowProps) {
  const large = size === "large";
  const danger = variant === "danger";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, sub, value].filter(Boolean).join(", ")}
      className={cn(
        "flex-row items-center gap-3 px-4 active:bg-secondary",
        large ? "min-h-20 py-3" : "min-h-14 py-2",
      )}
      onPress={onPress}
    >
      {lead ??
        (icon ? (
          <View className="size-9 items-center justify-center rounded-full bg-secondary">
            <Icon
              as={icon}
              className={cn("size-5", danger ? "text-destructive" : "text-foreground")}
            />
          </View>
        ) : null)}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          numberOfLines={singleLineLabel ? 1 : undefined}
          className={cn(
            large ? "font-heading text-subhead font-semibold" : "text-body",
            danger ? "text-destructive" : "text-foreground",
          )}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            className="text-footnote text-muted-foreground"
            style={tabularFigures}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          numberOfLines={1}
          style={tabularFigures}
          className={cn(
            "shrink text-body",
            valueTone === "link"
              ? "font-medium text-info-600 dark:text-info-400"
              : "text-muted-foreground",
          )}
        >
          {value}
        </Text>
      ) : null}
      {chevron ? (
        <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
      ) : external ? (
        <Icon as={ArrowUpRight} className="size-4 text-muted-foreground" />
      ) : null}
    </Pressable>
  );
}

/**
 * A group of rows on one raised surface. Groups are separated by page, not by
 * lines; inside a group the rows are separated by an inset `MenuDivider`.
 */
export function MenuGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn("mx-4 overflow-hidden rounded-2xl bg-card", className)}>{children}</View>
  );
}

/**
 * Divider between rows of a group, inset to where the label starts: past the
 * icon disc (`icon`), or at the row's own padding for rows without one (`text`).
 */
export function MenuDivider({ inset = "icon" }: { inset?: "icon" | "text" }) {
  return <View className={cn("h-px bg-border", inset === "icon" ? "ml-16" : "ml-4")} />;
}

/** The space between two groups of rows. */
export function MenuGap() {
  return <View className="h-4" />;
}

/**
 * A small, quiet name above a group, aligned with the text inside the rows.
 * It names the group; the rows carry the meaning, so it stays out of the way.
 */
export function MenuSectionLabel({ children }: { children: string }) {
  return (
    <Text className="px-8 pb-2 text-footnote font-medium tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

/** A note under a group, aligned with the text inside the rows. */
export function MenuFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("px-8 pt-2", className)}>{children}</View>;
}
