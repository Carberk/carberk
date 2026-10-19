import type { ReactNode } from "react";
import { View, type TextProps, type ViewProps } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * The parts every Sell wizard step is built from, so the steps read as one
 * form: a quiet section name on the page, then one raised surface that holds
 * the section's fields. Inside the surface each field is a small label over a
 * tonal control.
 *
 * The surface's 8 dp padding makes the controls' 16 dp corners concentric
 * with its 24 dp corners. Labels, hints and errors are inset another 8 dp, so
 * every line of text in a section starts 16 dp from the surface's edge.
 */

/** One raised surface holding a group of fields. */
export function FormCard({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("gap-3 rounded-2xl bg-card p-2", className)} {...props} />;
}

/**
 * A section's name on the page, above its `FormCard`. It lines up with the
 * text inside the surface. The caller keeps any accessibility role the
 * section already had.
 */
export function FormSectionTitle({ className, ...props }: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("-mb-1 px-4 pt-2 text-body font-semibold text-foreground", className)}
      {...props}
    />
  );
}

/** One field inside a `FormCard`: its label, the control and the lines under it. */
export function FormField({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("gap-1.5", className)} {...props} />;
}

/** A field's name above its control. `trailing` sits at the end of the line, such as a character count. */
export function FieldLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-2 pt-1">
      <Text className="min-w-0 shrink text-footnote font-medium text-muted-foreground">
        {children}
      </Text>
      {trailing}
    </View>
  );
}

/** A quiet line under a control: what the field is for or what it accepts. */
export function FieldHint({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={cn("px-2 text-footnote text-muted-foreground", className)} {...props} />;
}

/** The track of a segmented control: tonal, with 4 dp of padding. */
export const SEGMENT_TRACK = "flex-row rounded-lg bg-secondary p-1";

/**
 * One segment: 44 dp tall, its 12 dp corners concentric with the track's 16 dp.
 * The chosen one is the raised tone (the lighter step in dark, so it still
 * reads as raised). Both states carry the same utilities, so no class is ever
 * added to or dropped from a mounted Pressable.
 */
export function segmentClass(selected: boolean, className?: string) {
  return cn(
    "min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-md border border-transparent px-2",
    selected ? "bg-card dark:bg-accent" : "bg-transparent dark:bg-transparent",
    className,
  );
}

/** A segment's label: the chosen one in SemiBold, the others quieter. */
export function segmentTextClass(selected: boolean) {
  return selected
    ? "text-callout font-semibold text-foreground"
    : "text-callout font-medium text-muted-foreground";
}

/** Why a field is not accepted, under its control. Read politely by a screen reader. */
export function FieldError({ className, ...props }: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("px-2 text-footnote text-destructive", className)}
      accessibilityLiveRegion="polite"
      {...props}
    />
  );
}
