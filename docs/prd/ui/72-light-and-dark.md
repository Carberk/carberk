# 72 — Light and Dark mode

## Strategy

**System-default with per-user override.** Both modes are first-class — neither is "added later."

- App reads OS preference on first launch
- User can override in Cabinet → Theme: System / Light / Dark
- Preference stored in `User.themePreference` (synced across devices) + AsyncStorage (offline cache)

## Implementation

### Mobile (Expo)

- `useColorScheme()` from `react-native` for system preference
- A `ThemeProvider` context wraps the app
- Tokens with `{ light, dark }` resolve at render time
- NativeWind: `dark:bg-neutral-900` syntax works after configuring dark mode strategy in `tailwind.config.js`

### Web (Next.js)

- `prefers-color-scheme` media query in CSS
- `[data-theme="light"]` / `[data-theme="dark"]` attribute on `<html>` for explicit override
- CSS variables flip between light/dark sets
- Tailwind `darkMode: 'class'` strategy

## Contrast and quality rules

- Every text-on-surface pair must meet **WCAG AA contrast** (4.5:1 for body, 3:1 for large text)
- Brand red (`#E60000`) on white: 5.39:1 ✓
- Brand red on neutral.950: 4.96:1 ✓
- Light/dark mode versions of the same screen should feel like the same app, not two different apps
- Avoid pure black (`#000000`) for the page in dark mode. Web and admin use `neutral.950` (`#0A0A0A`); mobile uses `#0F0F10`
- On web and admin, avoid pure white (`#FFFFFF`) for elevated surfaces in light mode — use `neutral.50` (`#FAFAF9`) for warmth. On mobile the warmth is in the page (`#F3F3F1`) and raised surfaces are white, so a card reads as lifted without a border

## Mobile surface levels in each mode

Both modes use the same five levels ([71-design-tokens.md](71-design-tokens.md#surface-levels)); neither is an inversion of the other.

| Level | Light | Dark | How it reads |
|---|---|---|---|
| Page | `#F3F3F1`, a warm off-white | `#0F0F10`, near black with a cool cast | The quietest surface |
| Raised | `#FFFFFF` | `#1B1B1D` | Lighter than the page in both modes |
| Overlay | `#FFFFFF` with the `overlay` shadow | `#232325` | One step above raised in dark, where shadow does not show |
| Tonal | `#E7E7E4` | `#2A2A2D` | Darker than a card in light, lighter than a card in dark: visible on the page and on a card |
| Glass | white at 94% | `#252528` at 94% | Floating navigation; system Liquid Glass on iOS 26 |

In light, depth comes from the white card on the off-white page and from shadow under what floats. In dark, shadow is invisible on a near-black page, so depth comes from each level being lighter than the one below it.

Text on a photo and on the photo viewer is white on a black scrim in both modes (`text-media-foreground` on `bg-media-scrim/45`), because a photo does not follow the theme.

Reduce Transparency replaces glass with the opaque raised surface in both modes.

## Mode-specific token resolution

```ts
// Semantic token usage example
import { colors } from '@auto-tm/ui/tokens'

const { mode } = useTheme()  // 'light' | 'dark'

const styles = {
  background: colors.background[mode],
  border:     colors.border[mode],
  text:       colors.textPrimary[mode],
}
```

Or with Tailwind classnames:

```tsx
<View className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700">
```

## What stays the same across modes

- Brand red keeps its hue in both modes. Light is `#E60000`; mobile dark uses the slightly lighter `hsl(0 90% 52%)` so red text stays readable on the dark page
- Status colors (success / warning / error / info) are the same hex
- Spacing, radius, shadow, motion tokens — same
- Icons — same Lucide stroke; color resolves via context

## What changes

- Background / surface / border colors (theme-aware)
- Text colors (theme-aware)
- Some illustrations need light/dark variants (empty states with gradients)
- Photo overlays may darken in dark mode for better contrast
- Functional links and read ticks use the themed `link` blue (`--message-read`): `#2563EB` light, `#60A5FA` dark. They are not the same-hex info status colour

## OG / share images

OG meta images (1200×630 cards in WhatsApp) are always **light mode** — they're shown by other apps that don't know about our theme. Pick the most universally-readable variant.

## Edge cases

- iOS lock screen widget — uses system mode (no in-app override)
- Notification body — system mode (no theming on system surfaces)
- Splash screen — fixed (light or dark; pick one per platform)
- WhatsApp share preview — controlled by WhatsApp, not us

## References

- [71-design-tokens.md](71-design-tokens.md)
- `packages/ui/tokens/colors.ts`
- Charter §12 — Mode strategy
