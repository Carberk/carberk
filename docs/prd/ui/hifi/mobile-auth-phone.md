# Hi-Fi — Mobile Phone Auth Screen

> Issue: #124 — apply wizard design handoff to app shell, auth, and listing wizard  
> Maps to: `apps/mobile/app/(auth)/phone.tsx`  
> Derived from wireframe: `docs/prd/ui/wireframes/mobile-auth-phone.md`  
> Design archive source: `screens/01-phone.html`

==============================================
HIGH-FIDELITY DESIGN — Mobile Phone Auth Screen
Platform: mobile
Mode: light + dark
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

Collect a Turkmenistan mobile phone number and request an SMS OTP code. This is the first step of auth-on-action. The visual polish here sets trust expectations for the entire flow.

## Layout

```text
┌────────────────────────────────────────────┐
│ safe-top                                   │
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

## Token map

### Backgrounds + surfaces
- Root: `bg-background`
- Close icon button press: `active:bg-neutral-100 dark:active:bg-neutral-800`
- Language chip active: `bg-neutral-100 text-foreground`
- Language chip inactive: `text-neutral-400`
- Phone input wrap: `bg-background border-[1.5px] border-border rounded-lg`
- Phone input focus: `border-foreground shadow-sm` (ring)
- Phone input error: `border-destructive shadow-[0_0_0_3px_rgba(244,63,94,0.08)]`
- CTA: `bg-black dark:bg-white`
- Network banner: `bg-destructive/10 border border-destructive/20 rounded-lg`

### Borders + dividers
- Phone input: `border-[1.5px] border-border` (1.5px required by design archive)
- Prefix separator: `border-r border-border`

### Typography
- Title: `font-display`, `text-[28px] leading-tight font-bold tracking-tight text-foreground`
- Subtitle: `text-base text-neutral-500`
- Label: `text-sm font-medium text-foreground`
- Prefix: `font-mono`, `text-[17px] font-medium text-foreground`
- Phone input: `font-mono`, `text-[17px] text-foreground`
- Helper: `text-sm text-neutral-500`
- Helper error: `text-sm text-destructive`
- CTA: `text-base font-medium text-white dark:text-black`
- Legal: `text-xs text-neutral-500 text-center`
- Legal link: `text-xs font-medium text-foreground underline`

### Spacing
- Top bar: `px-5 pt-safe pb-4 flex-row justify-between`
- Logo: `mt-6 mx-5` (width 130px)
- Title group: `mt-8 mx-5 gap-2`
- Form: `mt-8 mx-5 gap-3`
- Phone wrap: `h-[52px] flex-row overflow-hidden`
- Prefix: `px-3.5`
- Phone input: `flex-1 px-3.5`
- Helper: `mt-1.5`
- CTA: `mx-5 mt-8 h-[52px] rounded-full`
- Legal: `mx-5 mt-auto pb-8 text-center`
- Network banner: `mx-5 mt-4 p-3`

### Radius
- Close button: `rounded-full`
- Language chips: `rounded-full`
- Phone input: `rounded-lg` (8px)
- CTA: `rounded-full`
- Network banner: `rounded-lg`

### Icons
- Close: `X`, 22×22, `text-foreground`
- Network error: `AlertCircle`, 16×16, `text-destructive`

## Component shape

### Implementation (mobile — NativeWind v4 + RNR)

```tsx
import { useState } from "react";
import { View } from "react-native";
import { AlertCircle, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

const LANGS = ["RU", "TK", "EN"];

export default function PhoneScreen() {
  const [lang, setLang] = useState("EN");
  const [phone, setPhone] = useState("");
  const [hasBlurred, setHasBlurred] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const valid = digits.length === 8 && digits.startsWith("6");
  const showError = (hasBlurred || digits.length > 0) && !valid && digits.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Top bar */}
      <View className="px-5 pt-safe pb-4 flex-row items-center justify-between">
        <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full">
          <Icon as={X} className="size-[22px] text-foreground" />
        </Button>
        <View className="flex-row gap-1">
          {LANGS.map((l) => (
            <Button
              key={l}
              variant="ghost"
              size="sm"
              className={`rounded-full px-2.5 py-1.5 ${
                lang === l ? "bg-neutral-100 dark:bg-neutral-800" : ""
              }`}
              onPress={() => setLang(l)}
            >
              <Text
                className={`text-[13px] font-medium ${
                  lang === l ? "text-foreground" : "text-neutral-400"
                }`}
              >
                {l}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      {/* Brand logo */}
      <View className="mx-5 mt-6">
        {/* <BrandLogo width={130} /> */}
      </View>

      {/* Title */}
      <View className="mx-5 mt-8 gap-2">
        <Text className="font-display text-[28px] leading-tight font-bold tracking-tight text-foreground">
          Enter your phone number
        </Text>
        <Text className="text-base text-neutral-500">
          We&apos;ll send a code by SMS.
        </Text>
      </View>

      {/* Form */}
      <View className="mx-5 mt-8 gap-3">
        <Text className="text-sm font-medium text-foreground">Phone number</Text>
        <View
          className={`flex-row h-[52px] bg-background border-[1.5px] rounded-lg overflow-hidden ${
            showError
              ? "border-destructive"
              : "border-border"
          }`}
        >
          <View className="px-3.5 items-center justify-center border-r border-border">
            <Text className="font-mono text-[17px] font-medium text-foreground">+993</Text>
          </View>
          <Input
            className="flex-1 border-0 bg-transparent font-mono text-[17px] text-foreground px-3.5"
            placeholder="6X XX-XX-XX"
            placeholderTextColor="hsl(var(--muted-foreground))"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            onBlur={() => setHasBlurred(true)}
          />
        </View>
        <Text className={`text-sm ${showError ? "text-destructive" : "text-neutral-500"}`}>
          {showError
            ? "Enter a number in the format +993 6X XX-XX-XX."
            : "Enter a Turkmenistan mobile number."}
        </Text>
      </View>

      {/* Network banner */}
      {networkError && (
        <View className="mx-5 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex-row items-center gap-2">
          <Icon as={AlertCircle} className="size-4 text-destructive" />
          <Text className="text-sm font-medium text-destructive">
            No connection. Check your network and try again.
          </Text>
        </View>
      )}

      {/* CTA */}
      <View className="mx-5 mt-8">
        <Button
          variant="default"
          className="h-[52px] rounded-full bg-black dark:bg-white"
          disabled={!valid || isLoading}
          onPress={() => setIsLoading(true)}
        >
          {isLoading ? (
            <View className="flex-row items-center gap-2">
              {/* Spinner component */}
              <Text className="text-base font-medium text-white dark:text-black">Sending…</Text>
            </View>
          ) : (
            <Text className="text-base font-medium text-white dark:text-black">Get code</Text>
          )}
        </Button>
      </View>

      {/* Legal */}
      <View className="mx-5 mt-auto pb-8">
        <Text className="text-xs text-neutral-500 text-center">
          By continuing, you agree to the{" "}
          <Text className="text-xs font-medium text-foreground underline">Terms</Text>
          {" "}and{" "}
          <Text className="text-xs font-medium text-foreground underline">Privacy Policy</Text>
          .
        </Text>
      </View>
    </SafeAreaView>
  );
}
```

## Customization plan

| Primitive | Path | File | Details |
|---|---|---|---|
| `Button` (default) | Variant override at call site | `apps/mobile/app/(auth)/phone.tsx` | `bg-black dark:bg-white` overrides brand-red `bg-primary`. Documented divergence. |
| `Input` | Bracket override | `apps/mobile/app/(auth)/phone.tsx` | Composed inside a `View` with `border-[1.5px]` because design archive uses 1.5px borders. |
| `Button` (ghost icon) | Default | `apps/mobile/components/ui/button.tsx` | `variant="ghost" size="icon"` for circular close button. |

## States

### Default
Field auto-focused (if possible). `+993` prefix visible. CTA disabled until 8 digits entered.

### Loading
CTA shows spinner + "Sending…", disabled. Input remains visible but should not be editable during request.

### Empty
Default state on first open.

### Error (format)
Red border + helper: "Enter a number in the format +993 6X XX-XX-XX." Shown only after blur or after 8 digits attempted; NOT while typing.

### Error (network)
Banner below input: `bg-destructive/10 border border-destructive/20` with `AlertCircle` icon.

### Rate-limited
Disable CTA; show countdown helper: "Too many attempts. Try again in 10 minutes."

## Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Phone input focus | border-color transition to `border-foreground` + shadow ring | `fast` (150ms) | `standard` |
| CTA press | scale 0.98 | `fast` (150ms) | `standard` |
| Language chip press | bg-color fade | `fast` (150ms) | `standard` |
| Network banner | fade in + slide down 4px | `base` (250ms) | `decel` |

Reduced motion: instant transitions.

## Accessibility

- **Contrast ratios**: `text-foreground` on `bg-background` ≥ 21:1. `text-neutral-500` on `bg-background` ~ 5.4:1 (pass AA body). Black CTA `bg-black` on `text-white` ≥ 21:1.
- **Tap targets**: Close button 40×40 (pass with padding). Language chips 36×min-width. CTA 52×full-width.
- **Focus-visible**: Phone input wrap shows `border-foreground` + `shadow-sm` on focus.
- **Screen reader**: Close button `accessibilityLabel="Close"`. Phone input `accessibilityLabel="Phone number without country code"`. Prefix should not be focusable separately.
- **Reading order**: Close → Language chips → Logo → Title → Subtitle → Label → Prefix → Input → Helper → CTA → Legal.

## Trilingual copy

| Key | RU | TK | EN |
|---|---|---|---|
| `screen.title` | Введите номер телефона | Telefon belgiňizi giriziň | Enter your phone number |
| `screen.subtitle` | Мы отправим код по SMS | SMS arkaly kod ibereris | We&apos;ll send a code by SMS. |
| `input.label` | Номер телефона | Telefon belgisi | Phone number |
| `input.placeholder` | 6X XX-XX-XX | 6X XX-XX-XX | 6X XX-XX-XX |
| `input.helper` | Введите номер мобильного Туркменистана. | Türkmenistanyň mobil belgisini giriziň. | Enter a Turkmenistan mobile number. |
| `input.error` | Введите номер в формате +993 6X XX-XX-XX. | +993 6X XX-XX-XX formatynda belgi giriziň. | Enter a number in the format +993 6X XX-XX-XX. |
| `cta.primary` | Получить код | Kod alyň | Get code |
| `cta.loading` | Отправка… | Ugradylýar… | Sending… |
| `legal` | Продолжая, вы соглашаетесь с Условиями и Политикой конфиденциальности. | Dowam etmegiňiz bilen, siz Şertleri we Gizlinlik Siyasetini kabul edýärsiňiz. | By continuing, you agree to the Terms and Privacy Policy. |
| `error.network` | Нет соединения. Проверьте сеть и попробуйте снова. | Baglanyşyk ýok. Toruňyzy barlaň we gaýtadan synanyşyň. | No connection. Check your network and try again. |

## Implementation notes

- Paste handler must strip `+993` prefix if present. Accept full `+9936XXXXXXX` paste and normalize to local digits.
- Phone formatting should display as `6X XX-XX-XX` live. Store canonical `+993{rawDigits}`.
- Error color shown only on blur or after 8 digits attempted (per UX audit finding #5).
- `font-mono` is Menlo by default. If UberMoveMono is loaded, use `font-mono` token mapped to it.
- Legal links open in-app browser to `https://auto.tm/{locale}/legal/...`.

## Design archive mapping

- `screens/01-phone.html` → `app/(auth)/phone.tsx`.

### Shared sign-in entry (#717)

This URL now chooses the initial phone method of the shared SignInEntryScreen.
Phone/email switching stays in place with separate held values and one native
input; it adds no navigation history. The common header/logo/button/legal chrome
stays fixed and localized method copy cross-fades inside measured stable space.
The existing phone normalization, helper/error strings and OTP API contract are
retained. See the current [login-flow implementation](mobile-otp-login-flow.md#in-place-sign-in-entry-717)
for Code return, single exit, motion/haptics, account-purpose boundaries and the
required native matrix. The historical screen example above is not an instruction
to restore a separate method screen or obsolete font/color/link values.
