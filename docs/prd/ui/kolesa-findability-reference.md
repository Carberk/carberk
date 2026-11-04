# Kolesa.kz findability reference (the "Line")

> **Superseded for Home, search, filters, Results, Listing cards, and Listing detail (2026-09-21).** [ADR-0051](../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md) made Auto.ru the structural reference for the mobile discovery journey. For Home, the brand and model pickers, Search, Results, Sort, Search parameters, and Listing cards and detail, follow [33 — Search & discovery](../features/33-search-discovery.md) and [32 — Listings](../features/32-listings.md). Auto.ru and Kolesa captures are indexed in [the reference screens index](research/reference-screens-2026-09-21.md). Do not apply §5 (Home / cars browse), §5a (Listing card), §6 (filter funnel), §6a (Make/Model drill-in), §7 (Sort), §8 (Listing detail), the card layout in §11 (Favorites), the Home and cars-browse rows in §2–§3, or §14 decision 3 and the browse-route part of decision 7; they are kept as history. The rest of this guide applies only to other mobile screens that have no approved spec.

> **Superseded for Cabinet, Profile and Settings (2026-10-02).** The founder's screen map amendment ([#344](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/344#issuecomment-5947347989)) supersedes §12 for those screens: Cabinet is a plain menu with no gear and no Settings screen, and no "Post" CTA; Language and Theme are on Cabinet; Log out and Delete account are at the bottom of Profile. Follow [20 — Information architecture](../20-information-architecture.md#tab-5--cabinet-menu) and [30 — Identity](../features/30-identity.md#profile-screens). §12 and the Settings rows in §2 and §3 are kept as history.

> **Read this before building or polishing any mobile screen that has no approved spec.** It is the agent-facing companion to [ADR-0034](../../adr/0034-kolesa-ux-findability-reference.md): Kolesa.kz is AutoTM's reference for **UX / information architecture / findability** — *not* its visual design.
>
> **Scope boundary (do not cross):**
> - ✅ **Mirror:** category/taxonomy structure, the search→filter funnel, content hierarchy, "where each thing lives," section placement, progressive disclosure.
> - 🚫 **Do NOT mirror:** Kolesa's visual language (colors, type, components). AutoTM keeps its own Uber-style system — [`packages/ui/tokens/`](../../../packages/ui), [GRILL-OUTCOME §12](../../../GRILL-OUTCOME.md), [`ui/70-design-principles.md`](70-design-principles.md). Never import Kolesa's *look*.
> - 🚫 **Do NOT import Kolesa's feature breadth.** Everything is bounded by the locked 5-tab IA ([20-information-architecture](../20-information-architecture.md)), the [00-vision anti-goals](../00-vision.md#anti-goals-things-we-explicitly-will-not-build), and MLP scope ([ADR-0027](../../adr/0027-mlp-beta-scope.md)). The keep/defer map below is the bound.

**Source:** `scrn.gallery/app/kolesa` — **59 flows / 248 screens (May 2026)** — plus local screen captures held by the founder. Findings are embedded below so this doc is self-contained.

---

## 1. Why Kolesa

Kolesa.kz is the dominant car marketplace in Kazakhstan — a market structurally close to Turkmenistan (post-Soviet buyer behavior, "listings scattered across Telegram" starting point, RU-language overlap). Its findability is proven at scale. We adopt *how it organizes and surfaces things*, scaled down to one vertical (cars), MLP scope, and our anti-goals.

**The single most useful realization:** Kolesa's bottom-tab model is **already identical to AutoTM's** — Home · Favorites · Post(+) · Messages · Cabinet/Profile. So this is not a navigation rebuild. It's a *findability polish* of screens inside an IA you already shipped.

---

## 2. Kolesa's full flow inventory (scraped)

Tree with screen counts. **Legend:** ✅ keep (already built — Kolesa = polish ref) · ⏳ defer (post-MLP/Phase 2) · 🚫 N-A (out of scope / arch diverges).

```
Онбординг / Onboarding (7)                              ⏳ minimal version (see §13)
Онбординг после регистрации (10)                        🚫 (anonymous-default; no heavy post-reg)

Главный экран / Home (4)                                ✅ cars browse + dedicated filter (§5)
├─ Просмотр новостей / News (4)                         ⏳ post-MLP (blog/Bortzhurnal)
├─ Просмотр промо-контента / Promo (6)                  ⏳ post-MLP (ad-sales bet)
├─ Просмотр автомобилей / View cars (4)                 ✅ your feed (§5)
│  ├─ Фильтр / Filter (12)                              ✅ adopt funnel order + live count (§6)
│  │  ├─ Сортировка / Sort (3)                          ✅ adopt options (§7)
│  │  └─ Подписка на поиск / Search subscription (3)    ⏳ post-MLP (saved search, ADR-0027)
│  │     └─ Отписка / Unsubscribe (4)                   ⏳ post-MLP
│  └─ Просмотр карточки / Listing detail (7)            ✅ adopt content hierarchy (§8)
│     ├─ История автомобиля / Car history example (8)   ⏳ Phase 2 (reports/tier)
│     ├─ Просмотр отзывов / Reviews (4)                 ⏳ post-MLP content bet (owner/model reviews)
│     │  └─ Оставление отзыва / Leave review (16)       ⏳ post-MLP content bet
│     ├─ Написать продавцу / Write to seller (4)        ✅ your S6 contact/chat (§10)
│     └─ Позвонить продавцу / Call seller (3)           ✅ your Call CTA
├─ Просмотр автокредитов / Car loans (3)                🚫 anti-goal-adjacent; monetization
│  └─ Фильтрация (5) → Подписка (4) → Отмена (3)        🚫
├─ Просмотр мототехники / Moto (4)                      🚫 other vertical
│  └─ Просмотр мотоциклов (4) → Фильтрация (4)          🚫
├─ Просмотр запчастей / Parts (6)                       🚫 other vertical
│  └─ Фильтрация (4) → Сортировка (3)                   🚫
├─ Просмотр новых моделей / New-car catalog (3)         🚫 you're used-car classifieds
│  └─ Фильтрация (4)                                    🚫
├─ Просмотр услуг / Services catalog (4)                🚫 other vertical (≠ your Profile tab)
│  └─ Фильтрация (6) → Сортировка (3)                   🚫
├─ Проверка истории автомобиля / Car-history check (4)  ⏳ Phase 2 (reports/tier)
└─ Просмотр рекламных объявлений / Ads (2)              ⏳ post-MLP (ad-sales bet)

Избранное / Favorites (6)                               ✅ S8a #193 (§11)

Профиль / Profile · Cabinet (3)                         ✅ "Cabinet" model (§12)
├─ Регистрация / Registration (14)                      🚫 OTP-only, no passwords
├─ Вход / Login (5)                                     🚫 → your phone-OTP login
├─ Восстановление пароля / Password recovery (15)       🚫 no passwords
├─ Редактирование имени / Edit name (5)                 ✅ profile edit
├─ Изменение номера телефона / Change phone (6)         ⏳ post-MLP account mgmt
├─ Управление подписками / Manage subscriptions (11)    ⏳ post-MLP (saved search + premium)
├─ Пополнение баланса / Top-up balance (4)              🚫 monetization
├─ Настройки / Settings (2)                             ✅ behind gear (§12)
│  ├─ Изменение пароля / Change password (10)           🚫 no passwords
│  ├─ Просмотр контактных номеров / Contacts (2)        🚫
│  ├─ Изменение языка / Change language (3)             ✅ RU/TK/EN (also first-launch, §13)
│  ├─ История платежей / Payment history (4)            🚫 monetization
│  │  └─ Добавление номера документа в чеки (5)         🚫
│  └─ Информация о приложении / App info (2)            ✅ about
│     ├─ Правила размещения / Posting rules (2)         ✅ legal (ops/83-legal)
│     ├─ Пользовательское соглашение / User agmt (2)    ✅ legal
│     ├─ Политики конфиденциальности / Privacy (3)      ✅ legal
│     ├─ Сообщение об ошибке / Report error (5)         ⏳ optional beta feedback
│     ├─ Оценка приложения / Rate app (5)               ⏳ post-MLP
│     ├─ Участие в бета-тестировании / Beta signup (4)  🚫 you run your own beta
│     └─ Удаление профиля / Delete profile (5)          ✅ S8a #197 (ADR-0032)

Сообщения / Messages (3)                                ✅ your S6 chat list (§10)
Подача объявления / Create listing (41)                 ✅ your 8-step wizard (§9)
└─ Снятие с продажи / Remove from sale (5)              ✅ your sold/archive state
```

---

## 3. Keep / defer summary

| Bucket | Flows | Decision |
|---|---|---|
| **Already built** — Kolesa = polish reference | feed, filter, sort, detail, contact/call/chat, messages, wizard, remove-from-sale, favorites, profile/settings/language, delete-profile, legal | Mirror findability; do not rebuild |
| **Other verticals** | moto, motorcycles, **parts**, new-car catalog, **services** (+ future **trucks/commercial**) | 🚫 cars-only for MLP; **parts / services / trucks are future verticals** per [ADR-0035](../../adr/0035-multi-vertical-platform-direction.md), not permanent non-goals |
| **Monetization / wallet** | car loans + loan calculator, balance top-up, payment history, receipts, premium/PLUS, paid promotion (bump) | 🚫 post-MLP business bets; anti-goal bars pay-for-placement |
| **Email+password auth** | registration, login, password recovery, change password, beta-signup | 🚫 you're **phone-OTP only** — biggest "defer the whole subtree" win |
| **Post-MLP bets (ADR-0027)** | saved search / search-subscription, push-subscription, manage subscriptions, news, promo, stories, ads | ⏳ deferred; Kolesa's prominence is not on its own a reason to pull forward |
| **Phase 2 trust** | car-history / VIN check / "add doc to checks", average-price benchmark | ⏳ → reports/tier system |
| **Post-MLP content** | owner/model reviews + leave-review | ⏳ next to blog/Bortzhurnal |

---

## 4–13. Per-surface findability patterns

### 4. Bottom-tab model
Kolesa: **Home · Favorites · Post(+) center · Messages · Cabinet**. AutoTM's 5 tabs map 1:1. **Note the label:** Kolesa's 5th tab is **"Кабинет" (Cabinet/Profile)**, not "Services." Our IA currently labels tab 5 "Сервисы/Services" but it is really a profile/cabinet surface — treat it as **Cabinet/Profile** in copy and IA (see §12). Center **+** is the post-listing CTA (matches your Sell tab).

### 5. Home / cars browse
Kolesa home = **Stories strip → category tiles (verticals) → recommended feed**, and tapping the **Cars** tile opens the cars browse with a dedicated **Фильтр / Filter** button → filter page → results. The tiles are *verticals you don't have yet*.

Because AutoTM is **cars-only for MLP** (one vertical), Kolesa's home-hub collapses — a hub whose only tile is "Cars" is redundant. So **tab 1 ("Search") _is_ Kolesa's cars-browse page**: a feed of recent listings, reached/refined through a **dedicated, prominent Filter entry**. **Not feed chips** — chips don't survive the eventual `hub → category → filter` structure, whereas a vertical-shaped browse + dedicated filter does (see [ADR-0035](../../adr/0035-multi-vertical-platform-direction.md), the multi-vertical direction).

- **Build it as a self-contained _category browse_ surface**, not a hardcoded "home," so a home-hub can slot in front when the second vertical (trucks) lands — no rebuild.
- A **prominent Filter/Search entry** (Kolesa's "Фильтр" button; optionally a search bar on top) opens the dedicated filter page (§6).
- Keep the recent-listings feed as the default body. **No Stories, no promo banner, no vertical tiles** for MLP.
- Card pattern to mirror (see §5a).

### 5a. Listing card (feed + results + favorites all share it)
Order inside the card: **title (Make Model, Year) → price → photo (with photo-count badge) → key-spec line (condition · engine L · fuel · transmission · mileage · city) → date + view count → favorite heart**. Mirror this hierarchy. **Skip** Kolesa's credit badge ("15% первый взнос ×48") and the orange "bump/promoted" marker (monetization).

### 6. Filter funnel (highest-value findability artifact)
Adopt Kolesa's **field order and interactions**:
1. **Состояние / Condition** — segmented control **All · New · Used** at the very top.
2. **Регион / Region (City)** — with clear-X.
3. **Марка, модель / Make, Model** — **drill-in** (see §6a).
4. **Год выпуска / Year** — paired **from–to** range.
5. **Цена / Price** — paired **from–to** range.
6. **"Показать расширенный фильтр" / Show extended filter** — progressive disclosure; keep the core list short, hide advanced fields.
7. Sticky apply button shows a **live result count**: *"Show 49,630 listings"* — adopt this; it is the single best findability cue in the funnel.

**Skip:** "Доступны в кредит" (credit toggle), "Ниже средней цены / below-average PLUS" (premium), "История авто" filter (Phase 2), and the "Подписаться на поиск / subscribe to search" toggle (post-MLP saved search).

### 6a. Make/Model drill-in
Mirror: a search box ("Search by model") → **"Популярные модели / Popular models"** surfaced first → **"Все модели / All models"** grouped (by series) → **multi-select** checkboxes → sticky **"Select N models"** confirm. The *Popular-first* shortcut is the key pattern. (Brand picker is the analogous screen one level up: popular brands grid + A–Z + search.)

### 7. Sort
Results header carries a **sort control (↕)** next to **Filter** (Filter shows an active-filter count badge). Adopt the same placement. Sort options to keep: **newest, price ↑, price ↓** (and your shipped chronological default). Skip Kolesa's "by relevance/promoted" weighting (no paid ranking — anti-goal).

### 8. Listing detail — content hierarchy
Kolesa order: **photo gallery (count badge) → title + year → price → [History-report CTA] → [loan calculator] → spec grid (city · generation · body · engine · drive · mileage …) → seller block → similar listings → report-listing → views/date**, with a **sticky Write / Call bar** at the bottom.

For AutoTM, mirror the hierarchy with these substitutions:
- ✅ gallery → title → price → **spec grid** → seller block → similar → **report** → views/date.
- ✅ **Sticky Message / Call bar** (your S6 contact) — keep persistent at bottom.
- ⏳ Replace the **car-history CTA** slot with your Phase 2 reports/tier entry (hidden until Phase 2).
- 🚫 Remove the **loan calculator** and the **"average price on Kolesa"** benchmark (monetization / data feature).
- ⏳ "Reviews of this model" link → post-MLP content bet (hidden for MLP).

### 9. Create-listing wizard
Kolesa's posting flow is **41 screens** with deep equipment capture (interior material, exterior, AC, media, optics — collapsible groups of multi-select chips), a **progress bar**, and **"Save & close" (draft)**. AutoTM ships a **lean 8-step wizard** (VIN/photos/specs/price/location/contact + Review) with drafts/autosave — see [`apps/mobile/src/listings/CONTEXT.md`](../../../apps/mobile/src/listings/CONTEXT.md). **Do not expand to Kolesa's depth for MLP.** Carry forward only: the **progress bar**, **save-as-draft / "save & close"**, and **collapsible grouped multi-select** as a *post-MLP* pattern if/when granular equipment is added. Equipment taxonomy itself stays out of MLP scope.

### 10. Messages / Chat
Kolesa: a **Messages tab** (thread list) and a per-listing **Write to seller** thread reachable from detail. AutoTM's S6 text contact evolved in shipped S10 into rich realtime chat: text, image and listing-reference messages; delivery/read state; typing/presence; quick replies; mute/block/delete/report safety; and a direct-message push path. Keep thread-list ordering by latest message and use Kolesa only as an IA/findability comparison; the current AutoTM behavior is recorded in `apps/mobile/CONTEXT.md` and the S10 retrospective.

### 11. Favorites
Same **listing-card** layout (§5a) in a saved list, with an explicit empty state ("Tap ♥ on listings you like"). Shipped in S8a (#193). Skip Kolesa's saved-**search** subscriptions here (post-MLP) — Favorites = saved *listings* only for MLP.

### 12. Cabinet / Profile + Settings
Kolesa **"Мой кабинет"** aggregates, top→bottom: **name → phone (→ edit) → [PLUS banner] → [Car-history] → [Account/balance] → "Мои объявления / My ads" → "Подать объявление / Post" CTA**, with a **gear → Settings** in the top-right.

AutoTM Cabinet/Profile (tab 5) should mirror the *aggregation pattern*, substituting:
- ✅ **name → phone (→ change phone, post-MLP) → My listings → Post CTA**, gear → Settings.
- 🚫 Remove PLUS, balance/account, top-up (monetization).
- ⏳ Car-history row hidden until Phase 2.
- **Settings** behind the gear contains: **Language (RU/TK/EN)**, theme (light/dark/system), **About** (→ legal: user agreement, privacy, posting rules — [`ops/83-legal.md`](../ops/83-legal.md)), **Delete profile** (S8a #197, [ADR-0032](../../adr/0032-account-deletion-grace-period.md)). Skip change-password (no passwords), payment history, contacts.

### 13. Onboarding (minimal — locked decision)
Kolesa: splash (kolesa group) → **first-launch language picker** → value-prop/permission slides. AutoTM minimal version:
1. Splash.
2. **First-launch language picker (RU / TK / EN)** — genuinely useful for a trilingual app; sets `localeStore` ([ADR-0031](../../adr/0031-mobile-i18n.md)) before anything else renders.
3. **1–2 skippable value-prop slides** ("find real cars," "contact sellers safely").
4. → **anonymous feed** (honor "no login wall on browse," [00-vision](../00-vision.md) principle 1).
Skip the 10-screen post-registration onboarding entirely (anonymous-default).

---

## 14. Locked decisions (2026-06-10/11 grilling session)

| # | Decision |
|---|---|
| 1 | Reference design auto.ru → **Kolesa**, **UX/IA/findability only** (not visual) — [ADR-0034](../../adr/0034-kolesa-ux-findability-reference.md) |
| 2 | Rollout **forward + opportunistic** — new screens to the bar; shipped screens only when next touched |
| 3 | Home/browse = **cars browse + a dedicated, prominent filter page** (not feed chips), built as a vertical-shaped category surface (§5; [ADR-0035](../../adr/0035-multi-vertical-platform-direction.md)) |
| 4 | Owner/model **reviews deferred** to post-MLP content bet |
| 5 | **Minimal onboarding** — first-launch language picker + 1–2 slides (§13) |
| 6 | Defer/N-A: other verticals · monetization+loans · email+password auth · saved-search+push · news/promo/stories/ads · car-history→Phase 2 |
| 7 | **Multi-vertical direction** (2026-06-11) — cars is the MLP wedge of a vehicle+parts+services platform; cars-only now + anti-lock-in seams; target IA = Kolesa hub→category→filter ([ADR-0035](../../adr/0035-multi-vertical-platform-direction.md)) |

## 15. Maintenance

- This doc is **mutable** (UX guidance, not an immutable decision). The *decision* is fixed in [ADR-0034](../../adr/0034-kolesa-ux-findability-reference.md); revise this doc as surfaces ship or as new Kolesa flows become relevant.
- If a post-MLP bet (saved search, reviews, reports) is pulled forward, update its section here and add/extend the owning feature PRD — do not silently widen MLP scope.
- Pair with [`20-information-architecture.md`](../20-information-architecture.md) (route/screen map) and [`ui/79-web-vs-mobile.md`](79-web-vs-mobile.md).
