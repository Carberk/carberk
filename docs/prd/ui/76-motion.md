# 76 — Motion

## Principles

1. **Motion communicates state change** — buttons press in, modals slide up, content fades on load.
2. **Snappy by default.** 150ms or less for most feedback.
3. **Never block input.** If something animates, the user can still tap through.
4. **Respect prefers-reduced-motion.** Disable non-essential animations when the OS asks.
5. **No motion for decoration's sake.** A spinning logo is a Phase ∞ feature.

## Duration tokens (from `motion.ts`)

| Token | ms | Use |
|---|---|---|
| `instant` | 0 | No animation (debugging or explicit) |
| `fast` | 150 | Default UI feedback (button press, toggle, hover) |
| `base` | 250 | List item appear/disappear, tab switches |
| `slow` | 400 | Modal open/close, route changes, drawer slide |

## Easings (from `motion.ts`)

| Token | Curve | Use |
|---|---|---|
| `standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default; most state changes |
| `decel` | `cubic-bezier(0.0, 0, 0.2, 1)` | Elements entering screen |
| `accel` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving screen |

## Where motion is used

| Surface | Animation | Duration / easing |
|---|---|---|
| Button press | Scale 0.96 + opacity 0.7 | `fast` / `standard` |
| Toggle / switch | Slide thumb | `fast` / `standard` |
| Tab switch | Content cross-fade | `base` / `standard` |
| Modal open | Slide up from bottom + scrim fade | `slow` / `decel` |
| Modal close | Slide down + scrim fade | `slow` / `accel` |
| Bottom sheet | Slide up from bottom | `slow` / `decel` |
| Drawer | Slide from right | `slow` / `decel` |
| Toast | Slide down from top + auto-dismiss | `base` / `decel` / `accel` |
| Skeleton loader | Shimmer animation | `2000ms` / linear, looping |
| Pull-to-refresh | Standard native (don't customize) | platform |
| Page transition (mobile) | Standard native push/pop | platform |
| Page transition (web) | None (instant) — Next.js default |
| Photo gallery swipe | Native gesture (don't customize) | platform |
| Listing favorite ♥ | Pop scale 1.0 → 1.3 → 1.0 + heart fills | `base` / `standard` |
| Chat new message appear | Slide up from bottom + fade in | `base` / `decel` |
| OTP digit input fill | Subtle scale + color shift | `fast` / `standard` |

## Mobile motion tokens

Mobile reads its motion from `packages/ui/tokens/mobile.ts` through `apps/mobile/lib/motion.ts`. Everything runs on the UI thread with Reanimated and animates transform and opacity only.

| Duration | ms | Use |
|---|---|---|
| `press` | 90 | Press-in |
| `fast` | 150 | Press-out, colour and opacity changes |
| `base` | 250 | Entrances, the tab indicator, toasts |
| `slow` | 380 | Sheets and dialogs |
| `pulse` | 1400 | One skeleton pulse, there and back |

| Spring | Form | Use |
|---|---|---|
| `snappy` | 180 ms, damping ratio 1 | Press feedback, small state changes |
| `settle` | 320 ms, damping ratio 0.9 | The tab indicator, sheets settling, sticky bars |
| `glide` | 220 ms, damping ratio 1 | The leading edge of the tab capsule; the trailing edge follows on `settle` |
| `pop` | 360 ms, damping ratio 0.55 | The favorite heart, the one spring allowed a visible overshoot |

| Easing | Curve | Use |
|---|---|---|
| `standard` | `cubic-bezier(0.2, 0, 0, 1)` | State changes |
| `enter` | `cubic-bezier(0, 0, 0.2, 1)` | Arriving |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving |

Press scale: 0.96 for buttons, chips and icon buttons; 0.985 for cards and rows; a tab of the floating tab bar grows instead, to 1.08 (`lift`).

### Where mobile uses motion

| Surface | Motion |
|---|---|
| Any tappable control | Scales to the press scale on press-in (`press`), springs back on release (`snappy`) |
| Tab press | The tab, and its capsule when selected, grows to 1.08 (`snappy`) and returns on release or cancel |
| Tab change | The selected capsule stretches toward the new tab (leading edge `glide`, trailing edge `settle`) and settles into it; the icon cross-fades to filled and the label to semibold |
| Favorite heart | Scales up and settles (`pop`) as it fills |
| List and card entrance | A screen's content: a short fade and 8 dp rise on first mount. The first cards of a list replacing their skeletons: a fade with a 4 dp settle, 24 ms apart. Never per card on scroll |
| Skeleton to content | The skeleton pulses in opacity (`pulse`); content fades in (`base`) |
| Sheet and dialog | Slide or scale in with the scrim fading (`slow`, `enter`); leave faster (`base`, `exit`) |
| Sticky header and bottom bar | Background and title fade with scroll position, driven by the scroll offset |
| Toast | Fades and rises from the edge it sits on (`base`) |
| Wizard step | Progress animates to the new value (`settle`) |

Reduce Motion: every spring and timing carries `ReduceMotion.System`, so values jump to their end state. Loops (the skeleton pulse) and entrances do not start. Sheets and toasts fade instead of moving.

Haptics are not used: no haptics module is installed, and adding one is a native dependency decision.

## What NOT to animate

- Route changes on web (we want instant page loads)
- Search results appearing (paint instantly)
- Listing cards in the feed (no per-card stagger animation — too much)
- Tab bar icons (no bounce on tap; the selected capsule slides, the icons do not jump)
- Form field focus (rely on native + a subtle border color)

## Reduced motion

- iOS: check `UIAccessibility.isReduceMotionEnabled`
- Android: check `Settings.Global.TRANSITION_ANIMATION_SCALE`
- Web: `prefers-reduced-motion: reduce` media query
- When reduced motion is requested:
  - All animations < 100ms become instant (zero duration)
  - Modal slides become fade-only
  - Skeleton shimmer stops (static placeholder)
  - Pop animations (heart, etc.) skip

## Performance budget

- 60fps target on TM mobile data with mid-range Android hardware
- Avoid simultaneous animations (one at a time per surface)
- Don't animate properties that trigger reflow (height, width — use transform + scale)
- Worth testing on a real low-end phone (Redmi Note 9, etc.)

## Implementation libraries

- Mobile: Built-in `Animated` API + `react-native-reanimated` for complex animations
- Web: CSS transitions for simple, `framer-motion` for complex orchestration
- shadcn/ui components ship with sensible animations built in — don't override unless needed

## References

- Token source: `packages/ui/tokens/motion.ts`
- [70-design-principles.md](70-design-principles.md) — performance over polish
