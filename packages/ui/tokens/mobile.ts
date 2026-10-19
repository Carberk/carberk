/**
 * Design tokens — mobile surface system (issue #695).
 *
 * The shared scales in this folder (`colors`, `radius`, `type`, `shadow`,
 * `motion`) stay the web and admin defaults. This module holds the values the
 * mobile app layers on top of them: surface levels, a rounder radius scale, a
 * type scale with named roles, elevation and motion springs.
 *
 * Consumed by `apps/mobile/tailwind.config.js` (utilities),
 * `apps/mobile/global.css` (the same surface values as CSS variables) and
 * `apps/mobile/lib/motion.ts` (springs and durations).
 *
 * Colours are HSL triplets ("h s% l%") so NativeWind can apply opacity
 * modifiers such as `bg-glass/90`.
 */

/** Surface levels, from the page up. Each has a light and a dark value. */
export const mobileSurfaces = {
  /** The page behind everything. */
  page: { light: "60 7% 95%", dark: "240 3% 6%" },
  /** Raised content: cards, grouped lists, inputs. */
  raised: { light: "0 0% 100%", dark: "240 3% 11%" },
  /** Overlays that sit above the page: sheets, dialogs, menus, toasts. */
  overlay: { light: "0 0% 100%", dark: "240 3% 14%" },
  /** Tonal fill: secondary buttons, chips, icon buttons, search fields. */
  tonal: { light: "60 5% 90%", dark: "240 3% 17%" },
  /** Pressed or selected tone, one step past tonal. */
  tonalPressed: { light: "60 5% 85%", dark: "240 3% 23%" },
  /** Floating navigation and controls above scrolling content. */
  glass: { light: "0 0% 100%", dark: "240 3% 15%" },
  /** The edge highlight on a glass surface; used with an opacity modifier. */
  glassEdge: { light: "0 0% 100%", dark: "0 0% 100%" },
  /** Inset dividers inside a raised surface. */
  divider: { light: "60 5% 88%", dark: "240 3% 19%" },
  /** Dimming behind sheets and dialogs; used with an opacity modifier. */
  scrim: { light: "0 0% 0%", dark: "0 0% 0%" },
  /** The chip behind text and icons that sit on a photo. */
  mediaScrim: { light: "0 0% 0%", dark: "0 0% 0%" },
  /** Text and icons on a photo or on the black photo viewer. */
  mediaForeground: { light: "0 0% 100%", dark: "0 0% 100%" },
} as const;

/** Text levels. Secondary is a clear step quieter, not merely smaller. */
export const mobileText = {
  primary: { light: "0 0% 9%", dark: "60 10% 98%" },
  secondary: { light: "0 0% 40%", dark: "240 4% 66%" },
} as const;

/** Opacity of each translucent surface where blur is not available. */
export const mobileGlassOpacity = {
  /** iOS below 26 and Android: no blur behind it, so it stays nearly opaque. */
  fallback: 0.94,
  /**
   * The tone laid inside the system Liquid Glass. The glass alone refracts
   * whatever scrolls behind it straight through a label; this keeps text on
   * it readable over a photo while the material still shows.
   */
  tint: 0.64,
  /** Reduce Transparency: fully opaque. */
  reduced: 1,
} as const;

/**
 * Opacity of the scrim behind a control or a chip that sits on a photo
 * (`bg-media-scrim/on-photo`). At 60% white text on it keeps 4.5:1 over a
 * pure white photo, so a caption-size count stays readable on any picture.
 */
export const mobileMediaOpacity = {
  "on-photo": 0.6,
} as const;

/**
 * Photo frames as width / height, so a photo keeps its shape at any card
 * width instead of taking a fixed height.
 */
export const mobileAspect = {
  /** A Listing photo in a grid card, a row card or a thumbnail. */
  photo: "3 / 2",
  /** The photo band of a full-width Listing card. */
  "photo-wide": "2 / 1",
} as const;

/** Corner radii in dp. Larger surfaces take larger radii. */
export const mobileRadius = {
  none: 0,
  /** Badges, small thumbnails. */
  sm: 8,
  /** Chips, small controls, list thumbnails. */
  md: 12,
  /** Inputs, menu surfaces. */
  lg: 16,
  /** Buttons, listing photos. */
  xl: 20,
  /** Cards and grouped lists. */
  "2xl": 24,
  /** Sheets, the floating tab bar, hero cards. */
  "3xl": 28,
  full: 9999,
} as const;

/**
 * Type roles in dp: `[size, lineHeight, letterSpacing]`.
 * Weight comes from the font face, see `mobileFontFaces`.
 */
export const mobileType = {
  /** Large screen titles and the detail price. */
  display: [34, 40, -0.4],
  /** Screen titles in a compact header, hero numbers. */
  title: [28, 34, -0.3],
  /** Card prices, sheet titles, empty-state titles. */
  headline: [22, 28, -0.2],
  /** Section titles, row titles on large rows. */
  subhead: [18, 24, -0.1],
  /** Default reading and control text. */
  body: [16, 22, 0],
  /** Dense rows, secondary lines beside a title. */
  callout: [15, 20, 0],
  /** Helper text, metadata. */
  footnote: [13, 18, 0],
  /** Captions, timestamps, chips on photos. */
  caption: [12, 16, 0],
  /** Tab labels and count badges. */
  micro: [11, 14, 0.1],
} as const;

/**
 * The bundled font faces. React Native does not synthesize a real weight from
 * one face, so each weight is its own family name (see `apps/mobile/lib/font.ts`).
 */
export const mobileFontFaces = {
  sans: {
    light: "UberMoveText-Light",
    regular: "UberMoveText-Regular",
    medium: "UberMoveText-Medium",
    bold: "UberMoveText-Bold",
  },
  heading: {
    medium: "UberMove-Medium",
    bold: "UberMove-Bold",
  },
  mono: {
    regular: "UberMoveMono-Regular",
    medium: "UberMoveMono-Medium",
  },
} as const;

/** Control heights in dp. Every one clears the 48 dp Android touch target except `sm`, which takes hit slop. */
export const mobileControl = {
  sm: 40,
  md: 52,
  lg: 56,
  /** Circular header and icon buttons. */
  icon: 44,
  /** The floating tab bar, above the bottom inset. */
  tabBar: 64,
} as const;

/** Elevation as React Native `boxShadow` values. Cards stay flat; tone separates them. */
export const mobileElevation = {
  /** A hairline lift for a raised control on a photo. */
  raised: "0 1px 2px rgba(0, 0, 0, 0.08)",
  /** Floating navigation, sticky bars, toasts. */
  floating: "0 8px 24px rgba(0, 0, 0, 0.14)",
  /** Sheets, dialogs, menus. */
  overlay: "0 16px 40px rgba(0, 0, 0, 0.22)",
} as const;

/** Durations in ms, added to the shared `duration` scale. */
export const mobileDuration = {
  /** Press-in. */
  press: 90,
  /** Press-out, colour and opacity changes. */
  fast: 150,
  /** Entrances, tab indicator, toasts. */
  base: 250,
  /** Sheets and dialogs. */
  slow: 380,
  /** One skeleton pulse, there and back. */
  pulse: 1400,
} as const;

/**
 * Springs for Reanimated `withSpring` (duration and damping-ratio form).
 * `dampingRatio` 1 does not overshoot.
 */
export const mobileSpring = {
  /** Press feedback and small state changes. */
  snappy: { duration: 180, dampingRatio: 1 },
  /** The tab indicator, sheets settling, sticky bars. */
  settle: { duration: 320, dampingRatio: 0.9 },
  /**
   * The leading edge of a marker travelling between slots. It arrives ahead
   * of the trailing edge, which follows on `settle`, so the marker stretches
   * along its path and then settles, with no overshoot.
   */
  glide: { duration: 220, dampingRatio: 1 },
  /** The favorite heart and other one-shot confirmations. */
  pop: { duration: 360, dampingRatio: 0.55 },
} as const;

/** Scale applied while a surface is pressed. */
export const mobilePressScale = {
  /** Buttons, chips, icon buttons. */
  control: 0.96,
  /** Cards and rows. */
  surface: 0.985,
  /** A tab of the floating tab bar grows toward the finger instead of giving under it. */
  lift: 1.08,
} as const;

export type MobileSurface = keyof typeof mobileSurfaces;
export type MobileTypeRole = keyof typeof mobileType;
export type MobileRadiusKey = keyof typeof mobileRadius;
