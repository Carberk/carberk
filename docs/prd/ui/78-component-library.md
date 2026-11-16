# 78 — Component library

## Where it lives

- **Web + admin shared primitives**: `packages/ui/components/` — current shared source contains Button, Card, and Input plus `cn`/exports
- **Mobile primitives**: `apps/mobile/components/ui/` — owned React Native Reusables (RNR) source on NativeWind v4
- **Mobile feature compositions**: `apps/mobile/components/` and `apps/mobile/src/**/components/`

Use common semantic vocabulary where useful, but do not promise identical props. DOM and React Native primitives, interaction states, and accessibility APIs differ.

## Current primitive inventory

| Component family | Web/admin shared | Mobile RNR/current source | Guidance |
|---|---|---|---|
| **Button** | `Button.tsx` | `button.tsx` | [components/78-01-button.md](components/78-01-button.md) |
| **Input** | `Input.tsx` | `input.tsx` | [components/78-02-input.md](components/78-02-input.md) |
| **Card** | `Card.tsx` | `card.tsx` | [components/78-03-card.md](components/78-03-card.md) |
| **List** | app composition | FlatList/ScrollView composition | [components/78-04-list.md](components/78-04-list.md) |
| **Dialog / Sheet** | app-local until shared | `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx` | [components/78-05-modal-sheet.md](components/78-05-modal-sheet.md) |
| **Toast** | app-local until shared | `toast.tsx` | [components/78-06-toast-snackbar.md](components/78-06-toast-snackbar.md) |
| **Tabs / Nav** | app router/layout | Expo Router tab layout | [components/78-07-tabs-nav.md](components/78-07-tabs-nav.md) |
| **Form controls** | app-local until shared | `checkbox.tsx`, `switch.tsx`, `progress.tsx` | [components/78-08-form-controls.md](components/78-08-form-controls.md) |
| **Avatar** | app-local until shared | `avatar.tsx` | [components/78-09-avatar.md](components/78-09-avatar.md) |
| **Badge** | app-local until shared | `badge.tsx` | [components/78-10-badge.md](components/78-10-badge.md) |
| **Skeleton** | app-local until shared | `skeleton.tsx` | [components/78-11-skeleton.md](components/78-11-skeleton.md) |

Mobile also owns `dropdown-menu`, `icon`, `separator`, `text`, `tooltip`, and the supporting native-only animated view in the same directory. Inspect the directory and `apps/mobile/CONTEXT.md` during design/implementation; this table is a map, not an install manifest.

## Not generic primitives today

- DataTable (admin-only; using a simple HTML table in MVP)
- DatePicker (forms use platform-native pickers)
- Combobox (autocomplete — use Input + filtered list for now)
- Drawer (web — defer)
- Command palette (defer)
- Carousel (handled per-feature, not a generic component yet)

## Variants approach

Each component supports a small set of variants via props:

```tsx
<Button variant="brand" size="pill"><Text>Sell my car</Text></Button>

<Card>...</Card>

<Input aria-invalid={hasError} editable={!isPending} />
```

These examples reflect the current mobile vocabulary; inspect the exported types before implementation. Variants stay limited and intentional.

## Composition over prop explosion

If a component grows too many props, split it:

- `Modal` (the chrome) + content composed by the consumer
- `List` (the container) + `ListItem` (each row)
- `Card` (the surface) + `CardHeader`, `CardBody`, `CardFooter` slots

shadcn's pattern matches this — we follow it.

## Theme integration

Components use the shared palette/scales and platform semantic mappings through Tailwind classes (web/admin) or NativeWind + CSS variables (mobile).

When tokens change, components update automatically.

## Per-component pages

The pages in [`components/`](components/) describe intended behavior and review criteria. Verify names, variants, and installed status against code before using an example; code/current `CONTEXT.md` wins when a mutable page is stale.

1. Purpose
2. When to use it (and when not)
3. Variants (intent, size, state)
4. All states (default, hover, active, disabled, loading, error, success)
5. Accessibility notes
6. Implementation snippet (Tailwind classnames + RN equivalent)

## Adding a new component

1. Is it generic (reusable across features) or one-off?
   - If one-off, it belongs in the consuming app, not `packages/ui/`
2. On web/admin, does the current shadcn/Base UI stack provide an appropriate source primitive?
3. On mobile, does RNR provide it?
   - If yes, install/copy it into `apps/mobile/components/ui/`, then own and theme that file.
   - If no, compose existing primitives under the feature directory; reserve `components/ui/` for reusable primitives.
4. Add or revise a per-component guidance page only when the behavior is genuinely shared.
5. Update this inventory and the owning `CONTEXT.md` when the current primitive set changes.

## References

- shadcn docs: <https://ui.shadcn.com/>
- Mobile implementation rules: [`../../agents/nativewind-v4.md`](../../agents/nativewind-v4.md)
- [71-design-tokens.md](71-design-tokens.md)
- [Shared UI and native boundary](../../../packages/ui/CONTEXT.md)
