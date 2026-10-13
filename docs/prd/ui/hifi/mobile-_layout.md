# Hi-Fi — Mobile Root Layout

> Issue: #124 — apply wizard design handoff to app shell, auth, and listing wizard  
> Maps to: `apps/mobile/app/_layout.tsx`  
> Derived from wireframe: `docs/prd/ui/wireframes/mobile-_layout.md`

==============================================
HIGH-FIDELITY DESIGN — Mobile Root Layout
Platform: mobile
Mode: light + dark
==============================================

## Purpose

Mount the global provider stack, navigation container, and portal infrastructure so every downstream screen inherits theme, query client, toast, and safe-area behavior. The shell also owns the cold-launch entrance approved in issue #833.

## Layout

```text
┌────────────────────────────────────────────┐
│  (System status bar — light/dark adaptive) │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ Current route content                │  │
│  │ (Stack pushes tabs or auth modals)   │  │
│  └──────────────────────────────────────┘  │
│                                            │
└────────────────────────────────────────────┘
```

## Token map

### Backgrounds + surfaces
- Root screen base: `bg-background` (light #FFFFFF / dark #0A0A0A)
- Status bar: adaptive via `expo-status-bar` `style` prop driven by `colorScheme`

### Typography
- The launch credit uses Geist Regular at 13 pt and remains subordinate to the incumbent SVG wordmark.

### Spacing
- None at this layer; safe-area insets are consumed by downstream screens.

## Component shape

### Implementation (mobile — NativeWind v4 + RNR)

```tsx
import "../global.css";

import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";

import { NAV_THEME } from "../lib/theme";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";

  return (
    <ThemeProvider value={NAV_THEME[scheme]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)/phone" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="(auth)/otp" options={{ presentation: "fullScreenModal" }} />
      </Stack>
      <PortalHost />
    </ThemeProvider>
  );
}
```

## Customization plan

None — all primitives used at defaults. `PortalHost` is a required RNR primitive with no styling surface.

## States

### Default
Providers mounted; `(tabs)` index shown. Status bar color matches OS scheme.

### Loading
Native Expo splash hands off on the first layout to the matching React entrance, using the existing C-dot at 160 pt on #17191D. The incumbent red wordmark replaces the C-dot and carries the exact subordinate credit "By Alpha Motors", 13 pt Geist Regular in #AEB4BF, 20 pt below the wordmark. The entrance remains dark in both themes to match native; the settled destination crossfades into its saved light/dark theme. No splash route is pushed.

### Empty
N/A — no own UI.

### Error
Unhandled JS error crashes to Expo error boundary (red screen in dev). No custom error boundary at this layer.

### Offline
`onlineManager` pauses queries; refetchOnReconnect resumes. Offline is surfaced per-screen, not at root.

## Motion

Issue #833 adds one cold-launch sequence, while local startup proceeds. The matching C-dot contracts from scale 1 to 0.92 and moves 6 pt upward while fading over 200 ms, before the wordmark starts at 200 ms and fades/rises 8 pt into place over 420 ms; the credit starts at 260 ms and fades/rises 4 pt over 300 ms. The completed wordmark and credit settle by 620 ms, then remain readable for 450 ms. The presentation is complete at 1070 ms. Once the destination is ready, the overlay exits over 180 ms. Navigation, auth and deep links never wait on animation completion. Reduced Motion shows a stable wordmark and credit and removes the ready overlay immediately, without spatial movement or the completed-brand hold. No loop or launch network dependency is introduced. The dark brand launch background is intentional in both themes. Before mounting navigation, startup waits for saved theme hydration and for NativeWind to report the resolved appearance, preventing a wrong-theme destination frame. This readiness is latched once, so later theme changes preserve navigation and local screen state.

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Auth modal open | iOS sheet slide-up (Expo Router `presentation: "fullScreenModal"`) | system | system |
| Auth modal close | iOS sheet slide-down | system | system |

Reduced motion: system `prefers-reduced-motion` governs Expo Router transitions.

## Accessibility

- **Contrast ratios**: N/A (no text at this layer).
- **Tap targets**: N/A.
- **Focus-visible**: N/A.
- **Screen reader**: `PortalHost` has no accessible elements.
- **Reading order**: N/A.

## Trilingual copy

(none — chrome-only surface)

## Implementation notes

- `PortalHost` MUST be the last child inside `ThemeProvider`. Without it, RNR `Dialog`, `Sheet`, `DropdownMenu`, `Toast`, etc. render nothing on native.
- Do NOT wrap the entire tree in `SafeAreaView` here; leave safe-area handling to each screen so modals and full-screen flows can manage their own insets.
- `NAV_THEME` colors must stay in lockstep with `global.css` and `lib/theme.ts`.

## Open questions

- Should a global `SafeAreaView` wrapper be added for the `(tabs)` stack only? Decision: no, handle per-screen.
