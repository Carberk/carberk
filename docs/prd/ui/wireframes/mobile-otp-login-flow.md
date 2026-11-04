# Wireframe - Mobile OTP Login Flow

Issue: GitHub #40, S2 mobile OTP flow

References:
- `docs/prd/features/30-identity.md`
- `docs/prd/flows/60-first-time-user.md`
- `docs/prd/sprints/sprint-02-identity.md` (removed 2026-11-04; in git history)
- `docs/prd/ops/83-legal.md`
- `docs/prd/features/36-notifications.md`
- `apps/mobile/assets/logos_color_red.svg`
- **`docs/agents/nativewind-v4.md`** — mobile UI stack guide. The hi-fi spec below maps each named primitive to an RNR component (`Sheet` for the action-gated sign-in, `Button` for CTAs, `Input` for the phone field, `Icon` for X/ChevronLeft, `Text` from `@/components/ui/text` for all text inside RNR composites). Prototype/implementation agents must read it before styling.

> **Primitive-to-RNR map (set in hi-fi, surface-able from wireframe):**
> - Action-gated sign-in surface → `<Sheet>` (bottom sheet) — requires `<PortalHost />` in root layout.
> - Phone/OTP screen primary CTA → `<Button variant="default">` (resolves to brand red via `bg-primary`).
> - "Change number" / "Resend code" / language switcher → `<Button variant="link">` or `<Button variant="ghost">`.
> - Phone input → `<Input>` with `+993` prefix surface (custom-composed Input + leading View).
> - OTP cells → custom composition of six bordered `View`s over a hidden numeric `TextInput`; the wrapping primitive is still a tap target with RNR `<Text>` for each digit.
> - Close `X`, back `ChevronLeft`, alert icons → `<Icon as={X|ChevronLeft|AlertCircle|WifiOff} className="size-5 text-foreground">`.
> - Inline error banner → custom `<View>` with `bg-destructive/10 text-destructive` (no RNR `Alert` needed for inline form errors).
> - Dev-only code pill → `<Badge variant="secondary">`.

==============================================
WIREFRAME - Action-gated sign-in prompt
Platform: mobile
==============================================

## Purpose

Explain why sign-in is needed only after a gated user action, then route into the phone OTP flow.

## ASCII wireframe

```text
Underlying screen stays visible, dimmed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                         [X]
                 ┌────────────────────┐
                 │ drag handle        │
                 │                    │
                 │ Sign in to save    │
                 │ listings           │
                 │                    │
                 │ Continue with your │
                 │ phone number.      │
                 │                    │
                 │ [Continue with     │
                 │  phone]            │
                 │                    │
                 └────────────────────┘
```

## Numbered content blocks

1. **Scrim** - Dimmed current screen. The listing, chat, sell, or saved-search context remains visible behind it.
2. **Close action** - Cancels auth and drops the deferred action.
3. **Dynamic title** - Uses the gated action: "Sign in to save listings", "Sign in to message the seller", "Sign in to sell your car", or generic "Sign in to continue".
4. **Body copy** - One short sentence. No marketing copy.
5. **Primary CTA** - Opens `(auth)/phone`.

## Interactions

- Tapping block 2 -> closes sheet, returns to the original screen with no state loss.
- Tapping block 5 -> pushes `(auth)/phone` as a full-screen modal route with deferred action context.
- Dragging down -> closes sheet, same as close.
- Tapping outside sheet -> closes sheet, same as close.

## States

- **Loading**: Not applicable. Sheet opens from local UI state.
- **Empty**: Not applicable.
- **Error**: If auth route cannot open, show toast "Could not open sign-in. Try again."
- **Offline**: CTA remains enabled; phone request screen handles network failure.

## Content / copy

- Dynamic title: "Sign in to save listings"
- Body: "Continue with your phone number."
- CTA button: "Continue with phone"

## Open questions for hi-fi

- None for S2. Notification permission is owned by downstream actions, not by this sheet.

==============================================
WIREFRAME - Phone entry
Platform: mobile
==============================================

## Purpose

Collect a Turkmenistan mobile phone number, validate it locally, and request a six-digit SMS code.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ [X]                                RU TK EN│
│                                            │
│        auto.tm red SVG logo                │
│                                            │
│ Enter your phone number                    │
│ We'll send a code by SMS.                  │
│                                            │
│ Phone number                               │
│ ┌──────┬────────────────────────────────┐ │
│ │ +993 │ 6X XX-XX-XX                    │ │
│ └──────┴────────────────────────────────┘ │
│ Enter a Turkmenistan mobile number.        │
│                                            │
│ [Get code]                                 │
│                                            │
│ By continuing, you agree to the Terms      │
│ and Privacy Policy.                        │
│                                            │
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Close action** - Cancels the whole auth flow and returns to the original screen.
2. **Language switcher** - Compact RU / TK / EN switcher for users arriving before settings are configured.
3. **Brand mark** - `apps/mobile/assets/logos_color_red.svg`, restrained size, with text fallback "AutoTM".
4. **Screen title + helper** - Direct explanation of the SMS step.
5. **Phone input** - Locked `+993` prefix and grouped local digits. Submit value is canonical E.164.
6. **Inline helper / error** - Shows either guidance, format errors, network errors, or rate-limit countdown.
7. **Primary CTA** - Disabled until phone is structurally valid. Sends OTP on tap. No confirm screen.
8. **Legal copy** - "By continuing..." copy with web-canonical legal links. No checkbox in S2.

## Interactions

- Tapping block 1 -> cancels auth, drops deferred action, returns to original screen.
- Tapping a language in block 2 -> switches auth copy immediately and persists locale preference.
- Typing in block 5 -> formats as `6X XX-XX-XX`; stores canonical `+9936XXXXXXX`.
- Blurring block 5 with invalid input -> shows inline validation.
- Tapping block 7 with valid phone -> calls `POST /api/v1/auth/otp/request`, then routes to `(auth)/otp`.
- Tapping Terms or Privacy links in block 8 -> opens `https://auto.tm/<locale>/legal/...` in an in-app browser or custom tab.

## Customization preview

- **Phone input** — needs `PhoneInput` composition (leading `+993` slot over RNR `Input`)

## States

- **Loading**: Primary CTA shows submitting state; input remains visible.
- **Empty**: Default state with field focused and `+993` prefix visible.
- **Error**: Inline error under phone field. No separate error screen.
- **Offline**: Inline message: "No internet connection. Try again when you are online."
- **Rate-limited**: Disable CTA and show countdown, for example "Too many attempts. Try again in 10 minutes."

## Content / copy

- Title: "Enter your phone number"
- Helper: "We'll send a code by SMS."
- Label: "Phone number"
- Input helper: "Enter a Turkmenistan mobile number."
- CTA button: "Get code"
- Legal: "By continuing, you agree to the Terms and Privacy Policy."
- Format error: "Enter a number in the format +993 6X XX-XX-XX."

## Open questions for hi-fi

- None for S2. A legal checkbox is deferred unless legal review requires recorded explicit acceptance.

==============================================
WIREFRAME - OTP entry
Platform: mobile
==============================================

## Purpose

Verify the six-digit SMS code, support paste/autofill, and return to the deferred action or tab app.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ [<] [X]                            RU TK EN│
│                                            │
│        auto.tm red SVG logo                │
│                                            │
│ Enter the code                             │
│ Code sent to +993 6X XX-XX-42              │
│ [Change number]                            │
│                                            │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐             │
│ │1 │ │2 │ │3 │ │4 │ │5 │ │6 │             │
│ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘             │
│                                            │
│ Wrong code. Try again.                     │
│                                            │
│ Resend code in 42s                         │
│                                            │
│ Dev code: 123456                           │
│                                            │
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Back action** - Returns to phone entry with the previous number prefilled.
2. **Close action** - Cancels the whole auth flow and drops deferred action.
3. **Language switcher** - Same as phone screen.
4. **Brand mark** - Same SVG logo with text fallback.
5. **Title + destination** - Shows masked phone to confirm destination without exposing full number.
6. **Change number action** - Returns to `(auth)/phone`, clears code, does not send a new SMS.
7. **OTP input** - One hidden numeric text input behind six visual cells. Supports paste, autofill, and auto-submit on sixth digit.
8. **Inline error area** - Wrong, expired, locked, network, and server errors.
9. **Resend action** - Secondary helper/action text. Disabled until countdown ends.
10. **Dev-only code** - Visible only in non-production builds when API returns `testCode`.
11. **Contact support** - Shown only after a resend hits the daily Sign-in Code limit, in place of Resend. Opens Help. This is the code screen's only support link ([#353 founder answer 1](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353#issuecomment-5947334041)).

## Interactions

- Tapping block 1 -> returns to phone screen with phone prefilled; code cleared.
- Tapping block 2 -> cancels auth and returns to the original screen.
- Filling block 7 with six digits -> auto-submits `POST /api/v1/auth/otp/verify`.
- Pasting six digits into block 7 -> fills cells and auto-submits.
- Wrong code -> shake cells, clear all cells, refocus first cell, keep phone/request context.
- Expired code -> show inline expired message and enable resend if backend allows.
- Tapping block 9 after countdown -> requests a fresh code for the same phone.
- Block 9 refused at the daily Sign-in Code limit -> show the daily-limit message, stop code entry, hide Resend, and show block 11.
- Tapping block 11 -> opens Help.
- Success with deferred action -> close auth and replay the action. Success without deferred action -> route to tab app and show a small "Signed in" toast.

## Customization preview

- **OTP input** — needs `OtpCells` composition (6 visual cells over hidden `TextInput`, owns shake animation)

## States

- **Loading**: OTP cells remain visible; submitting state prevents duplicate verify requests.
- **Empty**: First cell focused, destination copy visible.
- **Error**: Inline error, no separate route.
- **Offline**: Inline warning; keep entered code in memory only while screen stays mounted.
- **Locked**: Clear code, show lockout message/countdown, keep Change number available.
- **Expired**: Show expired message, allow requesting a new code when permitted.
- **Daily limit**: Show the daily-limit message; code entry and Resend stop; Contact support (block 11) is the one way forward.

## Content / copy

- Title: "Enter the code"
- Destination: "Code sent to +993 6X XX-XX-42"
- Change number: "Change number"
- Resend disabled: "Resend code in 42s"
- Resend enabled: "Resend code"
- Wrong code: "Wrong code. Try again."
- Expired: "Code expired. Request a new one."
- Locked: "Too many attempts. Request a new code."
- Dev-only: "Dev code: 123456"
- Daily limit: "Too many codes requested for this destination in 24 hours. Try again later."
- Daily-limit action: "Contact support"

==============================================
WIREFRAME - Notification permission handoff
Platform: mobile
==============================================

## Purpose

Clarify that OTP login does not ask for push permission. Downstream user actions own the native notification prompt.

## ASCII wireframe

```text
After login returns to Chat
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────────────┐
│ Chat with seller                            │
│                                            │
│ [message composer]                         │
│ [Send]                                     │
└────────────────────────────────────────────┘

After first message sends:

┌────────────────────────────────────────────┐
│ Allow notifications so you know when       │
│ the seller replies.                        │
│                                            │
│ [Not now]              [Allow notifications]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Triggering action** - First sent chat message, saved search with notify enabled, first published listing, blog follow, or explicit marketing opt-in.
2. **Rationale prompt** - AutoTM prompt before the native OS prompt. Copy is tied to the action.
3. **Native permission request** - Asked at most once automatically across the device.
4. **Settings fallback** - If native permission was denied, later surfaces show a System Settings CTA instead of prompting again.

## Interactions

- User accepts block 2 -> call native permission request, register device token if granted.
- User declines block 2 or native permission -> mark local `notificationPermissionPrompted=true`.
- Later notification actions after denial -> show inline "Notifications are off. Enable them in System Settings."

## States

- **Loading**: Token registration can show silent progress; do not block the user's action.
- **Empty**: No prompt until a concrete notification-using action occurs.
- **Error**: Token registration failure is non-blocking and retried later.
- **Offline**: In-app notifications still work when online; no native token registration until connectivity returns.

## Content / copy

- Chat rationale: "Allow notifications so you know when the seller replies."
- Saved-search rationale: "Allow notifications when new cars match this search."
- Listing rationale: "Allow notifications when buyers message you or your listing gets updates."
- Settings fallback: "Notifications are off. Enable them in System Settings."

## Open questions for hi-fi

- Server-side prompt fatigue tracking across devices can be revisited in Sprint 8 if needed. S2 stores only local prompt state and server push token after grant.
