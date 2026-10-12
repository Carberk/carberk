# 71 — Design tokens

Shared visual defaults live in `packages/ui/tokens/`. Components use semantic token names rather than scattering raw hex/px values. Platform theme files may deliberately override a shared default—for example, mobile maps the semantic font families to bundled Geist assets.

## Where tokens live in code

```
packages/ui/tokens/
├── colors.ts       Palette + semantic mappings
├── type.ts         Font family, size scale, weights, line-heights, letter-spacing
├── spacing.ts      4px base grid
├── radius.ts       Border-radius scale
├── shadow.ts       Elevation shadows
├── motion.ts       Durations + easings
└── index.ts        Re-exports
```

These tokens are consumed by:
- `apps/web` and `apps/admin` via Tailwind preset + CSS variables (shadcn/ui)
- `apps/mobile` via NativeWind (Tailwind classnames in React Native) + CSS variables, with platform mappings in `apps/mobile/tailwind.config.js`

## Color palette

### Brand

Brand red `#E60000` is kept from the previous Flutter app. The 50-900 ramp gives us hover/active variants + tints for backgrounds + dark-mode adjustments.

```
red.50    #FFEBEB
red.100   #FFD1D1
red.200   #FFA8A8
red.300   #FF7878
red.400   #FF4848
red.500   #E60000   ← brand
red.600   #C20000
red.700   #9E0000
red.800   #7A0000
red.900   #560000
```

### Neutrals

Warm gray (slightly warmer than pure gray, reads premium):

```
neutral.0     #FFFFFF
neutral.50    #FAFAF9
neutral.100   #F4F4F2
neutral.200   #E7E6E3
neutral.300   #D2D0CB
neutral.400   #A8A6A0
neutral.500   #737170
neutral.600   #525251
neutral.700   #3A3A39
neutral.800   #27272A
neutral.900   #171717
neutral.950   #0A0A0A
```

### Status

Distinct hues so error is NOT confused with brand red:

```
green.500   #10B981   success
amber.500   #F59E0B   warning
rose.500    #F43F5E   error  ← intentionally NOT red (distinct from brand)
blue.500    #3B82F6   info
```

### Semantic mappings

What application code actually references:

```ts
primary:        red.500
primaryHover:   red.600
primaryActive:  red.700
onPrimary:      neutral.0

background:     { light: neutral.0,   dark: neutral.950 }
surface:        { light: neutral.50,  dark: neutral.900 }
surfaceElevated:{ light: neutral.0,   dark: neutral.800 }
border:         { light: neutral.200, dark: neutral.700 }

textPrimary:    { light: neutral.900, dark: neutral.50 }
textSecondary:  { light: neutral.600, dark: neutral.300 }
textTertiary:   { light: neutral.500, dark: neutral.400 }

success: green.500
warning: amber.500
error:   rose.500
info:    blue.500
link:    { light: #2563EB, dark: #60A5FA }  // mobile `link`, from --message-read; also read ticks

overlayScrim: rgba(0,0,0,0.5)
```

## Typography

Shared web/admin defaults: **Inter** for sans and **Menlo** for mono.

Mobile semantic mappings are current implementation truth:

- `font-sans` → **Geist**: Light, Regular, Medium, SemiBold and Bold files
- `font-heading` → **Geist**: Medium, SemiBold and Bold files (the same family as text)
- `font-mono` → **Geist Mono**: Regular and Medium files, on iOS and Android

Geist and Geist Mono are bundled under the SIL Open Font License (`apps/mobile/assets/fonts/Geist-OFL.txt`). They cover Turkmen Latin and Russian Cyrillic, so all three languages draw in one typeface.

See `apps/mobile/CONTEXT.md` and `apps/mobile/tailwind.config.js`; do not copy the shared Inter value into a mobile spec.

### Size scale

| Token | Value (px) | Use |
|---|---|---|
| `xs` | 11 | Tiny labels, badges |
| `sm` | 13 | Captions, helper text |
| `base` | 15 | Body text (default) |
| `lg` | 17 | Larger body, list items |
| `xl` | 20 | Section headings |
| `2xl` | 24 | Page headings |
| `3xl` | 30 | Hero text |
| `4xl` | 36 | Marketing landing |
| `5xl` | 44 | Marketing landing big numbers |

### Weights

| Token | Value |
|---|---|
| `regular` | 400 |
| `medium` | 500 |
| `semibold` | 600 |
| `bold` | 700 |

### Line-heights

| Token | Value |
|---|---|
| `tight` | 1.2 — headlines |
| `snug` | 1.35 — section headings |
| `normal` | 1.5 — body |
| `relaxed` | 1.65 — long-form blog content |

## Spacing

4px base grid:

```
0  →  0
1  →  4
2  →  8
3  →  12
4  →  16
5  →  20
6  →  24
8  →  32
10 →  40
12 →  48
16 →  64
20 →  80
24 →  96
```

## Border radius

| Token | Value |
|---|---|
| `none` | 0 |
| `sm` | 4 |
| `md` | 8 |
| `lg` | 12 |
| `xl` | 16 |
| `2xl` | 24 |
| `full` | 9999 (pill / circle) |

Web and admin defaults: cards `lg` (12px), buttons `md` (8px), input fields `md` (8px), avatars `full`.

Mobile uses its own rounder scale; see [Mobile radius](#mobile-radius).

## Shadows

Used sparingly. Most surfaces are flat with borders.

| Token | Value | Use |
|---|---|---|
| `sm` | `0 1px 2px rgba(0,0,0,0.05)` | Tiny lift on cards |
| `md` | `0 4px 8px rgba(0,0,0,0.08)` | Floating buttons, dropdowns |
| `lg` | `0 8px 24px rgba(0,0,0,0.12)` | Modal dialogs |

## Motion

| Duration | ms | Use |
|---|---|---|
| `instant` | 0 | (no animation) |
| `fast` | 150 | Default UI feedback (button press, toggle) |
| `base` | 250 | List transitions, tab switches |
| `slow` | 400 | Modal open / route change |

| Easing | Value |
|---|---|
| `standard` | `cubic-bezier(0.4, 0, 0.2, 1)` — most cases |
| `decel` | `cubic-bezier(0.0, 0, 0.2, 1)` — element entering |
| `accel` | `cubic-bezier(0.4, 0, 1, 1)` — element exiting |

## Mobile surface system

The mobile app layers its own values over the shared scales above. They live in `packages/ui/tokens/mobile.ts`; web and admin do not read them. `apps/mobile/tailwind.config.js` turns them into utilities, and `apps/mobile/global.css` and `apps/mobile/lib/theme.ts` hold the surface colours per theme. Screens and components use these utilities only: no literal colour, one-off radius or bracketed font size outside the token files.

### Surface levels

Sections are separated by surface tone and spacing, not by lines across the full width.

| Level | Utility | Light | Dark | Use |
|---|---|---|---|---|
| Page | `bg-background` | `#F3F3F1` | `#0F0F10` | Behind everything |
| Raised | `bg-card` | `#FFFFFF` | `#1B1B1D` | Cards, grouped lists |
| Overlay | `bg-popover` | `#FFFFFF` | `#232325` | Sheets, dialogs, menus, toasts |
| Tonal | `bg-secondary`, `bg-muted` | `#E7E7E4` | `#2A2A2D` | Secondary buttons, chips, icon buttons, filled inputs |
| Tonal pressed | `bg-accent` | `#DBDBD7` | `#39393D` | Pressed and selected tone |
| Glass | `bg-glass` | white | `#252528` | Floating navigation and controls above scrolling content, through `GlassSurface` only |
| Divider | `border-border` | `#E2E2DF` | `#2F2F32` | Inset dividers inside a raised surface |
| Scrim | `bg-scrim/50` | black | black | Behind sheets and dialogs |
| On a photo | `bg-media-scrim/45`, `text-media-foreground` | black, white | black, white | Chips and controls on a photo or the photo viewer |

Text: `text-foreground` (`#171717` / `#FAFAF9`) and `text-muted-foreground` (`#666666` / `#A5A5AC`). Secondary text is a clear step quieter, not only smaller.

Brand red is `#E60000` in light. Dark keeps the slightly lighter `hsl(0 90% 52%)` it had, so red text stays readable on the dark page.

### Glass

`components/ui/glass-surface.tsx` is the only translucent material, with `components/ui/glass-button.tsx` as its button form for the sticky action bar's capsules. It goes on floating navigation and on controls that sit above scrolling content: the tab bar, sticky action bar buttons, floating chips, controls on a photo. Content stays on solid surfaces.

| Platform | Rendering |
|---|---|
| iOS 26 and later | System Liquid Glass through `expo-glass-effect` |
| Android, iOS below 26 | The glass tone at 94% opacity, a hairline light edge and the `floating` shadow. No blur pass |
| Reduce Transparency | The opaque raised surface with a divider edge |

### Mobile radius

| Token | dp | Use |
|---|---|---|
| `rounded-sm`, `rounded` | 8 | Badges, small thumbnails |
| `rounded-md` | 12 | Chips, small controls, list thumbnails |
| `rounded-lg` | 16 | Inputs, menus |
| `rounded-xl` | 20 | Buttons, listing photos |
| `rounded-2xl` | 24 | Cards and grouped lists |
| `rounded-3xl` | 28 | Sheets, the floating tab bar |
| `rounded-full` | pill | Avatars, icon buttons, pills |

### Mobile type roles

See [73-typography.md](73-typography.md). Utilities: `text-display`, `text-title`, `text-headline`, `text-subhead`, `text-body`, `text-callout`, `text-footnote`, `text-caption`, `text-micro`.

### Control heights

`h-control-sm` 40, `h-control-md` 52, `h-control-lg` 56, `h-control-icon` 44, `h-control-tabBar` 64 (dp).

### Mobile elevation

Cards stay flat. Shadow marks only what floats.

| Utility | Value | Use |
|---|---|---|
| `shadow-raised` | `0 1px 2px rgba(0,0,0,0.08)` | A raised control on a photo |
| `shadow-floating` | `0 8px 24px rgba(0,0,0,0.14)` | Floating navigation, sticky bars, toasts |
| `shadow-overlay` | `0 16px 40px rgba(0,0,0,0.22)` | Sheets, dialogs, menus |

### Mobile motion

See [76-motion.md](76-motion.md). Durations, springs and press scales are `mobileDuration`, `mobileSpring` and `mobilePressScale`, read through `apps/mobile/lib/motion.ts`.

## References

- Token source code: `packages/ui/tokens/*.ts`
- Mobile surface system: `packages/ui/tokens/mobile.ts`, `apps/mobile/global.css`, `apps/mobile/lib/theme.ts`
- Tailwind preset: `packages/ui/theme/tailwind.preset.ts`
- CSS variables: `packages/ui/theme/css-variables.css`
- Mobile semantic font mapping: `apps/mobile/tailwind.config.js`
- Mobile current state: `apps/mobile/CONTEXT.md`
- [70-design-principles.md](70-design-principles.md)
