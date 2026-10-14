import { ChevronLeft, X, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { Button, type ButtonProps } from "@/components/ui/button";
import { GlassSurface, useSystemGlass } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLargeText } from "@/lib/font-scale";
import { cn } from "@/lib/utils";

/**
 * `tonal` is the filled circle on the page. `plain` has no fill, for a row of
 * quiet actions. `glass` is the floating circle for a header that lies over a
 * photo or over scrolling content (Listing detail): system Liquid Glass on
 * iOS 26, the tuned glass surface elsewhere.
 */
type HeaderButtonTone = "tonal" | "plain" | "glass";

type HeaderCircleButtonProps = Omit<ButtonProps, "children" | "size"> & {
  tone?: HeaderButtonTone;
  children?: ReactNode;
};

/**
 * The 44 dp header circle around any glyph, for the rare action whose glyph
 * changes in place (a favourite that shows a spinner while it saves). Prefer
 * `HeaderButton`, which draws the glyph too.
 *
 * The glass circle is the glass itself, so the whole circle answers a finger:
 * on iOS 26 the interactive system glass swells and lights under it, and the
 * button drops its own press scale so nothing moves twice; elsewhere the
 * button's press scale moves the whole circle.
 */
export function HeaderCircleButton({
  tone = "tonal",
  className,
  children,
  ...props
}: HeaderCircleButtonProps) {
  const systemGlass = useSystemGlass();

  if (tone === "glass") {
    return (
      <Button
        variant="ghost"
        size="icon"
        feedback={systemGlass ? "none" : "control"}
        className={cn(
          "border-0 bg-transparent active:bg-transparent disabled:border-0 disabled:bg-transparent",
          className,
        )}
        {...props}
      >
        <GlassSurface interactive className="size-11 items-center justify-center rounded-full">
          {children}
        </GlassSurface>
      </Button>
    );
  }

  return (
    <Button
      variant={tone === "tonal" ? "secondary" : "ghost"}
      size="icon"
      // A plain action has no fill, disabled too: only its glyph quietens.
      className={cn(tone === "plain" && "disabled:border-0 disabled:bg-transparent", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

type HeaderButtonProps = Omit<HeaderCircleButtonProps, "children"> & {
  icon: LucideIcon;
  /** Extra classes for the glyph, for example a state colour. */
  iconClassName?: string;
};

/**
 * A header action: a 44 dp circle with one glyph, tonal on the page and glass
 * over a photo. Every header button in the app is this one, so they share a
 * size, a tone and a press response. The caller supplies the accessibility
 * label.
 */
export function HeaderButton({ icon, iconClassName, ...props }: HeaderButtonProps) {
  return (
    <HeaderCircleButton {...props}>
      <Icon as={icon} className={cn("size-5 text-foreground", iconClassName)} />
    </HeaderCircleButton>
  );
}

type BackButtonProps = Omit<HeaderButtonProps, "icon"> & {
  /** `back` returns to the previous screen; `close` leaves a flow or a sheet. */
  kind?: "back" | "close";
};

/**
 * The leading button of a pushed screen. The chevron is drawn one size larger
 * than other header glyphs and nudged left by a pixel: its visual weight sits
 * right of its box, so a geometrically centred chevron looks off-centre.
 */
export function BackButton({ kind = "back", iconClassName, ...props }: BackButtonProps) {
  return kind === "close" ? (
    <HeaderButton icon={X} iconClassName={iconClassName} {...props} />
  ) : (
    <HeaderButton
      icon={ChevronLeft}
      iconClassName={cn("size-6 -translate-x-px", iconClassName)}
      {...props}
    />
  );
}

type StackHeaderProps = ViewProps & {
  /** The screen's name. Omit it when `children` fills the middle. */
  title?: string;
  /** A quiet second line under an inline title. */
  subtitle?: string;
  /**
   * The leading control, almost always a `BackButton`. The screen builds it,
   * so its label, test ID and back behaviour stay the screen's own.
   */
  leading?: ReactNode;
  /** Trailing actions: `HeaderButton`s or one short text action. */
  trailing?: ReactNode;
  /**
   * Draws the title large on its own line under the buttons. For a screen
   * that is a destination (Profile, My listings, a picker), not a step.
   */
  large?: boolean;
  /** Replaces the inline title, for example a search field or a peer's name. */
  children?: ReactNode;
  className?: string;
};

/**
 * The header of every pushed screen: a circular tonal back button, the title
 * in the heading face, and room for trailing actions. One component, so the
 * buttons sit on the same line and the titles share one weight everywhere.
 *
 * It draws no divider: a header belongs to the page surface and the content
 * below starts on its own raised surface.
 */
export function StackHeader({
  title,
  subtitle,
  leading,
  trailing,
  large = false,
  children,
  className,
  ...props
}: StackHeaderProps) {
  const inlineTitle = !large && title !== undefined;
  // A title that fits at the default font size may not at a large one.
  const largeText = useLargeText();

  return (
    <View className={cn("px-4 pb-2 pt-1", className)} {...props}>
      <View className="min-h-11 flex-row items-center gap-3">
        {leading}
        {children ?? (
          <View className="min-w-0 flex-1">
            {inlineTitle ? (
              <Text
                className="font-heading text-headline font-semibold text-foreground"
                numberOfLines={largeText ? 2 : 1}
              >
                {title}
              </Text>
            ) : null}
            {inlineTitle && subtitle ? (
              <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
        {trailing}
      </View>
      {large && title !== undefined ? (
        <Text
          className="px-1 pt-3 font-heading text-title font-bold text-foreground"
          numberOfLines={2}
        >
          {title}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A short text action at the trailing edge of a header, such as Reset. It
 * keeps a 44 dp target and reads as an action through its medium weight, in
 * the text colour: brand red belongs to the screen's primary action.
 */
export function HeaderTextAction({
  label,
  className,
  ...props
}: Omit<ButtonProps, "children" | "size" | "variant"> & { label: string }) {
  return (
    <Button variant="ghost" className={cn("h-11 px-3 py-0", className)} {...props}>
      <Text className="text-body font-medium text-foreground">{label}</Text>
    </Button>
  );
}
