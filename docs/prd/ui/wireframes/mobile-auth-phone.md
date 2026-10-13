# Wireframe — Mobile Phone Auth Screen

> Issue: #124 — apply wizard design handoff to app shell, auth, and listing wizard  
> Maps to: `apps/mobile/app/(auth)/phone.tsx`

==============================================
WIREFRAME — Mobile Phone Auth Screen
Platform: mobile
==============================================

## Compact sign-in entry for Carberk 2.0.4

The founder-approved integration change in PR #848 supersedes the historical
layout and copy below for sign-in entry only. Phone and email remain an in-place
switch in the same mounted entry; OTP and account add/change screens keep their
existing presentation.

- Keep Close and the RU/TK/EN locale switch in the header.
- Use a smaller Carberk wordmark, 110 × 20 dp, with 12 dp above the form and
  16 dp between the logo, method switch, heading, field group and Get code.
  Omit the logo at accessibility text sizes, retaining scroll access.
- Use one heading in both modes: "Вход в Carberk", "Carberk-e giriň", or
  "Sign in to Carberk". Keep the visible localized field label and fixed +993
  phone prefix. Do not repeat an instruction to enter the phone number.
- Put one delivery helper beneath the input: "Мы отправим код по SMS.",
  "Kody SMS bilen ibereris.", or "We'll send a code by SMS." Email uses
  "Мы отправим код на электронную почту.", "Kody e-poçta ibereris.", or
  "We'll email you a code." Validation and request errors replace the helper.
- Keep Get code immediately after the field group, using the existing brand
  button, enabled/loading rules, target size and theme tokens.
- Place accessible Terms and Privacy links 16 dp below the form instead of
  anchoring them to the screen bottom. Retain keyboard avoidance and scrolling
  for small screens, accessibility text and longer errors. The input and CTA
  should be visible together above an ordinary small-screen keyboard.
- Apply the same composition in RU/TK/EN and light/dark themes. Preserve local
  values, focus, method-switch behavior, normalization and the OTP contract.

## Purpose

Collect a Turkmenistan mobile phone number and request an SMS OTP code.

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
│ [Get code]                        (black)  │
│                                            │
│ By continuing, you agree to the Terms      │
│ and Privacy Policy.                        │
│                                            │
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Close action** — `Button variant="ghost"` circular icon button (`X`). Cancels auth flow.
2. **Language switcher** — Three `Button variant="ghost"` chips: RU, TK, EN. Active chip has `bg-gray-100 text-black`; inactive has `text-gray-400`.
3. **Brand mark** — `auto.tm` SVG logo (red, 130px wide), with text fallback.
4. **Title + subtitle** — "Enter your phone number" (display font, 28px, bold). Subtitle: "We'll send a code by SMS." (16px, `text-muted-foreground`).
5. **Phone input** — Custom `PhoneInput` composition:
   - Locked `+993` prefix in a left slot (mono font, 17px, bordered separator).
   - Main `Input` (mono font, 17px) for local digits, placeholder "6X XX-XX-XX".
   - Full border `1.5px solid gray-200`, `rounded-lg` (8px).
   - Focus state: border black + shadow ring.
   - Error state: border `destructive` + subtle rose shadow.
6. **Helper text** — Below input: "Enter a Turkmenistan mobile number." (13px). Switches to error copy on blur/invalid.
7. **Primary CTA** — `Button variant="default"` (black bg, white text, `rounded-full`, 52px height). Disabled until 8 digits entered. Loading state shows spinner + "Sending…".
8. **Legal copy** — "By continuing, you agree to the Terms and Privacy Policy." (12px, centered, `text-muted-foreground`). "Terms" and "Privacy Policy" are underlined tappable links.

## Customization preview

- **Phone input** — custom composition wrapping RNR `Input` with a leading prefix slot.
- **Language chips** — custom segmented-chip composition; RNR `ToggleGroup` could work but may be overkill.

## Interactions

- Tap Close → cancels auth, drops deferred action, returns to original screen.
- Tap language chip → switches auth copy immediately; persists locale preference.
- Type phone → formats as `6X XX-XX-XX` live; stores canonical `+9936XXXXXXX`.
- Paste full `+993…` number → strips prefix, fills formatted local digits.
- Blur with invalid input → shows inline validation (red border + helper) ONLY after blur or 8 digits attempted; NOT while typing.
- Tap CTA with valid phone → calls `POST /api/v1/auth/otp/request`, routes to `(auth)/otp`.
- Tap Terms / Privacy → opens in-app browser to `https://auto.tm/<locale>/legal/...`.

## States

- **Loading**: CTA shows spinner, disabled; input remains visible.
- **Empty**: Default state; field auto-focused; `+993` prefix visible.
- **Error (format)**: Inline error under phone field: "Enter a number in the format +993 6X XX-XX-XX."
- **Error (network)**: Inline banner (rose bg, rose border): "No connection. Check your network and try again."
- **Rate-limited**: Disable CTA; show countdown: "Too many attempts. Try again in 10 minutes."

## Content / copy

- Title: "Enter your phone number"
- Helper: "We'll send a code by SMS."
- Label: "Phone number"
- Input helper: "Enter a Turkmenistan mobile number."
- Format error: "Enter a number in the format +993 6X XX-XX-XX."
- CTA: "Get code"
- CTA loading: "Sending…"
- Legal: "By continuing, you agree to the Terms and Privacy Policy."
- Network error: "No connection. Check your network and try again."

## Open questions for /hifi-design

- Should the black CTA use `bg-black` directly or map to a semantic token? The design archive uses `#000000` for primary CTAs, diverging from the existing brand-red `--primary`.
- Exact focus ring color and shadow values for the composed phone input.

## Design archive mapping

- `screens/01-phone.html` → `app/(auth)/phone.tsx`.
