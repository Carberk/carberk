# Mobile: first-run onboarding hi-fi

## Status, purpose, and sources

**Status: approved by the founder on 2026-10-08 and implemented in the same pull request (774).** The founder's decisions are recorded under [Founder decisions](#founder-decisions). Device evidence is still owed; see [Implementation notes](#implementation-notes).

Purpose: a person who has just installed AutoTM picks a language, sees in two screens what the app does today, and lands on Home without signing in. The onboarding it replaces was three text-only screens with no pictures and with claims the app cannot back; the founder asked for a clearer flow with graphics, in AutoTM's own look.

| Artifact | Path |
|---|---|
| Preview (open in a browser, no network needed) | [preview/mobile-onboarding.html](preview/mobile-onboarding.html) |
| Screenshots of the preview | [RU](preview/mobile-onboarding-ru.png), [TK](preview/mobile-onboarding-tk.png), [EN](preview/mobile-onboarding-en.png) |
| Illustrations (original SVG) | [apps/mobile/assets/onboarding/](../../../../apps/mobile/assets/onboarding/) |

Sources read, in authority order:

- [ADR-0051](../../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md): anonymous browsing and AutoTM tokens stay; Auto.ru is a journey reference, not a visual template. [ADR-0034](../../../adr/0034-kolesa-ux-findability-reference.md) item 5 set "language picker + 1–2 skippable slides → anonymous feed"; the approved flow has two.
- Source at `origin/main` `4397b3c2`, before this change: `apps/mobile/app/(onboarding)/{_layout,index,language,value-prop}.tsx`, `apps/mobile/src/auth/LocaleSwitcher.tsx`, `apps/mobile/src/onboarding/onboardingFlag.ts`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/i18n/resources.ts`.
- Tokens: `packages/ui/tokens/mobile.ts`, `apps/mobile/global.css`, [71](../71-design-tokens.md), [72](../72-light-and-dark.md), [73](../73-typography.md), [75](../75-illustration-style.md), [76](../76-motion.md).
- References, viewed only: Auto.ru `44-first-login` (3 images), `43-auth`, `01-home-feed`; Kolesa `52-onboarding`. No image, artwork, colour or wording from either is in this repository.

### What the references actually show

The saved Auto.ru first-login set is a red splash with the wordmark and a slogan, the system notification prompt, then Home. It has no illustrated slides. Kolesa's set is a wordmark splash, a two-button language choice on a full brand-colour screen, then Home with a tracking prompt. The graphics the founder remembers are most likely Auto.ru's rendered cars on Home. What this proposal takes from them is structural: language first (Kolesa), then straight into browsing with no sign-in (both). It deliberately does not take the permission prompt on first launch.

### When a fresh install saw onboarding before this change

From source, **it did not**. PR 760 changed the root `initialRouteName` from `(onboarding)` to `(tabs)` and removed the `Stack.Protected` guard, the completion subscription and the readiness gate ([issue 757 record](../../../evidence/issue-757/verification.md), fix-round item 4). Nothing navigated to `/(onboarding)`: the only links into the group were inside it. This was not run on a device. `(onboarding)/index` and `(tabs)/(search)/index` both resolved to `/`; the implementation removed `(onboarding)/index.tsx`, so only Home answers `/`.

### Problems in the screens this replaces

1. Three screens of text with no picture; the third has one small shield icon. Nothing tells the screens apart at a glance.
2. Copy promises what does not exist: "VIN history", "honest condition disclosures", "AutoTM inspections coming in pilot", "verified-phone sellers", contacting sellers "safely".
3. The language control shows codes (`TK RU EN`) in a small segmented control, left-aligned in a wide grey bar, not language names.
4. Skip sits under the main button, at the very bottom, next to the system navigation bar.
5. The splash screen is hard-coded white (`bg-white`, dark status-bar text) in an app that defaults to dark.

## Flow

```text
cold start ── already used the app, or onboarding done ─► Home (tabs)
     │
     └─ fresh install ► Language ► Find ► Chat ► Home (tabs)
                                   └─ Skip ────► Home (tabs)
```

- **Language** (`/(onboarding)/language`): three rows with language names. Tapping a row switches the whole screen at once. Continue goes on.
- **Find, Chat** (`/(onboarding)/value-prop`, one route, two pages in a horizontal pager): swipe or Next. Skip is in the top bar on Find only. Chat carries the final button, "Browse listings".
- **Leaving**: Skip and the final button do the same thing: store the flag, then `router.dismissTo(HOME_HREF)`. Home is already underneath, so this takes the onboarding screens off the stack. The person arrives signed out and can browse. Nothing in onboarding asks for sign-in, notifications, photos, camera or location.
- **Back**: on Chat, the header button and Android Back go to Find. On Find they return to Language. On Language, Android Back leaves the app; the screen has no Back button. Home is underneath Language, so the screen handles Back itself (`BackHandler.exitApp()`); otherwise Back would drop to Home and skip onboarding without storing anything. The iOS edge swipe is off on both screens for the same reason, and because the pager owns horizontal swipes.

## Layout and responsive/safe-area behavior

All sizes are dp. Both screens sit in `SafeScreen`, which pads all four insets; screen padding goes on a `flex-1` View inside it (`test/routes/onboarding-padding.spec.tsx`). Nothing is absolutely positioned, so Android gesture navigation (inset about 24) and 3-button navigation (inset 48) both push the footer up and the main button is never under the system bar. The same applies to the iOS home indicator.

### Language

```text
┌──────────────────────────────────────┐
│ status bar inset                     │
│ auto.tm wordmark              h 48   │  px-6, wordmark 22 high
│ ┌──────────────────────────────────┐ │
│ │  [TK]   [EN]                     │ │  illustration panel
│ │     [ RU ]  ← chosen, red        │ │  flex-1, min-h 96
│ │   car on a ground line           │ │  mx-6 mt-1 mb-5, p-3
│ └──────────────────────────────────┘ │  bg-card rounded-3xl
│ Выберите язык            text-title  │  px-6
│ Вы можете изменить…      text-body   │  mt-2, muted
│ ┌──────────────────────────────────┐ │  mt-4 mx-6
│ │ Türkmençe                      ○ │ │  bg-card rounded-2xl
│ │ Русский                        ● │ │  3 rows × h-control-lg (56)
│ │ English                        ○ │ │  px-5, inset divider
│ └──────────────────────────────────┘ │
│ [          Продолжить             ]  │  pt-4 px-6 pb-4, pill 56
│ navigation bar inset                 │
└──────────────────────────────────────┘
```

### Find / Chat

```text
┌──────────────────────────────────────┐
│ status bar inset                     │
│ (‹)                     Пропустить   │  h 48, px-4; back 44 circle
│ ┌──────────────────────────────────┐ │
│ │                                  │ │  illustration panel
│ │          illustration            │ │  flex-1, min-h 96
│ │                                  │ │  mx-6 mt-1 mb-5, p-3
│ └──────────────────────────────────┘ │  bg-card rounded-3xl
│ Найдите машину           text-title  │  px-6, up to 3 lines
│ по марке и модели                    │
│ Смотрите объявления…     text-body   │  mt-3, muted, up to 4 lines
│                                      │  text block min-h 146
│ ━━ •                                 │  pt-6 px-6; dots h 6, gap 6
│ [             Далее               ]  │  mt-5, pill 56; pb-4
│ navigation bar inset                 │
└──────────────────────────────────────┘
```

Rules that hold on every size:

- The illustration panel is the only flexible element. Text, rows, dots and buttons keep their size; the panel takes what is left and the artwork scales inside it with its aspect ratio (304 × 248), centred.
- The top bar and the footer (dots and button) stay fixed while pages swipe; only the panel and text move. Skip keeps its space on Chat but is not rendered as a control there, so the bar does not jump.
- The text block reserves 146 dp (two title lines, three body lines) so the panel is the same size on both pages. Longer text grows upward into the panel's space. The text sits in a vertical scroll view sized by its content, so when the panel is already at its 96 dp minimum the text scrolls instead of clipping.
- Text is left-aligned, like Home's headings. Titles use balanced wrapping where the platform supports it; no manual line breaks in strings.

| Window | Behaviour (checked in the preview) |
|---|---|
| 360 × 780, gesture nav | Reference layout. Panel about 390 high on slides, 300 on Language. |
| 360 × 640, 3-button nav | Everything fits without scrolling. Panel shrinks to about 225 on slides and about 135 on Language. |
| 412 × 915 | Panel grows; artwork scales to the panel width (about 340). No max width below 480. |
| Width ≥ 600 (tablet, landscape) | Content column capped at 480, centred. |
| Usable height < 520, or font scale ≥ 1.3 | See Large text below. |

## Token map (light and dark)

Values are from `apps/mobile/global.css`.

| Element | Utility | Light | Dark |
|---|---|---|---|
| Page | `bg-background` | `#F3F3F1` | `#0F0F10` |
| Illustration panel, language rows | `bg-card` | `#FFFFFF` | `#1B1B1D` |
| Panel radius | `rounded-3xl` | 28 | 28 |
| Rows card radius | `rounded-2xl` | 24 | 24 |
| Row divider (inset 20 each side) | `border-border` | `#E2E2DF` | `#2F2F32` |
| Title | `text-title font-heading font-bold text-foreground` (28/34, -0.3) | `#171717` | `#FAFAF9` |
| Body, subtitle | `text-body text-muted-foreground` (16/22) | `#666666` | `#A5A5AC` |
| Row label | `text-body font-medium text-foreground`; chosen row `font-semibold` | | |
| Radio, not chosen | 24 circle, `border-2 border-border` | `#E2E2DF` | `#2F2F32` |
| Radio, chosen | 24 circle `bg-primary`, white check 14, stroke 3 | `#E60000` | `hsl(0 90% 52%)` |
| Back button | 44 circle `bg-secondary`, `ChevronLeft` 22 `text-foreground` | `#E7E7E4` | `#2A2A2D` |
| Skip | `text-callout font-medium text-muted-foreground`, `min-h-12 px-2` | `#666666` | `#A5A5AC` |
| Dot, current | 24 × 6 `rounded-full bg-foreground` | `#171717` | `#FAFAF9` |
| Dot, other | 6 × 6 `rounded-full bg-muted-foreground/40` | | |
| Main button | `Button variant="brand" size="pill"` (56, pill) | `#E60000` / white | `hsl(0 90% 52%)` / white |
| Illustration ink | SVG `color` = foreground | `#171717` | `#FAFAF9` |
| Illustration accent | literal in the SVG | `#E60000` | `#E60000` |
| Status bar | `expo-status-bar` style from the scheme | dark icons | light icons |

Dots use the foreground, not red: red is kept for the one action on the screen and the one accent in the picture.

The white splash route (`(onboarding)/index.tsx`) is removed. A first launch opens Language under the root launch entrance from #833; no splash route is pushed.

## Illustrations

Five original SVG files, hand-authored for this design, in [apps/mobile/assets/onboarding/](../../../../apps/mobile/assets/onboarding/):

| File | Screen | Picture |
|---|---|---|
| `onboarding-language-tk.svg`, `-ru.svg`, `-en.svg` | Language | Three number plates reading TK, RU and EN above a car. The chosen language is the red plate in front; one file per choice. |
| `onboarding-find.svg` | Find | A search field and a Listing card with a car, under a red magnifier; a second card peeks in from the right. |
| `onboarding-chat.svg` | Chat | Two chat bubbles above a car: the seller's in tone, the buyer's in red. |

The Sell illustration was removed with the Sell page.

Style, so later illustrations match:

- One car, drawn the same way in every picture, as the recurring subject.
- Ink is `currentColor`: 3 dp rounded strokes (2.5 on small parts). Tonal shapes are `currentColor` at 7–20% opacity, so one file reads on the light and the dark panel with no second variant.
- Exactly one solid red element per picture, plus the car's red headlight. White appears only on red.
- Flat. No gradients, shadows, 3D, characters or text set in a font. The plate letters are Geist Bold outlines converted to paths (Geist is SIL OFL), so they do not depend on font loading.
- View box `8 6 304 248`.

[75](../75-illustration-style.md) records this style in its "Onboarding illustrations" section: tonal fills in addition to strokes, and a size above the 200 × 200 limit that was written for empty states.

**Rendering in the app.** `react-native-svg` and `react-native-svg-transformer` were already installed and wired in `metro.config.js`. `components/onboarding/IllustrationPanel.tsx` imports each file as a component and passes the foreground token as `color`. `expo-image` cannot recolour `currentColor`, so it is not the route. No new dependency. The app copies have no `<title>`, `role` or `aria-labelledby`: the panel is hidden from screen readers and the title beside it says the same thing.

## Component and customization map

| Element | Component | Change |
|---|---|---|
| Screen wrapper | `SafeScreen` + inner `flex-1` View | none |
| Main button | `Button` `variant="brand"` `size="pill"` + `Text` | none |
| Back | `Button` `variant="secondary"` `size="icon"` + `Icon as={ChevronLeft}` | none |
| Skip | `PressableScale` with `min-h-12 min-w-12 px-2` and a `text-callout font-medium text-muted-foreground` label | call-site classes |
| Language rows | New `components/onboarding/LanguageRows.tsx`: `radiogroup` of three `PressableScale` rows | new feature component. `LocaleSwitcher` stays as it is for the sign-in screens |
| Pager | `Animated.ScrollView` from Reanimated, `horizontal pagingEnabled`, two pages of the column width | new, no dependency |
| Dots | New `components/onboarding/PagerDots.tsx`, widths driven by the scroll offset | new |
| Illustration panel | New `components/onboarding/IllustrationPanel.tsx`: View `bg-card rounded-3xl` + imported SVG component | new |

## Page-state matrix

| State | Behaviour |
|---|---|
| Default | As specified. |
| Loading | The only wait is the launch gate reading storage, behind the launch entrance, for at most 1 s. Screens have no data to load. |
| Empty | N/A: no lists or user data. |
| Error | Reading storage fails or takes over 1 s: go to Home, do not show onboarding, log a warning. A late answer is still stored, so a fresh install on slow storage sees onboarding at its next start. Writing the flag fails on Skip/finish: still go to Home; onboarding may show once more next start. Onboarding never blocks the app. |
| Offline | N/A: onboarding makes no network request. Home handles offline after it. |
| Returning user | Flag set: onboarding is not shown and its routes are not reachable from Back. Opening an onboarding route by link after completion — or with a session stored — redirects to the tabs. Language stays changeable in Cabinet. |
| Someone who already used the app, with no flag (update from a build that never showed onboarding) | Not shown. A session, or anything the app has stored (a chosen language or theme, a recent search, the notification prompt), counts as "already used" and the flag is written silently. The app stores a language only when the person picks one, so a stored language alone would miss most people. Someone who only ever opened the app and did none of these looks like a fresh install and sees onboarding once. |
| Deep link or push on first start | The link wins: open its target and do not show onboarding in front of it. The flag stays `pending`, so onboarding shows at the next plain cold start, unless the person has signed in by then. |
| App killed mid-flow | The flag is `pending`, so the next start begins at Language with the chosen language kept. |

## Interaction-state and microinteraction matrix

| Interaction | Trigger | Rules | Feedback | Loop/mode | Recovery |
|---|---|---|---|---|---|
| Choose language | Tap a 56 dp row | `localeStore.setLocale`; one row always chosen; tapping the chosen row does nothing. First paint preselects the stored language, else Russian. The app does not read the device language today: `localeStore.hydrate` resolves a missing value to `ru` before `initI18n` could detect it. Changing that would also change the language for people already using the app, so it is left for its own decision | Row press tone (`bg-accent`) under 100 ms; check moves; title, subtitle, button and picture change language at once; selection haptic | Stays until changed; no hidden mode | Tap another row |
| Continue | Tap main button | Push value-prop page 1. A tapped row has already stored the language; with no tap, Continue stores the preselected one before moving on | `PressableScale` control press (0.96) | | Back returns to Language |
| Next | Tap main button on Find | Scroll the pager to Chat. A tap in the 380 ms after it (`duration.slow`) is ignored, so a double tap does not finish onboarding | Press scale; pages slide; dots follow | | Back button, Android Back or swipe right |
| Swipe | Horizontal drag on the page area | Paging snaps to a page; no overscroll past Find or Chat; swiping left on Chat does not finish | Dots track the finger | | Swipe back |
| Skip | Tap Skip (Find) | Store flag, dismiss to Home. Second tap ignored once started | Press tone; Home appears | Ends onboarding for good | Nothing to undo; the same content is not gated anywhere |
| Finish | Tap main button on Chat | Same as Skip | Press scale; Home appears | Ends onboarding | |
| Back | Header button or Android Back | Chat → Find → Language; Language → leave app | Pages slide back | | |

Pressed, disabled and focus: the main button is never disabled. There is no validation, permission, optimistic or retry state on these screens.

## Motion and reduced motion

Transform and opacity only, on the UI thread, with tokens from `apps/mobile/lib/motion.ts`.

| Element | Motion |
|---|---|
| Language → value-prop, and back | The group's existing `fade` stack animation. |
| Pages | Native paging scroll for swipes. Next and Back call `scrollTo({ animated: true })`. |
| Dots | Each dot's width (6↔24) and opacity (0.4↔1) interpolate from the scroll offset, so they move with the finger rather than after it. |
| Entrance | When Language and Find open: the app's `Enter` (opacity 0→1 and an 8 dp rise, `duration.base`, `easing.enter`) on the panel, with Find's title and body one step later. Chat has no entrance of its own: it slides in with the pager, and a fade after the slide would land late on a swipe. |
| Language picture | On choosing a language the three files cross-fade, `duration.fast` (150 ms). |
| Main button label (Next → Browse listings) | The text swaps with the page; the button does not resize. No cross-fade in this version. |
| Entering and leaving | The group opens above Home with no animation, under the root launch entrance, whose first layout releases native. Once open, the group's animation is set to `fade`, so `router.dismissTo` fades to Home. |

No looping animation, no autoplay between pages, no delay before a control works.

**Reduce Motion on** (`useReduceMotion()`): no entrance offset or fade, pictures and labels switch instantly, Next and Back use `scrollTo({ animated: false })`, dots jump. Swiping still pages, because that is direct manipulation.

## Large text, small windows

- Text scales with the system font setting. The main button and Skip labels stop growing at 1.3 (`maxFontSizeMultiplier`), so the 56 dp button never clips its label; language rows use `min-h` and grow with their label.
- When the usable height is under 520 dp or the font scale is 1.3 or more, the illustration panel is dropped and the title and body take its room in their vertical `ScrollView` between the fixed top bar and the fixed footer. Below that threshold the same scroll view only scrolls if the text no longer fits above the footer. The preview's "font scale 1.3" frame shows this. Words over pictures when both cannot fit.
- On Language at the same threshold, the panel is dropped and the title, subtitle and rows scroll together; the Continue button stays pinned.
- Skip is never truncated: at large sizes it may take the full bar width beside the Back button.

## Accessibility

- **Contrast.** Title `#171717` on `#F3F3F1` 16:1, `#FAFAF9` on `#0F0F10` 18:1. Body `#666666` on `#F3F3F1` 5.2:1, `#A5A5AC` on `#0F0F10` 7.8:1. Button: white on `#E60000` 4.8:1. In dark the button is `hsl(0 90% 52%)` (about `#F31616`), where white is 4.3:1 at 16 dp semibold, under the 4.5:1 line; this is the existing `brand` button, not new here, and is listed under findings. Illustration red on the dark panel is 3.6:1; the pictures carry no information that the text does not.
- **Targets.** Rows 56 high, full width. Main button 56. Back 44 with `hitSlop` 2 to reach 48 on Android. Skip `min-h-12` (48) and at least 48 wide.
- **Roles and labels.** Rows: `radiogroup` labelled with the localized "Language" (today `LocaleSwitcher` hard-codes the English word), each row `radio` with `checked`, label the language's own name. Title: `accessibilityRole="header"`. Pager: the two dots are one element with a plain text label, "Page 2 of 2"; it is not a progress bar and not adjustable. Illustrations and the panel: `accessible={false}` and hidden from the tree, since the title says the same thing.
- **Order.** Language: wordmark (label "AutoTM"), title, subtitle, rows, Continue. Slides: Back, Skip, title, body, page label, main button. Pages that are off screen are hidden from the accessibility tree (`importantForAccessibility="no-hide-descendants"`, `accessibilityElementsHidden`).
- **Announcements.** After a page change by button, an effect on the page index moves focus to the new title, so the request fires only after the new page is unhidden from the accessibility tree. After choosing a language, announce the language's own name.
- **Not colour alone.** The chosen row has a check and heavier label, not just red. The current dot is longer, not just brighter.
- **Screen reader swipe.** With TalkBack or VoiceOver on, two-finger swipe pages; Next and Back are always available as buttons, so the pager never needs a gesture.
- **Verification.** TalkBack on Android and VoiceOver on iOS through the whole flow in each language; font scale 1.3 and 2.0; Reduce Motion; light and dark; 360 × 640 with 3-button navigation.

## Trilingual copy and i18n keys

The founder approved these strings on 2026-10-08, with Russian "машина". The Turkmen and Russian strings still want a native reader; the ones to check are listed below the table. Namespace `onboarding` unless a namespace is given.

| Key | EN | RU | TK |
|---|---|---|---|
| `chooseLanguage` (exists) | Choose language | Выберите язык | Dil saýlaň |
| `languageSubtitle` (exists) | You can change the language later in Cabinet | Вы можете изменить язык позже в Кабинете | Soňrak Kabinetde üýtgedip bilersiňiz |
| `common:continue` (exists) | Continue | Продолжить | Dowam et |
| `common:next` (exists) | Next | Далее | Indiki |
| `common:skip` (exists) | Skip | Пропустить | Geç |
| `common:back` (exists, Back button label) | Back | Назад | Yza |
| `findTitle` (new) | Find a car by make and model | Найдите машину по марке и модели | Awtoulagy marka we model boýunça tapyň |
| `findBody` (new) | Browse listings and narrow them by price, year and city. You don't need an account to look. | Смотрите объявления и уточняйте поиск по цене, году и городу. Аккаунт для просмотра не нужен. | Bildirişlere serediň, baha, ýyl we şäher boýunça süzüň. Görmek üçin akkaunt gerek däl. |
| `chatTitle` (new) | Write to the seller directly | Пишите продавцу напрямую | Satyja göni ýazyň |
| `chatBody` (new) | Ask about the car in the in-app chat. You sign in only when you decide to write. | Задавайте вопросы о машине в чате приложения. Войти нужно, только когда решите написать. | Awtoulag barada soraglaryňyzy programmadaky çatda beriň. Diňe ýazmak isläniňizde girmeli bolar. |
| `finish` (new; on Chat; same wording as the existing `browseListings`) | Browse listings | Смотреть объявления | Bildirişlere seret |
| `pageOf` (new, screen reader only) | Page {{current}} of {{total}} | Страница {{current}} из {{total}} | Sahypa {{current}} / {{total}} |
| `languageGroup` (new, screen reader only) | Language | Язык | Dil |

Language names are not translated: `Türkmençe`, `Русский`, `English`, from `localeNames` in `resources.ts`, in that order.

Strings a native reader should check:

- TK `findTitle` "Awtoulagy marka we model boýunça tapyň": the longest title (two lines at 360 dp). "Awtoulag" follows the Sell flow's wording; the old onboarding said "awtomobil".
- TK `findBody` "Bildirişlere serediň, baha, ýyl we şäher boýunça süzüň. Görmek üçin akkaunt gerek däl."
- TK `chatTitle` "Satyja göni ýazyň".
- TK `chatBody` "Awtoulag barada soraglaryňyzy programmadaky çatda beriň. Diňe ýazmak isläniňizde girmeli bolar.": "girmeli bolar" is a construction for "you need to sign in"; the app uses "giriň" for "sign in".
- TK `finish` "Bildirişlere seret", `pageOf` "Sahypa 1 / 2", `languageGroup` "Dil".
- TK `common:next` "Indiki" already existed and reads as "the next one"; "Dowam et" may be the more natural button. Not changed here.
- RU `findTitle` "Найдите машину по марке и модели", `findBody`, `chatTitle` "Пишите продавцу напрямую", `chatBody` "Задавайте вопросы о машине в чате приложения. Войти нужно, только когда решите написать.", `finish`, `pageOf` "Страница 1 из 2", `languageGroup` "Язык". "Машина" is the founder's choice; the Sell flow says "автомобиль".

Every claim maps to something the app does now: anonymous browsing and Brand/model search with price, year and city filters (ADR-0051, `resultsRemove_city/price/year`); in-app Conversations with sign-in asked at the action.

Deleted with this change, in all three languages: `valueProp1Title` … `valueProp3Body` and `getStarted`. They held the claims about VIN history, inspections, verified sellers and safety. `src/i18n/resources.spec.ts` fails if such a claim, or a "free" claim, returns to the onboarding namespace.

Long text: the longest strings are TK `findTitle` (two lines) and RU `chatBody` (three lines at 360 dp). The layout allows three title lines and four body lines before the panel starts to shrink. No numbers, dates, currency or phone numbers appear.

## UX scores and severity findings

| Dimension | Score | Why not 10 |
|---|---|---|
| Heuristic usability | 9 | The two pages are still a detour before content; a person who wants to browse must tap Skip or three buttons. Reaching 10 would mean showing these messages inside Home instead (see alternatives). |
| Discoverability and error tolerance | 9 | Skip, Back and the page position are all visible. Nothing here can be done wrong. One point off because a skipped onboarding cannot be seen again. |
| Microinteraction quality | 8 | Language switching live with the picture following is good feedback. Not yet verified on a device: dot tracking smoothness on low-end Android, haptic feel. |

| # | Finding | Severity (0–4) | Resolution |
|---|---|---|---|
| 1 | Old copy claims features that do not exist | 3 | Resolved by the new copy |
| 2 | Onboarding was not reachable on a fresh install | 3 for this redesign's value | Resolved by the launch gate below |
| 3 | Skip beside the system navigation bar | 2 | Resolved: moved to the top bar |
| 4 | White splash in a dark app | 2 | Resolved in this spec |
| 5 | White on the dark-mode brand red is 4.3:1 at 16 dp | 1 | Existing `brand` button, app-wide; out of scope here, worth its own change |
| 6 | Language artwork at 360 × 640 is small (about 110 dp high) | 1 | Accepted; the rows are the content on that screen |
| 7 | Three slides against ADR-0034's "1–2" | 1 | Resolved: the founder removed the Sell page, leaving two |
| 8 | The Language screen opens in Russian on any device, because the app does not read the device language | 2 | Open; not caused by this change. See Open decisions |

No open severity 3–4 finding.

## Implementation notes

- Files: `app/_layout.tsx`, `app/(onboarding)/{_layout,language,value-prop}.tsx`, `components/onboarding/{IllustrationPanel,LanguageRows,PagerDots,useOnboardingLayout}`, `src/onboarding/{onboardingFlag,onboardingGate,OnboardingLaunch}`, `src/i18n/resources.ts`, `assets/onboarding/*.svg`. `app/(onboarding)/index.tsx` is removed.
- Specs: `src/onboarding/onboardingGate.spec.ts` (who sees onboarding, including a rejected session read answering skip), `src/onboarding/onboardingFlag.spec.ts`, `test/routes/onboarding-back.spec.tsx` (launch, deep link, a stored session across mount and remount, OnboardingLaunch's push and layout-owned splash release), `test/routes/onboarding-flow.spec.tsx` (pager, Skip, final button, language, accessibility focus, three languages, large text), `test/routes/onboarding-guard.spec.tsx` (onboarding routes redirect to the tabs once completed or signed in), `test/routes/onboarding-padding.spec.tsx`, `test/routes/otp-restore.spec.tsx` (signing in stores the completed flag at once), `src/i18n/resources.spec.ts` (key parity and banned claims).
- The pager is one route with the page index in component state; Android Back is handled with `BackHandler` while the screen is focused.
- Both screens cap their content column with the shared `ONBOARDING_MAX_WIDTH_CLASS` literal, kept in step with `ONBOARDING_MAX_WIDTH` in `useOnboardingLayout`.
- The onboarding group's layout re-checks the flag and the session when it mounts and redirects a completed or signed-in launch to the tabs, so a link into the group cannot dead-end on Android Back.
- `useOnboardingLayout` reads `useWindowDimensions` and the safe-area insets for the page width and for the 520 dp, 480 dp and font-scale 1.3 thresholds.
- **Not yet checked on a device.** The layout was checked in the browser mockup and the behaviour in component specs. Still owed, in light and dark on Android and iOS: the launch (Language must appear without Home showing first), the fade to Home, dot tracking, the row haptic, TalkBack and VoiceOver, font scale 1.3 and 2.0, 360 × 640 with 3-button navigation, and the pictures as drawn by `react-native-svg`.
- `apps/mobile/.expo/types/router.d.ts` is generated by Expo and still lists the removed `/(onboarding)` index; the next `expo start` rewrites it.

### The gate (how a fresh install reaches onboarding)

PR 760 removed the old gate for two reasons that this one respects: the storage read must not strand a launch, and `(tabs)` must stay the Back anchor so onboarding is never underneath Home.

- The root still mounts `(tabs)` first (`initialRouteName: "(tabs)"`).
- `resolveOnboardingGate` starts first in the root layout's launch effect, beside fonts and i18n, and answers `show` or `skip` within 1 s. The native launch screen is already held for fonts and i18n, so the gate normally adds no wait.
- The flag has three states. Nothing stored: the gate decides. `pending`: this install is owed onboarding. `true`: done, skipped, or never owed.
- With nothing stored, a session or any other stored app data means the person already used the app: the gate writes `true` and answers `skip`. Otherwise it writes `pending` and answers `show`. `pending` is what keeps onboarding owed after the first launch, when a chosen language is already in storage.
- On `show`, and only when the launch opened Home (path `/`, so not a deep link), `OnboardingLaunch` pushes `/(onboarding)/language` above the tabs. `LaunchEntrance` owns native release on its first layout and the presentation exit independently of this push. Language never releases native; a failed push still reaches Home under the entrance.
- Signing in settles onboarding at once: the OTP screen stores `completed` when it stores the session (including an account restore), so an established user never owes onboarding between signing in and the next gate run.
- A session the gate cannot read is not "no session": like every other storage failure it answers `skip` without storing anything, so a broken keychain never looks like a fresh install.
- Skip and the final button write `true` and call `router.dismissTo(HOME_HREF)`, which pops back to the tabs already underneath. After that the root stack is the tabs alone.

Defect 6 of the [release emulator pass](../../../evidence/release-emulator-pass/report.md) (Back after publishing a Listing landed on onboarding) came from onboarding being the first route, under everything else. Here it is only ever above Home, it is popped when it ends, and no route in the group answers `/` any more. `test/routes/onboarding-flow.spec.tsx` presses Skip and the final button on the production screens and expects `router.dismissTo(HOME_HREF)`, and the root's `initialRouteName` keeps the tabs the Back anchor for deep links.

## Alternatives considered

- **No slides: language choice, then Home with first-run hints in place.** The least interruption and the most honest about value (the Listings are the value). Rejected for this proposal because the founder asked for an illustrated onboarding; worth revisiting if Skip rates are high.
- **One slide with bullet points.** Faster, but gives each message a third of the attention and leaves room for one small picture only.
- **Language as page 1 of the same pager.** Removes one transition, but a language change re-renders every page mid-swipe and Skip on a language choice makes no sense.
- **Full-bleed brand-red first screen, like the references' splash.** Strong, but it is their look, and red is kept for actions in AutoTM.

## Founder decisions

Decided on 2026-10-08; they override anything above that still disagrees.

1. Approved as designed, except that the "Sell your car for free" page is removed. The flow is Language → Find → Chat, with two dots, Skip on Find only and the final button on Chat. The Sell illustration and strings are deleted.
2. People already using the app skip onboarding after the update; a fresh install sees it once. The gate is the one proposed here: the tabs stay the Back anchor and slow storage never holds Home for more than about a second. The founder named "a stored language or session" as the sign of an existing user. The app stores a language only when the person picks one, so the gate also counts any other stored app data (a chosen theme, a recent search, the notification prompt); see the page-state matrix.
3. Russian uses "машина" in onboarding. The Turkmen strings stay as proposed, pending a native reader.
4. The old onboarding copy that claimed VIN history, inspections or verified sellers is removed from all three languages.
5. [75](../75-illustration-style.md) allows these larger tonal onboarding illustrations.

## Open decisions (must be empty or explicitly deferred)

Deferred; neither blocks this change:

1. **Native review** of the Turkmen and Russian strings listed above.
2. **Device language on first launch.** The Language screen opens in Russian on every device, because the app resolves a missing stored language to Russian before it could read the device's. Reading the device language would also switch the app's language for people who never chose one, so it needs its own decision.

## Accepted limits

Accepted in the PR 774 review-fix round on 2026-10-09; these behaviours are deliberate and are not scheduled to change:

- **Any stored AsyncStorage key counts as an existing user.** After an update the gate skips onboarding for anyone with any app data stored — a chosen theme, a recent search, the notification prompt — not only a chosen language or a session, and writes the flag silently.
- **If the `pending` write fails, onboarding may not be finished on the next start.** The flag stays unset, so a later launch can treat the install as fresh and show onboarding once more; every finish path (Skip, the final button, signing in) re-stores `completed`.
- **A late `pending` write after a gate timeout may show onboarding to a guest on the next cold start.** When storage is slow, the gate opens Home without waiting; if the flag read or write lands after that decision it can still record `pending`, which the next cold start honours.
