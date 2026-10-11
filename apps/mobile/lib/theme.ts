import { DefaultTheme, DarkTheme, type Theme } from "@react-navigation/native";
import { mobileSurfaces, mobileText } from "@auto-tm/ui/tokens";

/**
 * The semantic theme as HSL triplets, for the few places that need a colour in
 * JavaScript (native props such as `ActivityIndicator.color`, the navigation
 * theme). Surface and text levels come from `mobileSurfaces` and `mobileText`
 * in packages/ui/tokens/mobile.ts; `global.css` holds the same values for
 * NativeWind classes. Change both together.
 */
export const THEME = {
  light: {
    background: mobileSurfaces.page.light,
    foreground: mobileText.primary.light,
    card: mobileSurfaces.raised.light,
    cardForeground: mobileText.primary.light,
    popover: mobileSurfaces.overlay.light,
    popoverForeground: mobileText.primary.light,
    primary: "0 100% 45%",
    primaryForeground: "0 0% 100%",
    secondary: mobileSurfaces.tonal.light,
    secondaryForeground: mobileText.primary.light,
    muted: mobileSurfaces.tonal.light,
    mutedForeground: mobileText.secondary.light,
    accent: mobileSurfaces.tonalPressed.light,
    accentForeground: mobileText.primary.light,
    destructive: "15 85% 38%",
    destructiveForeground: "0 0% 100%",
    messageOwn: "4 50% 90%",
    messageRead: "221 83% 53%",
    success: "142 76% 36%",
    successForeground: "0 0% 100%",
    border: mobileSurfaces.divider.light,
    input: mobileSurfaces.divider.light,
    ring: "0 100% 45%",
    glass: mobileSurfaces.glass.light,
  },
  dark: {
    background: mobileSurfaces.page.dark,
    foreground: mobileText.primary.dark,
    card: mobileSurfaces.raised.dark,
    cardForeground: mobileText.primary.dark,
    popover: mobileSurfaces.overlay.dark,
    popoverForeground: mobileText.primary.dark,
    primary: "0 90% 52%",
    primaryForeground: "0 0% 100%",
    secondary: mobileSurfaces.tonal.dark,
    secondaryForeground: mobileText.primary.dark,
    muted: mobileSurfaces.tonal.dark,
    mutedForeground: mobileText.secondary.dark,
    accent: mobileSurfaces.tonalPressed.dark,
    accentForeground: mobileText.primary.dark,
    destructive: "15 80% 58%",
    destructiveForeground: "0 0% 9%",
    messageOwn: "0 59% 16%",
    messageRead: "213 94% 68%",
    success: "142 70% 45%",
    successForeground: "0 0% 100%",
    border: mobileSurfaces.divider.dark,
    input: mobileSurfaces.divider.dark,
    ring: "0 90% 52%",
    glass: mobileSurfaces.glass.dark,
  },
} as const;

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: `hsl(${THEME.light.background})`,
      border: `hsl(${THEME.light.border})`,
      card: `hsl(${THEME.light.card})`,
      primary: `hsl(${THEME.light.primary})`,
      text: `hsl(${THEME.light.foreground})`,
      notification: `hsl(${THEME.light.destructive})`,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: `hsl(${THEME.dark.background})`,
      border: `hsl(${THEME.dark.border})`,
      card: `hsl(${THEME.dark.card})`,
      primary: `hsl(${THEME.dark.primary})`,
      text: `hsl(${THEME.dark.foreground})`,
      notification: `hsl(${THEME.dark.destructive})`,
    },
  },
};
