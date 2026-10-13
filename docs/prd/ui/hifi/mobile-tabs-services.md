# Hi-Fi — Mobile Cabinet Tab

> Maps to: `apps/mobile/app/(tabs)/services.tsx` (Tab 5; the route keeps its `services` name)
> Derived from wireframe: `docs/prd/ui/wireframes/mobile-tabs-services.md`
> Governed by: [20 — Information architecture, Tab 5 — Cabinet menu](../../20-information-architecture.md#tab-5--cabinet-menu), the founder's [screen map amendment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/344#issuecomment-5947347989) and the [#353 decisions](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353#issuecomment-5946561929). This page describes what the app does on `main`. Notifications comes before My listings, as in the information architecture since #665.
> History: this page first specified a "Services" list with Profile, Settings, Bortzhurnal and Help & Support rows (#124, design archive `app-shell.html`). The 2026-10-02 amendment removed the Settings screen; that design is retired and not kept here.

==============================================
HIGH-FIDELITY DESIGN — Mobile Cabinet Tab
Platform: mobile
Mode: light + dark
==============================================

## Purpose

Cabinet is a plain menu in Auto.ru's manner. Rows never block on the network: the profile row swaps to a skeleton while `/me` loads, and the My listings total appears when its count arrives; every row is visible and usable the whole time. There is no Settings screen, no gear and no "List a car" row.

## Layout

```text
┌────────────────────────────────────────────┐
│ safe-top                                   │
│ Cabinet                                    │  large title on the page tone
│                                            │
│  ╭──────────────────────────────────────╮  │  raised card, radius 24
│  │ (A)  Display Name                 >  │  │  large row, 80 pt; avatar 48 pt
│  │      +993 6X XX-XX-42                │  │  masked Sign-in Method
│  ╰──────────────────────────────────────╯  │
│                 24 pt of page              │
│  ╭──────────────────────────────────────╮  │
│  │ (◦)  Notifications                >  │  │  signed in only
│  │      ─────────────────────────────── │  │  inset hairline
│  │ (◦)  My listings                5 >  │  │  signed in only; total of
│  ╰──────────────────────────────────────╯  │  Listings + drafts, no 0
│                                            │
│  ╭──────────────────────────────────────╮  │
│  │ (◦)  Language           English   >  │  │
│  │      ─────────────────────────────── │  │
│  │ (◦)  Theme               System   >  │  │
│  ╰──────────────────────────────────────╯  │
│                                            │
│  ╭──────────────────────────────────────╮  │
│  │ (◦)  Help                         >  │  │  opens an app screen
│  │ (◦)  Terms of Service             ↗  │  │  opens the web page
│  │ (◦)  Privacy Policy               ↗  │  │
│  │ (◦)  Posting rules                ↗  │  │
│  │ (◦)  About the app                >  │  │
│  ╰──────────────────────────────────────╯  │  (hairlines between each row)
│        clear of the floating tab bar       │
└────────────────────────────────────────────┘
```

Groups are raised cards on the page tone, 16 pt from the screen edges and separated by 24 pt of page; there are no lines across the page. Inside a card, rows are separated by hairlines inset to where the label starts. The groups carry no section labels: each card's rows name it, and Cabinet has no copy for such labels.

Signed out, the large row reads "Sign in" / "By phone or email" with a neutral person avatar (a `User` icon, never a car), and the Notifications and My listings group is absent.

Signed in, the large row is the profile row: a 48 pt `UserAvatar` — the User's profile photo, or their Assigned Avatar (`avatarIndex`) on a tinted circle, so the circle is never empty — then the Display Name on one line (the name the User set, or their Generated Name, "Водитель 4821" / "Sürüji 4821" / "Driver 4821" in the reader's language; a name wider than the row ends in "…", `numberOfLines={1}`), then the masked Sign-in Method. The row opens Profile.

The My listings value is the total of the User's Listings and drafts. Before the first count arrives, after a failed request, and when it is zero, the row shows no number; a refresh keeps the last number until the next one arrives (#665). The row opens My listings either way and refreshes the count when Cabinet regains focus.

## Token map

### Backgrounds + surfaces
- Root: `bg-background` (the page tone)
- Group: `MenuGroup`, `mx-4 overflow-hidden rounded-2xl bg-card` (radius 24); groups are spaced `gap-6` in the scroll content
- Row press feedback: `active:bg-secondary`, clipped to the card's corners
- Icon disc: `size-9 rounded-full bg-secondary`

### Borders + dividers
- Row divider: `MenuDivider`, `h-px bg-border`, inset `ml-16` to the label after the icon disc; only inside a card

### Typography
- Screen title: `LargeTitle`, `font-heading text-display font-bold text-foreground`
- Row label: `text-body text-foreground`
- Large-row label: `font-heading text-subhead font-semibold text-foreground`, one line on the profile row
- Large-row second line: `text-footnote text-muted-foreground` with tabular figures, one line
- Row value (Language, Theme, My listings total): `text-body text-muted-foreground` with tabular figures

### Spacing
- Row: `flex-row items-center gap-3 px-4 py-2`; `min-h-14` (56 pt), large row `min-h-20 py-3` (80 pt)
- Scroll content: `gap-6 pt-1`, bottom padding the tab bar's height plus 16 pt, so the last card scrolls clear of the floating bar

### Icons
- Row icon: Lucide `size-5 text-foreground` on the `bg-secondary` disc, one tone for every row — `Bell` (Notifications), `List` (My listings), `Globe` (Language), `Contrast` (Theme), `CircleHelp` (Help), `ShieldCheck` (Terms of Service), `FileText` (Privacy Policy), `ScrollText` (Posting rules), `Info` (About the app)
- Large row signed in: `UserAvatar` at 48 pt — the profile photo, or the assigned car mark on a tinted circle (`apps/mobile/components/identity/UserAvatar.tsx`)
- Large row signed out or failed: neutral person `Avatar` `size-12` with a `User` icon; never a car
- Trailing mark, `size-4 text-muted-foreground`: `ChevronRight` on every row that opens a screen or a sheet inside the app (the large row, Notifications, My listings, Language, Theme, Help, About the app); `ArrowUpRight` on the three legal rows, which open the web page outside the app

## Component shape

The screen composes the shared account rows; it adds no new primitive.

| Component | File | Use |
|---|---|---|
| `MenuRow`, `MenuGroup`, `MenuDivider` | `apps/mobile/components/account/MenuRow.tsx` | Every row, raised group card and inset divider; shared with Profile, Notifications and Help |
| `MyListingsRow` | `apps/mobile/components/account/MyListingsRow.tsx` | My listings row with the Listings + drafts total; refetches on focus |
| `UserAvatar` | `apps/mobile/components/identity/UserAvatar.tsx` | The signed-in large-row avatar at 48 pt; Profile reuses it at 72 pt |
| `LanguageRow`, `ThemeRow` | `apps/mobile/components/account/` | Rows with the current value; each opens `OptionPickerSheet`, whose `OptionList` draws one 56 pt row per option with inset hairlines and a checkmark in the text colour on the chosen row, and a tonal circular close button |
| `Avatar`, `Skeleton`, `Button` | `apps/mobile/components/ui/` | Neutral signed-out avatar, the profile row's loading state and its Retry |

## States

### Default
Rows as in the layout for the session state.

### Loading
Only the large row loads, inside its card: a `size-12 rounded-full` skeleton with two rounded text bars (`h-4 w-40`, `h-3 w-28`). Every other row stays visible and usable. The My listings row shows no number until its count arrives.

### Error
Only the large row fails: neutral person avatar, "Something went wrong" in `text-muted-foreground`, and a tonal `secondary` `Button` `size="sm"` `min-h-11` reading Retry, all inside the card. Every other row stays visible and usable. The My listings row shows no number when its count fails.

### Empty
N/A — the menu is static.

### Offline
Rows stay visible; the screens they open handle offline.

## Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Row press | background to `bg-secondary` | instant | — |
| Language and Theme sheets | surface, handle, title and rows slide together; scrim fades alongside | 300 ms enter / 220 ms exit | decelerating enter / accelerating exit |

Reduced Motion uses a 150 ms fade without spatial movement. A rapid reopen reverses the current transition and cancels pending removal.

## Accessibility

- **Tap targets**: rows are at least 56 pt high; the large row 80 pt; Retry 44 pt.
- **Screen reader**: each row is a button whose label reads the label, then the second line, then the value (for example "Language, English"). On the signed-in large row the avatar carries no label of its own — the name beside it is what the screen reader hears.
- **Loading**: the large-row skeleton is one element labelled with `common:loading`.
- **Error**: the failed large row has the `alert` role.
- **Reading order**: title → large row → Notifications → My listings → Language → Theme → Help → Terms of Service → Privacy Policy → Posting rules → About the app.

## Trilingual copy

| Key | RU | TK | EN |
|---|---|---|---|
| `common:cabinet` | Кабинет | Kabinet | Cabinet |
| `common:signIn` | Войти | Giriş | Sign in |
| `account:signInSub` | По телефону или почте | Telefon ýa-da e-poçta bilen | By phone or email |
| `account:notifications` | Уведомления | Habarnamalar | Notifications |
| `account:myListings` | Мои объявления | Bildirişlerim | My listings |
| `account:language` | Язык | Dil | Language |
| `account:theme` | Тема | Tema | Theme |
| `support:help` | Помощь | Kömek | Help |
| `account:termsOfService` | Условия использования | Ulanyş şertleri | Terms of Service |
| `account:privacyPolicy` | Политика конфиденциальности | Gizlinlik syýasaty | Privacy Policy |
| `account:postingRules` | Правила размещения | Ýerleşdirme düzgünleri | Posting rules |
| `support:about` | О приложении | Programma hakda | About the app |

`apps/mobile/src/i18n/resources.ts` is the source for these strings. The Generated Name is not a resource string: its prefix comes from `GENERATED_NAME_PREFIX` in `packages/contracts/src/schemas/identity.ts` (RU "Водитель", TK "Sürüji", EN "Driver") plus the number the server assigned the User (1000–9999).

## Implementation notes

- Signed in, the large row opens Profile; signed out, it opens sign-in with Cabinet as the return route. Profile shows the same avatar at 72 pt with the Display Name under it, also on one line.
- The My listings total counts Listings and drafts together; it is hidden before the first count arrives, after a failed request and when it is zero, and kept through a refresh, and it refreshes when Cabinet regains focus.
- Legal rows open the localized web page for the current language; they do not deep-link into the app.
- Help is the release's only support entry. The code screen links to it only at the daily Sign-in Code limit ([mobile OTP login flow](mobile-otp-login-flow.md)).
- Log out and a finished account deletion land on Cabinet, signed out.
- The screens Cabinet opens share its grouped look: Profile puts the Sign-in methods under a quiet tracked label (`MenuSectionLabel`, `text-footnote font-medium tracking-wide text-muted-foreground`) on one card and Log out with Delete account on another, Delete account in the `destructive` token; Notifications, Help and Delete account set their rows on cards with notes under them aligned to the row text (`MenuFooter`, `px-8`).
