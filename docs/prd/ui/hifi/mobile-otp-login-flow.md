# High-fidelity Design - Mobile OTP Login Flow

Issue: GitHub #40, S2 mobile OTP flow

Platform decision: mobile only. This is a transaction/auth flow, so public web is out of scope for issue #40. Public web legal pages are linked from the mobile flow.

Structural baseline: `docs/prd/ui/wireframes/mobile-otp-login-flow.md`

References:
- `docs/prd/features/30-identity.md`
- `docs/prd/flows/60-first-time-user.md`
- `docs/prd/sprints/sprint-02-identity.md`
- `docs/prd/features/36-notifications.md`
- `docs/prd/ops/83-legal.md`
- `apps/mobile/CONTEXT.md`
- `packages/ui/tokens/*.ts`
- `packages/ui/theme/theme.css`
- `apps/mobile/assets/logos_color_red.svg`
- **`docs/agents/nativewind-v4.md`** — authoritative mobile UI stack reference (NativeWind v4 + React Native Reusables). Implementation MUST use RNR components for composite primitives and semantic shadcn-style tokens (`bg-background`, `bg-card`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-destructive`) for app chrome. Raw brand utilities (`bg-brand-500`, `text-brand-500`) only for brand identity moments.

## Implementation status note

The S2 OTP screens at `apps/mobile/app/(auth)/phone.tsx` and `apps/mobile/app/(auth)/otp.tsx` ship using raw React Native primitives (`<Pressable>`, `<TextInput>`, `<View>`) plus NativeWind. That was correct for S2 because RNR was not yet adopted.

**Post-RNR migration plan** (6 steps, per `docs/agents/nativewind-v4.md` §7.3):

1. Install RNR components: `pnpm --filter @auto-tm/mobile exec npx @react-native-reusables/cli@latest add button input icon text sheet badge` (one-time; follow `docs/agents/nativewind-v4.md` §2).
2. Add `PhoneInput` custom composition per §Customization plan below — replaces the hand-rolled `+993` prefix + `TextInput` stack.
3. Add `OtpCells` custom composition per §Customization plan below — replaces the inline 6-cell `View` + hidden `TextInput` + `Animated.Value`.
4. Swap every raw palette class for a semantic token:
   - `bg-neutral-0 dark:bg-neutral-950` → `bg-background`
   - `text-neutral-900 dark:text-neutral-50` → `text-foreground`
   - `text-neutral-600 dark:text-neutral-300` → `text-muted-foreground`
   - `border-neutral-200 dark:border-neutral-700` → `border-border`
   - `border-error-500` → `border-destructive`
   - `border-brand-500` → `border-primary`
   - `bg-neutral-0 dark:bg-neutral-900` (in inputs/cells) → `bg-card`
   - `bg-neutral-50 dark:bg-neutral-900` (in OTP cells) → `bg-muted`
5. Drop imperative `palette.neutral[…]` icon color resolution. Use `<Icon as={X|ChevronLeft} className="size-5 text-foreground">`.
6. Run `docs/agents/nativewind-v4.md` §9 verification gate.

Token shapes shown in this spec are the **target post-migration state**.

==============================================
HIGH-FIDELITY DESIGN - Mobile OTP Login Flow
Platform: mobile
Mode: light + dark
==============================================

## Purpose

Authenticate a buyer or seller only after a gated action, using a fast Turkmenistan phone OTP flow that supports SMS autofill, paste, inline errors, legal links, and deferred-action replay.

## Layout

```text
Action-gated bottom sheet
┌────────────────────────────────────────────┐
│ Current screen with scrim                  │
│                                            │
│                 ┌──────────────────────┐   │
│                 │ Sign in to <action>  │   │
│                 │ Continue with phone  │   │
│                 │ [Continue with phone]│   │
│                 └──────────────────────┘   │
└────────────────────────────────────────────┘

Phone route: (auth)/phone
┌────────────────────────────────────────────┐
│ [X]                                RU TK EN│
│             auto.tm logo                   │
│ Enter your phone number                    │
│ We'll send a code by SMS.                  │
│ Phone number                               │
│ [+993][6X XX-XX-XX]                        │
│ [Get code]                                 │
│ By continuing, Terms + Privacy links       │
└────────────────────────────────────────────┘

OTP route: (auth)/otp
┌────────────────────────────────────────────┐
│ [<] [X]                            RU TK EN│
│             auto.tm logo                   │
│ Enter the code                             │
│ Code sent to +993 6X XX-XX-42              │
│ [Change number]                            │
│ [ ][ ][ ][ ][ ][ ]                         │
│ Resend code in 42s                         │
└────────────────────────────────────────────┘
```

## Token map

Token-name choice rule per `docs/agents/nativewind-v4.md` §3 decision tree and `docs/prd/ui/79-web-vs-mobile.md` §Naming. Below is the resolved token map for this screen.

All classes below are NativeWind v4 utility names. Semantic tokens (`bg-background`, `bg-card`, `border-border`, etc.) auto-swap between light + dark. Raw status hues (`text-error-500`, `bg-warning-500/10`) do NOT swap — they read identically in both modes by design.

### Backgrounds + surfaces

- Root background: `bg-background` (neutral-0 light / neutral-950 dark).
- Bottom sheet surface: `bg-popover` (neutral-0 light / neutral-900 dark) — the RNR `Sheet` uses this by default.
- Input field surface: `bg-card` (neutral-0 light / neutral-900 dark) — RNR `Input` default.
- OTP cell surface: default `bg-muted` (neutral-100 light / neutral-800 dark); filled / focused cell `bg-card`.
- Error inline tint: `bg-destructive/10` (rose, same hue both modes).
- Warning / offline banner tint: `bg-warning-500/10` (amber, same hue both modes).

### Borders + dividers

- Sheet top divider: `border-t border-border`.
- Input border: default `border border-input` (= border-200/700); focused `border-2 border-ring` (brand red); error `border-2 border-destructive` (rose).
- OTP cell border: default `border border-border`; filled `border-primary` (brand red); error `border-destructive`.
- Focus ring (keyboard nav on Pressables): `focus-visible:ring-2 focus-visible:ring-ring` — handled by RNR `Button` default styles.

### Typography

- Screen title: Inter `text-2xl leading-snug font-semibold text-foreground`.
- Body / helper: Inter `text-base leading-normal text-muted-foreground`.
- Form label: Inter `text-sm leading-snug font-medium text-foreground`.
- Input text: Inter `text-base leading-normal text-foreground`.
- OTP digit: Menlo `font-mono text-2xl leading-tight font-semibold text-foreground`.
- Inline error text: Inter `text-sm leading-snug text-destructive`.
- Legal disclaimer: Inter `text-xs leading-normal text-muted-foreground`.
- Legal links: Inter `text-xs leading-normal font-medium text-link underline`.
- Button label: handled by RNR `Button` + RNR `<Text>` (`text-primary-foreground` for `variant="default"`, `text-foreground` for `variant="ghost"`).
- Language switcher chip: Inter `text-sm leading-tight font-medium`; active `text-foreground`, inactive `text-muted-foreground`.

### Spacing

- Screen horizontal padding: `px-4`.
- Header vertical padding: `py-4`.
- Logo to title gap: `mt-8`.
- Title group gap: `gap-2`.
- Form section gap: `gap-4`.
- Screen content gap: `gap-8`.
- Bottom legal spacing: `mt-auto pb-6`.
- Sheet padding: `p-4`.
- OTP row gap: `gap-2`.

### Radius

- Bottom sheet: `rounded-t-2xl`.
- Inputs: `rounded-md`.
- Buttons: `rounded-md`.
- OTP cells: `rounded-md`.
- Dev-only code pill: `rounded-md`.

### Shadows

- Bottom sheet: `shadow-lg`.
- Auth routes: no shadow, full-screen modal.
- Focus states: border change only, no extra shadow.

### Icons

- Close button: Lucide `X`, size token equivalent to dense icon, stroke default.
- Back button: Lucide `ChevronLeft`, size token equivalent to dense icon, stroke default.
- Inline error icon: Lucide `AlertCircle`, inline size.
- Offline warning icon: Lucide `WifiOff`, inline size.
- Button icon: none in S2.

## Component shape

### Implementation — mobile, NativeWind v4 + React Native Reusables

Target shape after RNR adoption (`docs/agents/nativewind-v4.md` §2). All RNR composites live in `apps/mobile/components/ui/`; install with `pnpm --filter @auto-tm/mobile exec npx @react-native-reusables/cli@latest add <name>`.

**Action-gated sign-in (bottom sheet) — requires `<PortalHost />` mounted in `app/_layout.tsx` per §2.8.**

```tsx
import { ChevronLeft, X } from "lucide-react-native";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="bottom" className="rounded-t-2xl px-4 pt-6 pb-8 gap-6">
    <SheetHeader>
      <SheetTitle>{t(`auth.sheet.${action}Title`)}</SheetTitle>
      <SheetDescription>{t("auth.sheet.body")}</SheetDescription>
    </SheetHeader>
    <Button variant="default" size="lg" onPress={onContinue}>
      <Text>{t("auth.sheet.cta")}</Text>
    </Button>
  </SheetContent>
</Sheet>
```

**Phone route (`apps/mobile/app/(auth)/phone.tsx`):**

```tsx
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

<KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : undefined}
  className="flex-1 bg-background"
>
  <SafeAreaView className="flex-1 px-4">
    <View className="flex-row items-center justify-between py-4">
      <Button variant="ghost" size="icon" onPress={closeAuth} accessibilityLabel={t("auth.close")}>
        <Icon as={X} className="size-5 text-foreground" />
      </Button>
      <LocaleSwitcher value={locale} onChange={setLocale} />
    </View>

    <View className="mt-8 gap-8">
      <BrandLogo className="h-10 self-start" />

      <View className="gap-2">
        <Text className="text-2xl font-semibold leading-snug text-foreground">
          {t("auth.phone.title")}
        </Text>
        <Text className="text-base leading-normal text-muted-foreground">
          {t("auth.phone.helper")}
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">
          {t("auth.phone.label")}
        </Text>
        <PhoneInput
          hasError={hasError}
          value={phoneDisplay}
          onChangeText={handlePhoneChange}
          placeholder={t("auth.phone.placeholder")}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          accessibilityLabel={t("auth.phone.label")}
        />
        <Text className={hasError ? "text-sm leading-snug text-destructive" : "text-sm leading-snug text-muted-foreground"}>
          {helperText}
        </Text>
      </View>

      <Button
        variant="default"
        size="lg"
        disabled={!canSubmit}
        onPress={handleSubmit}
        accessibilityState={{ disabled: !canSubmit }}
      >
        <Text>{t("auth.phone.getCode")}</Text>
      </Button>
    </View>

    <Text className="mt-auto pb-6 text-xs leading-normal text-muted-foreground">
      {t("auth.legal.prefix")}{" "}
      <Text
        className="font-medium text-link underline"
        onPress={() => openLegalPage("terms")}
        accessibilityRole="link"
      >
        {t("auth.legal.terms")}
      </Text>{" "}
      {t("auth.legal.and")}{" "}
      <Text
        className="font-medium text-link underline"
        onPress={() => openLegalPage("privacy")}
        accessibilityRole="link"
      >
        {t("auth.legal.privacy")}
      </Text>
      .
    </Text>
  </SafeAreaView>
</KeyboardAvoidingView>
```

**OTP route (`apps/mobile/app/(auth)/otp.tsx`):**

```tsx
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, X } from "lucide-react-native";
import { OtpCells, type OtpCellsHandle } from "@/components/auth/OtpCells";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const otpRef = useRef<OtpCellsHandle>(null);

// On wrong code:
// otpRef.current?.shake();

<KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : undefined}
  className="flex-1 bg-background"
>
  <SafeAreaView className="flex-1 px-4">
    <View className="flex-row items-center justify-between py-4">
      <View className="flex-row gap-2">
        <Button variant="ghost" size="icon" onPress={backToPhone} accessibilityLabel={t("auth.backToPhone")}>
          <Icon as={ChevronLeft} className="size-5 text-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onPress={closeAuth} accessibilityLabel={t("auth.close")}>
          <Icon as={X} className="size-5 text-foreground" />
        </Button>
      </View>
      <LocaleSwitcher value={locale} onChange={setLocale} />
    </View>

    <View className="mt-8 gap-8">
      <BrandLogo className="h-10 self-start" />

      <View className="gap-2">
        <Text className="text-2xl font-semibold leading-snug text-foreground">
          {t("auth.otp.title")}
        </Text>
        <Text className="text-base leading-normal text-muted-foreground">
          {t("auth.otp.sent", { phone: maskedPhone })}
        </Text>
        <Button variant="link" size="sm" onPress={backToPhone} className="self-start px-0">
          <Text className="text-sm font-medium text-link">{t("auth.otp.changeNumber")}</Text>
        </Button>
      </View>

      <OtpCells ref={otpRef} value={code} onChange={setCode} hasError={!!otpError} />

      {otpError ? (
        <Text className="text-sm leading-snug text-destructive">{otpError}</Text>
      ) : null}

      <Button
        variant="link"
        size="sm"
        onPress={resendCode}
        disabled={secondsRemaining > 0 || isResending}
        className="self-start px-0"
      >
        <Text className={secondsRemaining > 0 ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium text-link"}>
          {secondsRemaining > 0 ? t("auth.otp.resendIn", { seconds: secondsRemaining }) : t("auth.otp.resend")}
        </Text>
      </Button>

      {isDev && testCode ? (
        <Badge variant="secondary" className="self-start">
          <Text className="text-sm font-medium text-foreground">
            {t("auth.otp.devCode", { code: testCode })}
          </Text>
        </Badge>
      ) : null}
    </View>
  </SafeAreaView>
</KeyboardAvoidingView>
```

Notes:
- RNR imports listed above: `button`, `input`, `icon`, `text`, `sheet`, `badge` — installed via RNR CLI. `sheet` requires `PortalHost` in root layout.
- `PhoneInput` and `OtpCells` are custom compositions (see §Customization plan). Phone route is ~15 lines shorter; OTP route is ~30 lines shorter.
- `OtpCells` owns the hidden `TextInput`, the 6 visual cells, and the shake animation via `useImperativeHandle`. The route file calls `otpRef.current?.shake()` on wrong code and never instantiates an `Animated.Value`.
- `Button variant="link"` used for "Change number" and "Resend code" with `className="self-start px-0"` to disable centered padding. This is a `cn()` override (per §7.4 row 1), not a new CVA variant — only 2 call sites.
- `BrandLogo` remains a local component wrapping `apps/mobile/assets/logos_color_red.svg`. Not an RNR customization — no §Customization plan entry.

## Customization plan

### A. PhoneInput — custom composition wrapping RNR `Input`

- **Path** (per `docs/agents/nativewind-v4.md` §7.5): custom composition
- **File:** `apps/mobile/components/auth/PhoneInput.tsx`
- **Why:** RNR `Input` ships without a leading-slot API. We need a locked `+993` prefix with a `border-r border-border` divider, plus error-state border switching.
- **Prop API:**
  - `hasError?: boolean` — drives `border-destructive` vs `border-input`
  - `prefix?: string` — defaults to `"+993"`
  - All native `TextInput` props via spread (value, onChangeText, placeholder, keyboardType, etc.)
  - `className?: string` — merged via `cn()`
  - `forwardRef<TextInput>` — caller can `.focus()` the underlying input
- **Shape (~30 lines):** The full worked example is in `docs/agents/nativewind-v4.md` §7.5. In brief: wrapper `<View>` with `bg-card` + conditional border; locked-prefix `<View>` with `border-r border-border` + RNR `<Text>`; RNR `<Input>` with `border-0 bg-transparent` filling the remaining space.

### B. OtpCells — custom composition wrapping a hidden RN `TextInput`

- **Path** (per `docs/agents/nativewind-v4.md` §7.5): custom composition (uses raw RN `<TextInput>` because the hidden-input-over-visual-cells pattern doesn't fit RNR `Input`'s className-merging assumptions)
- **File:** `apps/mobile/components/auth/OtpCells.tsx`
- **Why:** 6 visual cells sit over one invisible numeric `<TextInput>` that owns focus, paste, SMS autofill, and accessibility. The composition also owns the shake `Animated.Value` so route files don't declare animation state.
- **Prop API:**
  - `value: string` — current digit string (0–6 chars)
  - `onChange: (value: string) => void` — sanitized digit-only callback (max 6)
  - `hasError?: boolean` — all cells render `border-destructive`
  - `length?: number` — defaults to 6
- **Imperative handle** (`useImperativeHandle`):
  - `focus(): void` — focuses the hidden input
  - `shake(): void` — plays the 4-step horizontal shake animation, then clears
- **Cell states** (per-cell, derived from `value`, `hasError`, and focused index):
  - Empty, not focused: `border border-border bg-muted`
  - Filled: `border border-primary bg-card`
  - Focused (next empty cell): `border-2 border-primary bg-card`
  - Error: `border-2 border-destructive bg-card`
- **Shape (~50 lines):** `Animated.View` wrapping 6 `<View>` cells + one absolutely-positioned transparent `<TextInput>`. Each cell contains `<Text className="font-mono text-2xl font-semibold leading-tight text-foreground">{digit ?? ""}</Text>`. The `Animated.Value` is internal to the component; `shake()` triggers the sequence and resets to 0.

### C. Button "link" inline pattern — `cn()` override at call site

- **Path** (per §7.4 row 1): `cn()` at the call site
- **Used for:** "Change number" and "Resend code" on the OTP screen; "Terms" and "Privacy" on the phone screen.
- **Pattern:** `<Button variant="link" className="self-start px-0">` — `self-start` left-aligns; `px-0` removes Button's default horizontal padding so the link hugs its content.
- **No new variant needed.** With only 2 current call sites, a new CVA variant is premature. Promote to a variant if a third screen needs the same link pattern.

## States

### Default

The user sees a full-screen modal route with the red SVG logo, a direct title, one input, one primary CTA, and minimal helper/legal copy. Auth does not ask for notifications and does not block browsing outside gated actions.

### Loading

- Phone request: primary CTA enters submitting state and ignores duplicate taps; phone input stays readable.
- OTP verify: cells stay visible, duplicate verify submissions are blocked.
- Skeleton: N/A. This is an input flow, not a data-fetching screen.
- First paint target: mobile first paint target from design principles.

### Empty

- Phone: field focused, prefix locked, CTA disabled until local phone format is complete.
- OTP: first cell focused, masked destination copy visible, resend countdown visible.
- Empty illustration: N/A.

### Error

- Pattern: inline error below the affected input. No error route.
- Color: `bg-destructive/10 text-destructive` for banners, `text-destructive` for input helper text.
- Icon: `<Icon as={AlertCircle} className="size-5 text-destructive">` for banner-level errors only.
- Wrong OTP: cells shake (Animated `translateX` sequence), clear all digits, refocus first cell.
- Expired OTP: show expired copy, keep "Change number" available, enable resend when backend allows.
- Rate-limited phone request: keep phone entry in place, disable CTA, show countdown using `Button` `disabled` state.
- Daily Sign-in Code limit on Resend: show the daily-limit message, disable the code cells, hide Resend and the dev code, and show one `Button` `variant="link"` labelled Contact support that opens Help. This is the code screen's only support link ([#353 founder answer 1](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353#issuecomment-5947334041)).
- Retry behavior: retry in place after countdown or when network returns.

### Offline

- Banner: `bg-warning-500/10 text-warning-500` (status hue — identical in both modes by design).
- Icon: `<Icon as={WifiOff} className="size-5 text-warning-500">`.
- Copy acknowledges that SMS request or verification needs connectivity.
- Existing typed phone is preserved in memory; OTP code is not persisted.

### Success

- Deferred action exists: close auth, replay deferred action, and let the action own the feedback, for example "Saved to Favorites."
- No deferred action: navigate to the tab app and show a small "Signed in" toast.

### Dev-only

- If the API returns `testCode` and the build is non-production, show `Dev code: 123456` under resend text.
- Never show `testCode` in staging or production builds.

## Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Bottom sheet open | slide up from bottom + scrim fade | `slow` | `decel` |
| Bottom sheet close | slide down + scrim fade | `slow` | `accel` |
| Auth route push | native modal transition | platform | platform |
| Button press | scale + opacity feedback | `fast` | `standard` |
| OTP digit fill | subtle scale + color shift | `fast` | `standard` |
| Wrong OTP | horizontal shake, then clear | `base` | `standard` |
| Toast after direct login | slide/fade | `base` | `decel` enter, `accel` exit |
| Locale switch | text content cross-fade | `base` | `standard` |

Reduced motion: bottom sheet becomes fade-only, OTP wrong-code shake is replaced with an instant error state and focus reset, OTP digit scale is skipped.

## Accessibility

- **Contrast ratios**: `textPrimary` on `background`, `textSecondary` on `background`, `textTertiary` on `background`, brand CTA text on brand surface, and error text on background use verified token pairs from `docs/prd/ui/77-accessibility.md` and meet WCAG AA for body text.
- **Tap targets**: close, back, language choices, legal links, Change number, Resend, and primary CTA must meet the mobile target minimum from the accessibility doc. Visual icons can be smaller inside the hit area.
- **Focus-visible**: native focus ring or a `border-[var(--color-brand-500)]` focused state must be visible for input and OTP cells.
- **Screen reader**:
  - Close button label: `auth.close`
  - Back button label: `auth.backToPhone`
  - Logo accessibility label: `AutoTM`
  - OTP input label: `auth.otp.codeLabel`
  - Resend button label includes countdown when disabled.
- **Reading order**: top bar, logo, title, helper, input, errors, CTA/resend, legal text.
- **Error announcement**: wrong/expired/locked messages should be announced via live region equivalent in React Native.
- **Keyboard**: phone uses numeric keypad; OTP uses one-time-code keyboard hints and supports paste.

## Trilingual copy

Draft Turkmen copy is provisional and should be reviewed by a translator before launch.

| Key | RU | TK | EN |
|---|---|---|---|
| `auth.sheet.saveTitle` | Войдите, чтобы сохранить объявление | Bildirişi saklamak üçin giriň | Sign in to save listings |
| `auth.sheet.messageTitle` | Войдите, чтобы написать продавцу | Satyja ýazmak üçin giriň | Sign in to message the seller |
| `auth.sheet.sellTitle` | Войдите, чтобы продать машину | Awtoulag satmak üçin giriň | Sign in to sell your car |
| `auth.sheet.genericTitle` | Войдите, чтобы продолжить | Dowam etmek üçin giriň | Sign in to continue |
| `auth.sheet.body` | Продолжите по номеру телефона. | Telefon belgiňiz bilen dowam ediň. | Continue with your phone number. |
| `auth.sheet.cta` | Продолжить по телефону | Telefon bilen dowam et | Continue with phone |
| `auth.phone.title` | Введите номер телефона | Telefon belgiňizi giriziň | Enter your phone number |
| `auth.phone.helper` | Мы отправим код по SMS. | Kody SMS arkaly ibereris. | We'll send a code by SMS. |
| `auth.phone.label` | Номер телефона | Telefon belgisi | Phone number |
| `auth.phone.inputHelper` | Введите номер мобильного телефона в Туркменистане. | Türkmenistandaky mobil telefon belgisini giriziň. | Enter a Turkmenistan mobile number. |
| `auth.phone.getCode` | Получить код | Kody al | Get code |
| `auth.legal.prefix` | Продолжая, вы соглашаетесь с | Dowam etmek bilen, siz | By continuing, you agree to the |
| `auth.legal.terms` | Условиями | Ulanyş şertleri | Terms |
| `auth.legal.and` | и | we | and |
| `auth.legal.privacy` | Политикой конфиденциальности | Gizlinlik syýasaty | Privacy Policy |
| `auth.otp.title` | Введите код | Kody giriziň | Enter the code |
| `auth.otp.sent` | Код отправлен на {phone} | Kod {phone} belgisine iberildi | Code sent to {phone} |
| `auth.otp.changeNumber` | Изменить номер | Belgini üýtget | Change number |
| `auth.otp.codeLabel` | Код из SMS | SMS kody | SMS code |
| `auth.otp.resendIn` | Отправить код повторно через {seconds} с | Kody {seconds} sekuntdan gaýtadan iber | Resend code in {seconds}s |
| `auth.otp.resend` | Отправить код повторно | Kody gaýtadan iber | Resend code |
| `auth.otp.dailyCodeLimit` | За 24 часа запрошено слишком много кодов. Попробуйте позже. | 24 sagatda gaty köp kod soraldy. Soňrak synanyşyň. | Too many codes requested for this destination in 24 hours. Try again later. |
| `auth.otp.contactSupport` | Связаться с поддержкой | Goldaw bilen habarlaş | Contact support |
| `auth.otp.devCode` | Код для разработки: {code} | Işläp düzmek üçin kod: {code} | Dev code: {code} |
| `auth.error.phoneFormat` | Введите номер в формате +993 6X XX-XX-XX. | Belgini +993 6X XX-XX-XX görnüşinde giriziň. | Enter a number in the format +993 6X XX-XX-XX. |
| `auth.error.rateLimited` | Слишком много попыток. Попробуйте через {minutes} мин. | Synanyşyk köp. {minutes} minutdan soň synanyşyň. | Too many attempts. Try again in {minutes} minutes. |
| `auth.error.network` | Нет подключения к интернету. Попробуйте снова. | Internete birikme ýok. Täzeden synanyşyň. | No internet connection. Try again. |
| `auth.error.wrongCode` | Неверный код. Попробуйте снова. | Nädogry kod. Täzeden synanyşyň. | Wrong code. Try again. |
| `auth.error.expired` | Срок действия кода истек. Запросите новый. | Kodyň möhleti gutardy. Täze kod soraň. | Code expired. Request a new one. |
| `auth.error.locked` | Слишком много попыток. Запросите новый код. | Synanyşyk köp. Täze kod soraň. | Too many attempts. Request a new code. |
| `auth.error.used` | Этот код уже использован. Запросите новый. | Bu kod eýýäm ulanyldy. Täze kod soraň. | This code has already been used. Request a new one. |
| `auth.error.generic` | Не удалось войти. Попробуйте снова. | Girip bolmady. Täzeden synanyşyň. | Could not sign in. Try again. |
| `auth.success.signedIn` | Вы вошли | Siz girdiňiz | Signed in |
| `auth.close` | Закрыть вход | Girişi ýap | Close sign-in |
| `auth.backToPhone` | Вернуться к номеру телефона | Telefon belgisine dolan | Back to phone number |
| `notifications.chat.rationale` | Разрешите уведомления, чтобы узнать, когда продавец ответит. | Satyjy jogap berende bilmek üçin habarnamalara rugsat beriň. | Allow notifications so you know when the seller replies. |
| `notifications.savedSearch.rationale` | Разрешите уведомления, когда новые машины подходят под этот поиск. | Bu gözlege laýyk täze awtoulaglar çykanda habarnamalara rugsat beriň. | Allow notifications when new cars match this search. |
| `notifications.listing.rationale` | Разрешите уведомления о сообщениях покупателей и обновлениях объявления. | Alyjylar ýazanda ýa-da bildiriş täzelenende habarnamalara rugsat beriň. | Allow notifications when buyers message you or your listing gets updates. |
| `notifications.settingsFallback` | Уведомления выключены. Включите их в настройках системы. | Habarnamalar öçürilen. Olary ulgam sazlamalarynda açyň. | Notifications are off. Enable them in System Settings. |

## Legal agreement decision

- S2 uses implicit agreement copy under the phone CTA. No checkbox is shown.
- Terms and Privacy links open canonical web legal pages: `https://auto.tm/<locale>/legal/terms` and `https://auto.tm/<locale>/legal/privacy`.
- Add a checkbox only if legal review requires explicit recorded acceptance or versioned consent.
- If versioned consent is required later, record accepted `termsVersion`, `privacyVersion`, `acceptedAt`, and `acceptedLocale` during OTP verification or first account creation.

## SMS autofill decision

- The sender must format OTP SMS bodies for iOS and Android autofill.
- The phone-agent only sends the message body it receives; the API or SMS gateway owns the formatter.
- Use a template with the visible code, Android app hash, and iOS domain-bound code line.
- The Android app hash must be computed after the final package name and signing certificate exist.
- The gateway path is not yet fully wired: current API gateway mode logs, and `apps/sms-gateway` still uses a mock sender for fleet mode.

## Notification permission decision

- OTP login never asks for native notification permission.
- Native prompt is asked at most once automatically after a concrete notification-using action:
  - first sent chat message,
  - saved search with notify enabled,
  - first published listing,
  - blog follow,
  - explicit marketing opt-in.
- If declined, later notification features show an inline System Settings CTA instead of opening the native prompt again.
- Store `notificationPermissionPrompted=true` locally on the device; store a server push token only after permission is granted.

## Implementation notes for the engineer

- **UI stack:** NativeWind v4 + React Native Reusables per `docs/agents/nativewind-v4.md`. RNR components needed for this flow: `button`, `input`, `icon`, `text`, `sheet`, `badge`. Install via `pnpm --filter @auto-tm/mobile exec npx @react-native-reusables/cli@latest add button input icon text sheet badge`. Bottom-sheet flow requires `<PortalHost />` mounted in `app/_layout.tsx` (§2.8 of the guide).
- **Token vocabulary:** Use semantic tokens for chrome (`bg-background`, `bg-card`, `bg-popover`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-input`, `bg-primary`, `text-primary-foreground`, `bg-destructive`, `border-destructive`, `text-destructive`). Use raw status hues (`text-link`, `bg-warning-500/10`, `text-success-500`) for non-swapping status signals. Use `bg-brand-500` only when intentionally calling out brand identity outside an RNR primitive (e.g., the logo lockup).
- Routes: implement `apps/mobile/app/(auth)/phone.tsx` and `apps/mobile/app/(auth)/otp.tsx`. (Shipped in S2 with raw RN; migrate to RNR per §7.3 of the guide in a follow-up sprint.)
- Navigation: bottom sheet opens `(auth)/phone`; phone route pushes `(auth)/otp`; OTP success returns to deferred action or tab app.
- Contracts: use `@auto-tm/contracts` schemas for `OtpRequestRequest`, `OtpRequestResponse`, `OtpVerifyRequest`, and `OtpVerifyResponse`.
- Phone formatting: display `+993 6X XX-XX-XX`; submit canonical `+9936XXXXXXX`.
- OTP verify payload: submit `phone`, `code`, and optional `deviceLabel`; `requestId` is not required by the backend verify contract.
- Token storage: store access and refresh tokens in `expo-secure-store` per `apps/mobile/CONTEXT.md`.
- Resume behavior: preserve phone and timer while OTP is valid; never persist entered OTP code to disk.
- Resend behavior: use backend `resendInSeconds` and recompute countdown from timestamps on resume.
- Errors: map `VALIDATION_FAILED`, `RATE_LIMITED`, `INVALID_OTP`, `OTP_EXPIRED`, `OTP_ALREADY_USED`, `OTP_LOCKED`, and `OTP_NOT_FOUND` to inline messages.
- SVG: use `apps/mobile/assets/logos_color_red.svg`; use text fallback if SVG rendering fails.
- Legal links: use `expo-linking` or the project-selected in-app browser/custom tab package when it exists. Do not deep-link `/legal/*` into the app.
- Notifications: leave prompt handling to chat/saved-search/listing flows; do not add notification permission code to OTP.
- Verification gate: run `pnpm --filter @auto-tm/mobile typecheck`, `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check`, and `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear` before claiming done — per nativewind-v4.md §9.

## Open questions / decisions deferred to engineer

- Decide during implementation whether the logo is imported through an SVG transformer or wrapped in a small `react-native-svg` component.
- Decide in legal review whether implicit agreement copy is sufficient or explicit recorded acceptance is required.

## Self-check

- No login wall before browse.
- No confirm screen before SMS request.
- No notification prompt during OTP.
- No legal checkbox in S2.
- No support link on the code screen except Contact support at the daily Sign-in Code limit, which opens Help.
- No fake urgency or promotional copy.
- Error color uses `destructive` semantic token (rose), not the brand red `primary`.
- Mobile touch targets follow the accessibility minimum.
- Both light and dark rely on semantic tokens (`bg-background`, `bg-card`, `text-foreground`, etc.) that auto-swap — no redundant `dark:` pairs needed.
- Every composite primitive in the Component shape sample is an RNR import (`@/components/ui/*`): `Button`, `Input`, `Icon`, `Text`, `Sheet`, `Badge`. NO `Pressable`-as-button. NO icons via `color`/`size` props. NO `Text` from `react-native` inside RNR composites.
- NO imports from `@auto-tm/ui/components/*` (web-only).
- Cross-checked against `docs/agents/nativewind-v4.md` §6 (RNR rules) and §8 (anti-patterns).
- Trilingual copy is present; Turkmen is marked provisional for later review.
- §Customization plan section present — lists PhoneInput (custom composition) + OtpCells (custom composition) + Button "link" inline pattern (cn() override).
- Custom compositions live under `apps/mobile/components/auth/`, NOT `apps/mobile/components/ui/` (that path is reserved for RNR-installed primitives).
- `OtpCells` owns the shake animation via `useImperativeHandle`; route file does NOT redeclare an `Animated.Value`.
- Button "link" inline pattern uses `cn()` at call site, not a new CVA variant (justification: 2 call sites — promote only when third screen needs it).

## In-place sign-in entry (#717)

The phone and email entry URLs stay valid and render the same SignInEntryScreen
with the corresponding initial method. Their values, validation and request
errors belong to that mounted screen, separately for each method. A switch is
local state: it performs no navigation and never cancels the pending action.
One native input stays mounted while its value, label, country prefix and
keyboard type change; focus is retained/refreshed without Keyboard.dismiss.

The common close/language header, wordmark, segmented control, Get code and
legal line remain in place. Title/helper text reserves the taller measured
localized copy and cross-fades; method helpers do the same. The field changes
opacity quickly against an inaccessible, non-interactive drawing of the outgoing
field, with no slide; the same native input remains interactive and focused. The segmented capsule uses the existing snappy
180ms critically damped spring with overshoot clamped; labels cross-fade.
Motion uses the system reduction policy. A changed method gives one best-effort
selection tick (Android system Clock_Tick, elsewhere selectionAsync); choosing
the already selected method does nothing. Expo Haptics ~55.0.18 is the same
approved version as #718 and adds Android VIBRATE through its native manifest.
No egress or runtime permission prompt is added; hardware feedback needs proof.

Entry close or Android Back exits once. Only leaving the root entry abandons an
unfinished sign-in intent; success preserves replay. With an entry still mounted
under Code, header/native Back and Change identifier pop to it, and Use phone
instead selects its retained phone field before popping. A standalone Code link
keeps its legacy valid-entry/cancel fallbacks. Account add/change screens remain
fixed signed-in method purposes: they have no segmented switch or sibling method
navigation. Their existing shared entry chrome, verify route and refusal rules
remain separate and unchanged.

Rendered tests cover no-route switching, retained values/native input instance,
keyboard-type props, one close/back/cancel, localized roles, actual OTP request,
Code return and completed replay. Native proof remains required for stationary
geometry, keyboard continuity, actual navigation/back, animation/reduced motion,
haptics and account-purpose flows. Capture phone/email in light/dark EN/RU/TK,
record a switch, and exercise Code return, single exit and account add/change.

### Wrong-code Reduce Motion implementation (#730)

The shared OtpCells checks Reanimated's synchronous system Reduce Motion value
before starting its existing RN Animated shake. With the setting on it resets
the translation and skips the animation; CodeEntryForm still shows its localized
error, clears digits and refocuses for recoverable errors. Normal motion and
terminal/daily-limit behavior retain their existing rules. No code-purpose or
sign-in navigation changes.

The installed Reanimated 4.2.1 hook reads the system setting when the app starts;
changing the OS setting during a running session does not update that value.
Native verification must launch the app afresh with Reduce Motion on, then off,
trigger wrong code with the keyboard open and verify TalkBack can continue input.
The rendered real form/cells test proves error/clear/focus and animation invocation
for phone/email and EN/RU/TK; it does not prove native focus, keyboard or motion.
