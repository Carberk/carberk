import {
  mobileControl,
  mobileDuration,
  mobileElevation,
  mobileFontFaces,
  mobileGlassOpacity,
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

/**
 * Mobile-only additions (issue #695): rounder radii, named type roles, one
 * font family per bundled face, control heights and elevation.
 * `apps/mobile/tailwind.config.js` layers these over `tailwindTheme`; web and
 * admin do not read them.
 */
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
    "sans-bold": [mobileFontFaces.sans.bold],
    heading: [mobileFontFaces.heading.medium],
    "heading-bold": [mobileFontFaces.heading.bold],
    mono: [mobileFontFaces.mono.regular, "Menlo", "monospace"],
    "mono-medium": [mobileFontFaces.mono.medium, "Menlo", "monospace"],
  },
  boxShadow: { ...mobileElevation },
  // `bg-glass/glass`: the glass tone where no blur is drawn behind it.
  opacity: { glass: String(mobileGlassOpacity.fallback) },
  // `active:scale-press-control`, `active:scale-press-surface`.
  scale: Object.fromEntries(
    Object.entries(mobilePressScale).map(([k, v]) => [`press-${k}`, String(v)]),
  ),
  // `duration-press`, `duration-fast`, `duration-base`, `duration-slow`.
  transitionDuration: Object.fromEntries(
    Object.entries(mobileDuration).map(([k, v]) => [k, `${v}ms`]),
  ),
  height: Object.fromEntries(
    Object.entries(mobileControl).map(([k, v]) => [`control-${k}`, `${v}px`]),
  ),
} as const;
