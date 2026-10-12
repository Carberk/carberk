# Issue 843 verification: focused inputs and the chat composer above the keyboard

## Root cause

React Native 0.83.10's `KeyboardAvoidingView` (`Libraries/Components/Keyboard/KeyboardAvoidingView.js`) takes its frame from `onLayout`, which is relative to its parent. It subtracts that frame from the keyboard's screen position. A region gives the right padding only when its parent's frame starts at the top of the window, or when `keyboardVerticalOffset` supplies the difference.

- **Chat (iOS).** `MessageComposer.tsx` wrapped only the composer in a region enabled on iOS. Its frame was measured from the footer's parent, not the screen, so the padding came out too small and the composer stayed behind the keys (founder proof `53-chat-keyboard-state.png`: composer at y 545–589 pt, suggestion bar from 539 pt). #756 had fixed the same mismatch on Android only, by padding the whole screen column in `app/conversations/[id].tsx`.
- **Sell wizard (iOS).** `WizardLayout.tsx` padded on Android only, so on iOS Continue and a low field such as the description sat behind the keyboard.
- **Sign-in, Sign-in Method, name editor and contact phone (Android).** These used `behavior={Platform.OS === "ios" ? "padding" : undefined}`. Android is edge to edge, so the window does not resize for the keyboard. Release emulator pass 2 (B-iii) showed this for the wizard's Continue before #776.

## Fix

Each affected screen now has one region, `behavior="padding"`, on both platforms. It sits directly in the screen root (`SafeScreen` or the safe-area view), whose frame starts at the top of the window, so it needs no offset. That covers the tab bar and the safe-area insets: the region's bottom edge is already in window coordinates.

- `app/conversations/[id].tsx`: the whole column pads on iOS too. `MessageComposer` has no region of its own.
- `src/listings/wizard/WizardLayout.tsx`: pads on iOS too. The step's scroll view uses `useKeepFocusedInputVisible` to bring the focused field back above the action bar.
- `app/(auth)/otp.tsx`, `components/auth/AuthEntryScreen.tsx`, `components/account/SignInMethodEntryScreen.tsx`, `app/account/display-name.tsx`, `app/account/verify-sign-in-method.tsx`, `app/listings/contact-phone.tsx`, `app/listings/contact-phone-code.tsx`: pad on Android too.
- Search and Search parameters were audited and left unchanged: both already pad on both platforms from the screen root.

No new native dependency was added.

## Test evidence

| Criterion | Red | Green |
|---|---|---|
| Composer, Send, Attach and latest Message inside one whole-column region on iOS and Android; no composer-local region | `b006b5f5`: the iOS region was the composer's own (`className` undefined); Android had a second nested region; the composer rendered a region | `3416a2e7`: pass |
| Wizard pads on iOS and reveals the focused field | `b006b5f5`: iOS `enabled` false; no `keyboardDidShow` listener | `3416a2e7`: pass |
| Sign-in entry, code, add phone, verify, name, contact phone and code pad on Android | `b006b5f5`: `behavior` undefined on Android (7 tests) | `3416a2e7`: pass |

Command: `pnpm --filter @auto-tm/mobile exec vitest run <the nine specs> -t keyboard`. Red: 13 failed, 9 passed. Green: 22 passed.

The render adapter proves the region's configuration and what it contains. It does not prove native layout.

## Phone field digits under fast typing

`usePhoneField` reformats a controlled value on every change. If keystrokes arrive faster than the JavaScript round trip, the native text can be overwritten by an older formatted value. This is the known React Native controlled-input race, and it needs automation speed (Maestro `inputText`), not human typing. It is recorded as an automation-only artefact with no code change. The final native session should confirm it by typing by hand.

## Native proof

Per the founder's decision of 2026-10-12, no simulator or emulator screenshots were taken for this PR. Keyboard-open screenshots of the chat composer, the wizard description and the sign-in phone screen are deferred to the root's single final Android session on the EAS staging build.

## Documentation lookups

Context7 was unavailable in this session. The official React Native `KeyboardAvoidingView` docs (`keyboardVerticalOffset`: "the distance between the top of the user screen and the react native view") and the installed 0.83.10 source were used instead.
