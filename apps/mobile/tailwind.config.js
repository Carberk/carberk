const { hairlineWidth } = require("nativewind/theme");
const {
  tailwindTheme,
  mobileTailwindTheme,
} = require("@auto-tm/ui/theme/tailwind");

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
        link: themed("message-read"),
        message: {
          own: "hsl(var(--message-own))",
          read: "hsl(var(--message-read))",
        },
        glass: {
          DEFAULT: themed("glass"),
          edge: themed("glass-edge"),
        },
        scrim: themed("scrim"),
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
      aspectRatio: mobileTailwindTheme.aspectRatio,
      scale: mobileTailwindTheme.scale,
      transitionDuration: mobileTailwindTheme.transitionDuration,
      height: mobileTailwindTheme.height,
      minHeight: mobileTailwindTheme.height,
      minWidth: mobileTailwindTheme.height,
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
