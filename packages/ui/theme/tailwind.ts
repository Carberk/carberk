import {
  mobileAspect,
  mobileControl,
  mobileDuration,
  mobileElevation,
  mobileFontFaces,
  mobileGlassOpacity,
  mobileMediaOpacity,
  mobilePressScale,
  mobileRadius,
  mobileType,
  palette,
  radius,
  spacing,
} from "../tokens";

export const tailwindTheme = {
  colors: {
    brand: Object.fromEntries(
      Object.entries(palette.red).map(([k, v]) => [k, v]),
    ),
    neutral: Object.fromEntries(
      Object.entries(palette.neutral).map(([k, v]) => [k, v]),
    ),
    success: { 500: palette.green[500] },
    warning: { 500: palette.amber[500] },
    error: { 500: palette.rose[500] },
    info: Object.fromEntries(
      Object.entries(palette.blue).map(([k, v]) => [k, v]),
    ),
    primary: palette.red[500],
  },
  spacing: Object.fromEntries(
    Object.entries(spacing).map(([k, v]) => [k, `${v / 16}rem`]),
  ),
  borderRadius: Object.fromEntries(
    Object.entries(radius).map(([k, v]) => [
      k,
      typeof v === "number" ? `${v}px` : v,
    ]),
  ),
} as const;







export const mobileTailwindTheme = {
  borderRadius: {
    ...Object.fromEntries(
      Object.entries(mobileRadius).map(([k, v]) => [k, `${v}px`]),
    ),
    DEFAULT: `${mobileRadius.sm}px`,
  },
  fontSize: Object.fromEntries(
    Object.entries(mobileType).map(([k, [size, lineHeight, letterSpacing]]) => [
      k,
      [
        `${size}px`,
        { lineHeight: `${lineHeight}px`, letterSpacing: `${letterSpacing}px` },
      ],
    ]),
  ),
  fontFamily: {
    sans: [mobileFontFaces.sans.regular],
    "sans-light": [mobileFontFaces.sans.light],
    "sans-medium": [mobileFontFaces.sans.medium],
    "sans-semibold": [mobileFontFaces.sans.semibold],
    "sans-bold": [mobileFontFaces.sans.bold],
    heading: [mobileFontFaces.heading.medium],
    "heading-semibold": [mobileFontFaces.heading.semibold],
    "heading-bold": [mobileFontFaces.heading.bold],
    mono: [mobileFontFaces.mono.regular, "Menlo", "monospace"],
    "mono-medium": [mobileFontFaces.mono.medium, "Menlo", "monospace"],
  },
  boxShadow: { ...mobileElevation },


  opacity: {
    glass: String(mobileGlassOpacity.fallback),
    "glass-tint": String(mobileGlassOpacity.tint),

    "on-photo": String(mobileMediaOpacity["on-photo"]),
  },

  aspectRatio: { ...mobileAspect },

  scale: Object.fromEntries(
    Object.entries(mobilePressScale).map(([k, v]) => [`press-${k}`, String(v)]),
  ),

  transitionDuration: Object.fromEntries(
    Object.entries(mobileDuration).map(([k, v]) => [k, `${v}ms`]),
  ),
  height: Object.fromEntries(
    Object.entries(mobileControl).map(([k, v]) => [`control-${k}`, `${v}px`]),
  ),
} as const;
