
















export const mobileSurfaces = {

  page: { light: "60 7% 95%", dark: "240 3% 6%" },

  raised: { light: "0 0% 100%", dark: "240 3% 11%" },

  overlay: { light: "0 0% 100%", dark: "240 3% 14%" },

  tonal: { light: "60 5% 90%", dark: "240 3% 17%" },

  tonalPressed: { light: "60 5% 85%", dark: "240 3% 23%" },

  glass: { light: "0 0% 100%", dark: "240 3% 15%" },

  glassEdge: { light: "0 0% 100%", dark: "0 0% 100%" },

  divider: { light: "60 5% 88%", dark: "240 3% 19%" },

  scrim: { light: "0 0% 0%", dark: "0 0% 0%" },

  mediaScrim: { light: "0 0% 0%", dark: "0 0% 0%" },

  mediaForeground: { light: "0 0% 100%", dark: "0 0% 100%" },
} as const;


export const mobileText = {
  primary: { light: "0 0% 9%", dark: "60 10% 98%" },
  secondary: { light: "0 0% 40%", dark: "240 4% 66%" },
} as const;


export const mobileGlassOpacity = {

  fallback: 0.94,






  tint: 0.4,

  reduced: 1,
} as const;






export const mobileMediaOpacity = {
  "on-photo": 0.6,
} as const;





export const mobileAspect = {

  photo: "3 / 2",

  "photo-wide": "2 / 1",
} as const;


export const mobileRadius = {
  none: 0,

  sm: 8,

  md: 12,

  lg: 16,

  xl: 20,

  "2xl": 24,

  "3xl": 28,
  full: 9999,
} as const;





export const mobileType = {

  display: [34, 40, -0.4],

  title: [28, 34, -0.3],

  headline: [22, 28, -0.2],

  subhead: [18, 24, -0.1],

  body: [16, 22, 0],

  callout: [15, 20, 0],

  footnote: [13, 18, 0],

  caption: [12, 16, 0],

  micro: [11, 14, 0.1],
} as const;









export const mobileFontFaces = {
  sans: {
    light: "Geist-Light",
    regular: "Geist-Regular",
    medium: "Geist-Medium",
    semibold: "Geist-SemiBold",
    bold: "Geist-Bold",
  },
  heading: {
    medium: "Geist-Medium",
    semibold: "Geist-SemiBold",
    bold: "Geist-Bold",
  },
  mono: {
    regular: "GeistMono-Regular",
    medium: "GeistMono-Medium",
  },
} as const;


export const mobileControl = {
  sm: 40,
  md: 52,
  lg: 56,

  icon: 44,

  tabBar: 64,
} as const;


export const mobileElevation = {

  raised: "0 1px 2px rgba(0, 0, 0, 0.08)",

  floating: "0 8px 24px rgba(0, 0, 0, 0.14)",

  overlay: "0 16px 40px rgba(0, 0, 0, 0.22)",
} as const;


export const mobileDuration = {

  press: 90,

  fast: 150,

  base: 250,

  slow: 380,

  pulse: 1400,
} as const;





export const mobileSpring = {

  snappy: { duration: 180, dampingRatio: 1 },

  settle: { duration: 320, dampingRatio: 0.9 },





  glide: { duration: 220, dampingRatio: 1 },

  pop: { duration: 360, dampingRatio: 0.55 },
} as const;


export const mobilePressScale = {

  control: 0.96,

  surface: 0.985,

  lift: 1.08,

  swell: 1.03,

  magnify: 1.18,
} as const;

export type MobileSurface = keyof typeof mobileSurfaces;
export type MobileTypeRole = keyof typeof mobileType;
export type MobileRadiusKey = keyof typeof mobileRadius;
