/**
 * AutoTM mobile Tailwind config — v3 + NativeWind v4 preset.
 * Extends @auto-tm/ui/theme/tailwind with shadcn-style semantic colors
 * resolving via CSS vars from global.css. Locked to v3 due to NativeWind +
 * Metro constraints. Web/admin use v4 in a different config shape.
 *
 * The mobile surface system (issue #695) comes from
 * packages/ui/tokens/mobile.ts through `mobileTailwindTheme`: radii, type
 * roles, one font family per bundled face, control heights and elevation.
 * Surface colours are CSS variables in global.css so they follow the theme.
 * Rules: docs/agents/nativewind-v4.md (component and theme conventions) and
 * docs/prd/ui/71-design-tokens.md.
 */
const { hairlineWidth } = require("nativewind/theme");
const {
  tailwindTheme,
  mobileTailwindTheme,
} = require("@auto-tm/ui/theme/tailwind");

/** A semantic colour that takes an opacity modifier, such as `bg-glass/90`. */
const themed = (name) => `hsl(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      ...tailwindTheme,
      colors: {
        ...tailwindTheme.colors,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Floating navigation and controls above scrolling content.
        glass: {
          DEFAULT: themed("glass"),
          edge: themed("glass-edge"),
        },
        // Dimming behind sheets and dialogs.
        scrim: themed("scrim"),
        // Chips and controls that sit on a photo, and what is drawn on them.
        media: {
          scrim: themed("media-scrim"),
          foreground: themed("media-foreground"),
        },
      },
      borderRadius: mobileTailwindTheme.borderRadius,
      fontSize: mobileTailwindTheme.fontSize,
      fontFamily: mobileTailwindTheme.fontFamily,
      boxShadow: mobileTailwindTheme.boxShadow,
      opacity: mobileTailwindTheme.opacity,
      scale: mobileTailwindTheme.scale,
      transitionDuration: mobileTailwindTheme.transitionDuration,
      height: mobileTailwindTheme.height,
      minHeight: mobileTailwindTheme.height,
      borderWidth: {
        hairline: hairlineWidth(),
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require("tailwindcss-animate")],
};
