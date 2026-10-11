# Wireframe — Mobile Root Layout

> Issue: #124 — apply wizard design handoff to app shell, auth, and listing wizard  
> Maps to: `apps/mobile/app/_layout.tsx`

==============================================
WIREFRAME — Mobile Root Layout
Platform: mobile
==============================================

## Purpose

Mount the global provider stack, navigation container, and portal infrastructure so every downstream screen inherits theme, query client, toast, and safe-area behavior.

## ASCII wireframe

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

## Numbered content blocks

1. **StatusBar** — Expo `StatusBar` adapts to `colorScheme` (light content on dark, dark content on light).
2. **ThemeProvider** — React Navigation theme from `lib/theme.ts` (NAV_THEME) drives native nav chrome colors.
3. **QueryClientProvider** — TanStack Query v5 client with 30s staleTime, network-aware `onlineManager`, and 401-unauth redirect handler.
4. **ToastProvider** — RNR toast surface for ephemeral success / error messages (e.g. "Listing published").
5. **Stack navigator** — `headerShown: false`; routes:
   - `(tabs)` — main tab app
   - `(auth)/phone` — `presentation: "fullScreenModal"`
   - `(auth)/otp` — `presentation: "fullScreenModal"`
6. **PortalHost** — MUST be last child inside ThemeProvider; required for RNR Dialog, Sheet, DropdownMenu, Toast, etc.

## Interactions

- App cold start → providers mount → `(tabs)` index shown.
- 401 API error → `clearAuthSession()` → redirect to `/(auth)/phone`.
- Auth modal dismiss → returns to tab route that triggered it.

## States

- **Loading**: Native splash hands off to the matching one-time Carberk entrance with subordinate "By Alpha Motors" credit, approved in #833. Destination readiness remains independent of presentation.
- **Error**: Unhandled JS error crashes to Expo error boundary (red screen in dev).
- **Offline**: `onlineManager` pauses queries; refetchOnReconnect resumes.

## Content / copy

(none — chrome-only surface)

## Open questions for /hifi-design

- Should the root layout also mount a global `SafeAreaView` inset wrapper, or leave safe-area to each screen?
- Does the design handoff require a custom page-transition animation between tabs and auth modals?

## Design archive mapping

- `app-shell.html` — tab bar lives inside `(tabs)/_layout.tsx`, not root layout; root layout only provides the shell infrastructure.
