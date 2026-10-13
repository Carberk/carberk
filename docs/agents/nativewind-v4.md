# Mobile styling

Use this guide for mobile components, tokens, and visual changes. [ADR-0014](../adr/0014-mobile-component-library.md) establishes React Native Reusables. For the specific NativeWind/RNR API being changed, follow [documentation lookups](documentation-lookups.md). Inspect existing configuration before following an installation recipe.

## Start with the affected component

Read its approved design and current implementation, then only the relevant sources:

| Concern | Source |
|---|---|
| Utilities, fonts, scanned paths | [tailwind.config.js](../../apps/mobile/tailwind.config.js) |
| Semantic theme values | [global.css](../../apps/mobile/global.css) |
| Shared tokens | [packages/ui/tokens](../../packages/ui/tokens) |
| Native primitives and variants | [components/ui](../../apps/mobile/components/ui) |
| Provider, font loading, portal host | [root layout](../../apps/mobile/app/_layout.tsx) |
| Registry aliases | [components.json](../../apps/mobile/components.json) |

Mobile uses NativeWind v4 with Tailwind v3 configuration. Web/admin use Tailwind v4 CSS configuration. Preserve that separation and use native components; `@auto-tm/ui/components` is browser-only. Installed dependencies and configuration own exact versions.

## Component and theme conventions

Use NativeWind `className` for new static styling. Reuse RNR primitives instead of rebuilding button/input/dialog behavior. Dynamic animation or measured native styles belong at their existing native boundary; do not convert working interop merely to make a class count larger.

Use semantic background, foreground, border, and status tokens. Literal color utilities need an intentional light/dark pairing. Brand actions and error states have distinct roles. Inspect current AutoTM token values rather than restoring historical palette constants from an old design.

Use `font-heading` for prominent headings, `font-sans` for body text, and `font-mono` for code-like digits. Do not invent font utility names. Preserve one prominent title per screen, localized copy, accessible labels, readable contrast, and minimum touch targets from the approved design.

RNR composite descendants use the project's [Text](../../apps/mobile/components/ui/text.tsx), which consumes TextClassContext. Raw native Text does not inherit that context. Use the [Icon](../../apps/mobile/components/ui/icon.tsx) wrapper for Lucide className styling. Preserve the root PortalHost for overlay primitives.

For a new visual variant, inspect both container and text variant maps and change them together. Check enabled, disabled, light, and dark states. A base-class change affects every consumer; retain the project's ADR requirement for universal base changes or primitive forks. Prefer an existing primitive or a feature composition before forking it. Feature-specific wrappers belong under `components/<feature>/`, with the native primitive inside and merged className support.

## Diagnose before changing configuration

- Missing styles: check complete class literals, scanned paths, the imported global stylesheet, and actual utility definitions. Do not construct class names from arbitrary fragments.
- Wrong child text or icon color: check TextClassContext and the Icon wrapper before adding overrides.
- Missing overlay: check PortalHost and the component's native primitive wiring.
- Theme mismatch: check the root color-scheme setup and semantic variables together.
- Native crash after adding a component: run Expo's package-alignment check first. Preserve explicit Reanimated/Worklets dependencies and the mobile hoisting configuration.

NativeWind documentation and search results can show examples from a newer major. Check examples against the installed v4 configuration; a docs result is not permission for a framework migration.

## Verification

Run affected tests and lint, mobile typecheck, Expo dependency check, and iOS export. Follow [mobile-expo.md](mobile-expo.md) for the commands and development-build runtime gate. Expo Go is not a valid runtime check for this app. For visible changes, inspect the affected screen in light/dark modes and capture evidence; a successful bundle alone does not prove appearance. Stop the Metro process started for this task before handing back.
