# 78-01 — Button

## Purpose

Primary action element. Triggers a single action: navigation, submission, toggle.

## When to use

- Submit forms
- Trigger destructive or constructive actions
- Open modals or sheets
- Primary CTAs ("Sell my car", "Call seller")

## When NOT to use

- Navigating between routes that aren't actions — use a link instead
- Toggling state — use a Switch
- Selecting one of many — use Tabs or Radio
- Picking a value — use Input or Select

## Variants

### Intent

| Intent | Use | Color |
|---|---|---|
| `primary` | Main action on the screen | Brand red bg, white text |
| `secondary` | Alternative action, less emphasized | Neutral surface, dark text + border |
| `tertiary` | Low-emphasis action | Text-only, no background |
| `destructive` | Delete / ban / suspend | Rose-500 bg, white text |
| `success` | Confirm / approve (admin only) | Green-500 bg, white text |

### Size

| Size | Height | Padding | Font size |
|---|---|---|---|
| `sm` | 32 | 12 horizontal | `sm` (13) |
| `md` (default) | 44 | 16 horizontal | `base` (15) |
| `lg` | 52 | 20 horizontal | `lg` (17) |

### Shape

- `default` — radius `md` (8)
- `pill` — radius `full` (rounded)

## States

| State | Visual |
|---|---|
| Default | Solid bg (intent color) |
| Hover (web) | Bg darkens by one step (`primary` → `primaryHover`) |
| Active / pressed | Bg darkens further; scale 0.96 (mobile only); opacity 0.7 |
| Focused (keyboard) | 2px outline in `primary` color, 2px offset |
| Disabled | Opacity 0.5; cursor `not-allowed`; no hover/active effects |
| Loading | Spinner replaces label; button is disabled; min-width preserved (no layout shift) |

## With icon

- Icon-left: `<Heart /> Favorite` — icon at `base` size, 8px gap
- Icon-right: `Continue <ChevronRight />`
- Icon-only: requires `accessibilityLabel`; touch target ≥ 44 even if visual icon is small

## Accessibility

- `accessibilityRole="button"` (RN) / native `<button>` (web)
- Loading state: `aria-busy="true"`
- Disabled: `aria-disabled="true"`
- Icon-only buttons MUST have `accessibilityLabel` / `aria-label`

## Implementation (web)

```tsx
<Button intent="primary" size="md" onClick={handleSubmit}>
  Sell my car
</Button>

<Button intent="secondary" size="sm">Cancel</Button>

<Button intent="destructive" loading={isDeleting}>
  Delete listing
</Button>
```

## Implementation (mobile)

```tsx
<Button
  intent="primary"
  size="md"
  onPress={handleSubmit}
  loading={isSubmitting}
>
  Sell my car
</Button>
```

Both use the same prop names. Internally web is a `<button>` with Tailwind classes, mobile is `Pressable` with NativeWind classes.

## Don'ts

- ❌ Multiple `primary` buttons on the same screen — pick one
- ❌ Buttons with > 3 words for the label
- ❌ Sentence-case label ("Sell my car") rather than title-case ("Sell My Car")
- ❌ Disabled buttons without explanation (use a tooltip / helper text)

## Mobile rendering

The mobile `Button` (`apps/mobile/components/ui/button.tsx`) reads the mobile surface tokens (doc 71) and differs from the table above in these ways.

| Variant | Surface | Label |
|---|---|---|
| `brand` | Brand red; one step darker (`brand-600`) while pressed | White, bold |
| `default` | Foreground colour (near-black in light, near-white in dark) | Page colour, bold |
| `secondary` | Tonal fill; the pressed tone while pressed. Not an outline | Foreground, medium |
| `outline` | Raised surface with a divider-coloured edge | Foreground, medium |
| `ghost` | None; tonal fill while pressed | Foreground, medium |
| `destructive` | Destructive colour | Bold |
| `link` | None | Functional blue600 light / blue400 dark (`text-link`), medium |

| Size | Height (dp) | Radius (dp) | Use |
|---|---|---|---|
| `default` | 52 | 20 | Most actions |
| `lg` | 56 | 20 | The main action of a screen, sticky bottom bars |
| `pill` | 56 | Full | A lone call to action in an empty state |
| `sm` | 40 | 16 | Inline actions; give it hit slop to reach 44 |
| `icon` | 44 by 44 | Full (circle) | Header and toolbar actions |

- **Pressed:** the button scales to 0.96 in 90 ms and returns in 150 ms, on the UI thread (`PressableScale`), and its surface moves one tone. There is no opacity change.
- **Disabled:** the tonal surface with a divider edge and secondary-colour text. A disabled button is not dimmed with opacity, so its label keeps AA contrast, and it does not move when touched.
- **Loading:** the caller disables the button and swaps the label for its progress text or a spinner; the width does not change.
- **Reduce Motion:** the scale is an instant change.
- A header action is `variant="secondary" size="icon"`: a tonal circle, not a bare icon.

### Conversation attachment Remove (#729)

The preview's Remove action keeps a compact 24dp circular mark with a 14dp X,
inside its own 44×44dp Pressable. It reuses the localized `remove` label and
exposes the button role. The control sits at the top-right inside a 96dp preview
wrapper, as a sibling of the rounded/clipped image surface; neither negative
positioning nor hitSlop outside a clipped parent supplies its target.

Removal retains the staged-file cleanup and held message text. Send, attachment
selection/cancel and the parent's existing disabled behavior are unchanged.
Rendered user-action tests cover these outcomes in EN/RU/TK through the real
composer and compression path, with native service boundaries substituted.
They do not measure NativeWind layout or TalkBack. Native proof must measure the
44dp reachable target, tap its edges with the keyboard open, activate it through
TalkBack, and capture light/dark preview states before release sign-off.
