# 03 — Roadmap

> **2026-11-04: sprint plans, research notes and committed evidence were removed from `main`** ([ADR-0108](../adr/0108-small-prs-with-full-send-replace-integration-delivery.md)). Work is now tracked as GitHub issues, one small PR each. The removed files remain in git history before that date. Sprint references below are historical text.

> **The "where are we?" file.** Open this first in every session. It tells you which sprint is current, what shipped before it, and what comes next.
>
> Sister docs:
> - **`GRILL-OUTCOME.md`** — locked original design charter
> - **`02-phases.md`** — current phase scope
> - **This file (`03-roadmap.md`)** — the cross-sprint trajectory + current pointer
>
> [ADR-0027](../adr/0027-mlp-beta-scope.md) narrows the first release to an MLP beta. Deferred features are not abandoned; they return as post-MLP bets after real usage.
>
> **2026-06-11 — trust is the wedge ([ADR-0037](../adr/0037-trust-inspection-competitive-wedge.md)).** Real TM incumbents (TMCARS, ~254K users, already multi-category; Teklip) make a *generic* beta pointless — a tidy clone gives no one a reason to leave them. So **"what's next after S8a" is no longer a generic 10-50 beta — it is the trust pilot.** Inspection/trust is **pulled forward from Phase 2** as the differentiator the incumbents lack; multi-vertical breadth ([ADR-0035](../adr/0035-multi-vertical-platform-direction.md)) is demoted (TMCARS already holds it). Near-term (remote, from China): finish S8a substrate + software trust-signals + an inspection-**demand fake-door**. On the ground in TM: a 5-10-person **free concierge inspection pilot** (`business/inspection-program.md` Phase 0) replaces the generic invites.
>
> Historical sprint labels in shipped or locked artifacts are not canonical after ADR-0027. References such as "S9 admin", "S6 Garage + Dealership", or "S8 notifications" in older sprint docs should be read as historical labels unless this roadmap, a current pending sprint file, or a mutable feature PRD explicitly re-scopes the work. Do not rewrite shipped sprint plans just to rename old labels; update the active sprint/context doc when stale placement affects implementation.

---

## Current sprint

| | |
|---|---|
| **Sprint** | S11 — Railway deployment + store-review readiness |
| **Status** | 🟡 In progress — **Google Play only until 2026-10-12** (see the store-sequencing decision below) |
| **Started** | 2026-07-22 |
| **Phase** | Pre-launch deployment track (ADR-0039) |
| **Plan file** | Parent [#270](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/270); children [#271](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/271)-[#283](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/283) |
| **Sprint doc** | `sprint-11-railway-deployment.md` |
| **Milestone** | M10 — Store-reviewable cloud production |

> **Agents:** update this block at the start of every sprint. Sprint N's first PR sets `Status` to 🟡 in progress; the sprint-closing PR sets the previous sprint to 🟢 shipped and bumps Current to N+1.
>
> **2026-07-05 S8 closure decision:** S8 closes as the shipped S8a remote product-completeness slice; see `sprints/sprint-08-private-beta-polish-s8a-closeout.md`. The former S8b on-site distribution / real-OTP / ops cutover is deferred out of S8 and should be shaped later as a deployment/on-site cutover sprint when TM presence or a trusted helper is available.
>
> **2026-07-13 S10 start decision:** S9a's remote code/issues are complete. S9b remains deferred on-ground concierge-pilot work with no code issues and does not block S10. S10 is now the active remote code sprint with GitHub parent [#231](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/231) and children [#232](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/232)-[#253](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/253).
>
> **2026-07-17 S10 close decision:** S10 shipped through [PR #256](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/256); see the retrospective. There is no pre-shaped S11. The next sprint is chosen through the Phase 2 betting table after beta/pilot learning rather than inferred from the old candidate list.
>
> **2026-07-20 hosting re-sequencing decision ([ADR-0039](../adr/0039-phased-cloud-first-hosting.md)):** AutoTM deploys **cloud-first on Railway** (staging + production) until App Store + Google Play verification passes, then cuts over to the [ADR-0005](../adr/0005-hosting.md) TM air-gapped topology. The TM-presence gate moved — it now gates the cutover, not the first deploy. CI gates ran on the `tm-build-mac` GitHub Actions runner until [ADR-0073](../adr/0073-ci-gates-and-release-bundles-run-on-github-hosted-runners.md) moved them to GitHub-hosted runners on 2026-10-01; Railway owns build + deploy after CI green. Store-era auth runs `SMS_DRIVER=mock` with 3–5 flag-gated reviewer demo accounts (supersedes [ADR-0030](../adr/0030-reviewer-demo-account-otp-bypass.md)'s "exactly one" scoping). Registering `auto.tm` (or best fallback) is a hard gate before the first store-binary submission, making cutover a pure DNS flip. S11 shapes as the Railway deployment sprint.
>
> **2026-07-22 S11 start:** `sprint-11-railway-deployment.md` moved to 🟡. Parent issue [#270](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/270) and children [#271](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/271)-[#283](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/283) created with the approved 13-slice dependency map. No Railway resources, paid accounts, domains, credentials, or store submissions are authorized by this roadmap transition.
>
> **2026-09-16 store-sequencing decision — Google Play first, Apple from 2026-10-12.** ADR-0039 assumed both stores would be approached together. They are not. Apple Developer Program enrolment and account creation begin on **2026-10-12**; until that date the **sole** launch target is Google Play, and work that exists only to satisfy Apple is deferred, not abandoned. This is a sequencing change, not a scope cut: iOS remains in `apps/mobile`, `apps/mobile/app.config.js` still declares both platforms, and `eas.json` still carries iOS-capable profiles. What changes is which of them is on the critical path. The immediate code consequence is [ADR-0047](../adr/0047-fcm-only-push-transport-for-android-first-launch.md) — `PUSH_TRANSPORT=fcm`, without which the production worker cannot boot with Apple credentials absent and no promotion can run at all. S11 still cannot close on this: [#282](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/282) is held by founder decision and [#283](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/283) depends on it. Reversing to `fcm-apns` is an explicit October checklist item, because nothing in the schema detects an FCM-only production worker once iOS ships. Recorded in full in the S11 retro.


> **2026-10-02 Android reviewer release pointer:** [#320](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/320) remains the release closure map. The accepted Android-only gate includes the full approved redesigns and complete app proof; #279 and #282 keep their unmet iOS criteria open. Remaining implementation follows the approved Messages, Cabinet and Sell decisions, with #353 identity work and #354 D12/slices still unresolved. The dated release analysis and complete issue inventory, workflow audit and Claude cloud handoff preserve the evidence under [#535](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/535). They do not amend the locked S11 plan or authorize production/store operations. Public signup, real SMS, TM cutover and iOS submission remain later work.

---

## Release shape

| Phase | Planning mode | Sprints | Headline outcome |
|---|---|---|---|
| **Phase 1 — MLP beta** | Fixed path | S1-S8 | Buyers find real listings, contact sellers, and admins can keep beta safe |
| **Phase 2 — Post-MLP marketplace bets** | Betting table | TBD | Add the missing capabilities beta users demonstrably need |
| **Phase 3 — Trust and premium bets** | Betting table | TBD | Add trust reports, richer media, comparison, and polish when the marketplace loop is active |

Full scope per phase: [`02-phases.md`](02-phases.md). Anti-goals remain in [`00-vision.md`](00-vision.md#anti-goals-things-we-explicitly-will-not-build).

---

## Phase 1 — MLP beta sprint status

| # | Sprint | Status | Started | Shipped | Milestone | Demo audience |
|---|---|---|---|---|---|---|
| S1 | Scaffold | 🟢 Shipped | 2026-05-14 | 2026-05-14 | M1 | Nobody — confirms rails |
| S2 | Identity (OTP) | 🟢 Shipped | 2026-05-14 | 2026-05-16 | M2 | Tiny internal group |
| S3 | Catalog | 🟢 Shipped | 2026-05-17 | 2026-05-17 | — | Internal |
| S4 | Listings CRUD | 🟢 Shipped | 2026-05-17 | 2026-06-06 | M3 | Internal group |
| S5 | Search + listing detail | 🟢 Shipped | 2026-06-06 | 2026-06-06 | M4 | 10-20 beta testers with seeded listings |
| S6 | Contact seller | 🟢 Shipped | 2026-06-06 | 2026-06-07 | M5 | Beta testers with real listings |
| S7 | Minimal admin + moderation | 🟢 Shipped | 2026-06-07 | 2026-06-08 | M6 | Internal admins |
| S8 | Private beta polish | 🟢 Shipped (S8a; S8b deferred to deployment sprint) | 2026-06-09 | 2026-06-27 | M7 | Product-complete beta substrate; actual invites require deployment cutover |
| S9 | Trust wedge | 🟢 Shipped (S9a remote code; S9b deferred on-ground) | 2026-07-07 | 2026-07-13 | M8 | Remote trust foundation shipped; concierge pilot deferred |
| S10 | Rich chat + direct-message notifications + mobile polish | 🟢 Shipped | 2026-07-13 | 2026-07-17 | M9 | Two signed-in mobile users can verify rich realtime chat, direct-message push path, and launch-visible mobile polish |
| S11 | Railway deployment + store-review readiness | 🟡 In progress | 2026-07-22 | — | M10 | Founder/operator can prove reviewer-only cloud production before store submission |

**Legend:** ⚪ Pending · 🟡 In progress · 🟢 Shipped · 🔴 Blocked

> **S9 (Trust wedge) is post-MLP, pulled forward** per [ADR-0037](../adr/0037-trust-inspection-competitive-wedge.md) — listed in this table to keep the sprint trajectory in one place. It builds the remote trust foundation (verified-seller, condition disclosure, VIN history, inspection **demand fake-door**) and runs a 5-10-person **free concierge inspection pilot** on the ground, replacing the generic beta as the real first test.
>
> **S10 (Rich chat + direct-message notifications + mobile polish)** shipped as the remote code sprint after S9a. It did not execute S9b or build the full notification platform or Phase 2 inspection workflows.

---

## Post-MLP bets

These are not a backlog. They are candidates for shaping after beta learning. If an idea still matters, it will come back to the betting table with a problem, appetite, no-gos, and rabbit holes.

| Bet candidate | Trigger to build | Current home |
|---|---|---|
| Better discovery filters + free-text search | Buyers cannot narrow or search listings well enough with the S8a Favorites list + MLP filters | [`features/33-search-discovery.md`](features/33-search-discovery.md) |
| Saved searches | Buyers repeat the same search manually across days | [`features/35-subscriptions.md`](features/35-subscriptions.md) |
| Dealership showroom | Dealers actively post inventory and need a shareable storefront | [`features/38-showroom.md`](features/38-showroom.md) |
| Garage | Repeat sellers or profile trust need a vehicle ownership surface | [`features/37-garage.md`](features/37-garage.md) |
| Blog / Bortzhurnal | Marketplace activity exists and content/community pull is visible | [`features/39-content-blogs.md`](features/39-content-blogs.md) |
| Full admin dashboard | Manual admin work becomes repetitive enough to justify UI breadth | [`features/40-admin.md`](features/40-admin.md) |
| Moderation operations | Report volume makes manual first-in/first-out review too slow | [`features/40-admin.md`](features/40-admin.md), [`flows/65-admin-moderation.md`](flows/65-admin-moderation.md) |
| Trust/support workflows | Users need transparency, appeals, report correction, or dispute handling | [`flows/65-admin-moderation.md`](flows/65-admin-moderation.md) until a dedicated trust/support PRD is shaped |
| Moderation alerts | Reports need paging outside normal admin review cadence | [`features/36-notifications.md`](features/36-notifications.md), [`ops/81-monitoring-alarms.md`](ops/81-monitoring-alarms.md) |
| Inspection reports + tier | Trust, misrepresentation, or inspection demand becomes the bottleneck | [`features/50-reports-tier.md`](features/50-reports-tier.md) |
| PDF reports | Reports exist and users need printable/shareable artifacts | [`features/51-pdf-export.md`](features/51-pdf-export.md) |
| Video / 360 / comparisons | Visual inspection quality or comparison friction blocks purchases | [`features/52-orbit-photos.md`](features/52-orbit-photos.md) |
| **Trucks / commercial vertical** | Cars marketplace loop is proven and commercial-vehicle demand is visible | [ADR-0035](../adr/0035-multi-vertical-platform-direction.md) until a vertical PRD is shaped |
| **Auto parts vertical** | Buyers/sellers ask for parts and the cars loop is healthy | [ADR-0035](../adr/0035-multi-vertical-platform-direction.md) |
| **Specialized parts-compatibility matching** | Parts vertical exists and fitment accuracy is the bottleneck | [ADR-0035](../adr/0035-multi-vertical-platform-direction.md) — new bounded context + fitment data |
| **Services vertical** | Repair / service demand surfaces alongside the marketplace | [ADR-0035](../adr/0035-multi-vertical-platform-direction.md) |

---

## Milestones

| Milestone | After sprint | Demo-able to |
|---|---|---|
| **M1** Hello stack | S1 | Nobody — confirms the rails |
| **M2** I can log in | S2 | Tiny internal group |
| **M3** I can browse cars | S4 | Internal group |
| **M4** I can find relevant cars | S5 | 10-20 beta testers with seeded listings |
| **M5** I can contact the seller | S6 | Beta testers with real listings |
| **M6** Admins can keep beta safe | S7 | Internal admins |
| **M7** Private beta substrate | S8 | Product-complete, localized, beta-safe marketplace loop |
| **M8** Trust wedge / first inspection pilot | S9 | 5-10 buyers who get a free AutoTM inspection |
| **M9** Rich chat and launch polish | S10 | Rich realtime chat, direct-message push path, and launch-visible mobile polish |
| **M10** Store-reviewable cloud production | S11 | Founder/operator can deploy, promote, restore, roll back, and prove the seeded reviewer path on Railway |

---

## Sprint dependencies

```
S1 ────► S2 ────► S3 ────► S4 ────► S5 ────► S6 ────► S7 ────► S8 ────► S9 ────► S10 ────► S11
          auth      catalog   listings  discovery contact   safety   beta    trust   rich chat  deploy
```

- **S2 unlocks authenticated actions** — contact seller, create listing, and admin elevation all depend on identity.
- **S3 unlocks listings and filters** — listing creation and discovery need catalog data.
- **S4 unlocks the market object** — search and contact need real listings.
- **S5 unlocks buyer intent** — contact is meaningful only when buyers can find relevant listings.
- **S6 unlocks real marketplace learning** — once buyers contact sellers, we can measure the loop.
- **S7 comes before broader beta** — moderation must exist before 10-50 real users enter.
- **S8 is last in the MLP software loop** — the product-complete beta substrate is shipped; real-user invites now depend on the deferred deployment/on-site cutover sprint.
- **S9 is the trust wedge** ([ADR-0037](../adr/0037-trust-inspection-competitive-wedge.md)) — pulled forward as the differentiator vs. TMCARS/Teklip; its on-ground concierge pilot shares the deferred deployment sprint's TM-presence dependency.
- **S10 shipped rich chat + direct-message notifications + mobile polish** — S9b remains manual/on-ground; ADR-0039 subsequently selected S11 as the deployment track rather than another marketplace-feature bet.
- **S11 is the approved Railway deployment sprint** ([ADR-0039](../adr/0039-phased-cloud-first-hosting.md)) — it makes staging and reviewer-only cloud production operable before the human-led store-submission track. It does not admit real users or execute the later TM cutover.

If a sprint slips, slide downstream rows by the same delta. Do not parallelize unless a shaped pitch proves the dependency is false.

---

## How to update this file

The per-sprint steps below are retired with the sprint files; record shipped capabilities in the Shipped log.

Historical procedure:

1. **Start of sprint N**: open `sprints/sprint-NN-<name>.md`; set the Current Sprint block at the top of this file to N + status 🟡; the row for N in the table to 🟡 with `Started` = today's date.

2. **End of sprint N**: set the row for N to 🟢 with `Shipped` = today's date. Bump Current to N+1 with status ⚪ Pending. Add a one-line note under "Shipped log" below describing what landed.

3. **If scope shifts between sprints**: follow the "How to propose a scope change" checklist in [`02-phases.md`](02-phases.md). Update the affected pending sprint file's DoD; do **not** silently move work.

4. **If a material feature capability moves phase**: add an ADR per [ADR-0020](../adr/0020-document-hierarchy-and-mutability.md).

## Shipped log

> One-line entries, newest first.

- 2026-07-17 — S10 Rich chat + direct-message notifications + mobile polish (M9). Shipped authenticated Socket.IO chat with HTTP recovery, text/image/listing-reference messages, delivery/read watermarks, typing/presence, mute/block/delete/report safety, native-token direct-message push decisions through worker `PushPort` test transport, RU/TK/EN quick replies, and launch-visible mobile polish. The five-workspace gate passed 17/17 tasks; Expo SDK 55 dependencies, cleared iOS export, and Expo Go simulator boot passed. Production FCM/APNS credentials remain a deployment follow-up. Retro: `sprints/sprint-10-rich-chat-notifications-mobile-polish-retro.md`.
- 2026-06-27 — S8a Private beta polish remote slice. The remotely verifiable beta substrate is closed: mobile i18n (RU/TK/EN with `Accept-Language` + locale-keyed cache), first-launch onboarding, Cabinet/Profile + Settings/logout/language, 30-day account deletion grace + recovery + worker purge, Favorites API/UI, broken-UI sweep, top-5 error/a11y pass, RU/TK/EN legal pages, AFK MLP e2e smoke, admin moderation smoke, and real browser/admin TOTP closeout. `CONTEXT.md` drift reconciled for mobile, identity, listings, worker, web, admin, DB/contracts as applicable; Favorites removed from the post-MLP bet table. On 2026-07-05, the former S8b on-site distribution / real OTP / monitoring drill scope was deferred to a future deployment/on-site cutover sprint, so S8 closes as S8a. Closeout: `sprints/sprint-08-private-beta-polish-s8a-closeout.md`.
- 2026-06-08 — S7 Minimal admin + moderation (M6). Internal admins can run the private beta safely: authenticated report → TOTP-elevated admin review → ban / dismiss / suspend → audit → synchronous public enforcement. Hardened `AdminGuard` (role + 12h TOTP elevation loaded via JWT `sid`); admin TOTP enroll/verify/status with AES-256-GCM secret, SHA-256 backup codes, 5-fail/10-min throttle, adjacent-step skew (`otplib`); `apps/admin` HTTP-only-cookie server-action bridge with refresh-on-401 retry + relative-`returnTo` validation. `ContentReport` (listing/user polymorphic targets, reason enum, `other`-requires-details, application-level pending dedupe, self-report + suspended-reporter blocks) owned by `admin/` behind resource-shaped `POST /api/v1/listings|users/:id/report`. Admin report queue/detail + audit reads (offset 50/100, live target/actor summaries, deleted-user/operator-script provenance). Listing ban/unban (`ListingsAdminPort`) and user suspend/unsuspend (`IdentityAdminPort`) as **transaction-scoped cross-context ports** — report resolution + target mutation + audit write commit in one `admin/`-owned Prisma transaction; enforcement is synchronous state checks (banned listings leave public feed/search/detail + block new contact/messages; `User.suspendedAt` blocks marketplace mutations across listings/conversations/admin with `USER_SUSPENDED`). Six `apps/admin` pages (login, reports, report detail, listing/user action, audit). Launch-safety kill switches `REPORT_ENTRY_ENABLED` / `ADMIN_MODERATION_ACTIONS_ENABLED` (disabled writes → 403 `FEATURE_DISABLED`). First admin via checked-in `packages/db/scripts/promote-admin.ts` + `ops/86-admin-bootstrap-runbook.md`. One migration `20260608010000_s7_admin_moderation`. Built AFK via Kimi-Sandcastle as direct branch merges (#176–#185); all four touched `CONTEXT.md` files updated in-sprint. Outstanding human gate before beta invites: real-authenticator TOTP, admin browser walkthrough, mobile report-entry, e2e smoke (folds into S8). Retro: `sprints/sprint-07-minimal-admin-retro.md`.
- 2026-06-07 — S6 Contact seller (M5). Simplest buyer↔seller text-contact loop shipped per [ADR-0027](../adr/0027-mlp-beta-scope.md) — no Socket.IO, no rich-chat fields. Per-listing `Conversation` + `ConversationParticipant` + text `Message` (unique on `(listingId, buyerId)`, self-contact rejected, participant-only access, explicit sold/archived read-only-thread behavior with banned/suspended hooks pre-documented for S7). Four use-cases (`OpenConversation`, `ListMyConversations`, `ListMessages`, `SendTextMessage`) behind `POST/GET /api/v1/conversations` + `GET/POST /api/v1/conversations/:id/messages`, consuming `listings/` only through `ListingsReadPort` (extended with `allowChat`); message insert + conversation-activity bump run in one Prisma transaction so the list sorts by latest message. Mobile: anonymous Message CTA → OTP resume → conversation detail with optimistic send/retry, plus the seller Chat-tab conversation list; TanStack Query refetch-on-focus, no WebSocket. Built AFK via Kimi-Sandcastle as direct branch merges (#168–#174); 52/52 conversations domain+application unit tests green; **zero schema migrations** (conversation models pre-provisioned). Outstanding: human Expo Go simulator smoke of the end-to-end contact flow before the M5 beta demo (sandcastle cannot run the simulator). Retro: `sprints/sprint-06-contact-seller-retro.md`.
- 2026-06-06 — S5 Search + listing detail (M4). MLP feed filters (brand→model, city, price range, year range, condition) wired end-to-end from mobile filter sheet through contracts, `ListingFilter` VO, and FX-aware `ChronologicalRankingAdapter` to Prisma query. Filtered infinite query with distinct query-key cache per filter set, zero-result + reset state, and stable cursor pagination on `(publishedAt DESC, id DESC)`. Buyer detail surface (photo gallery, specs, price, seller block, Call/Share CTAs) verified from S4; Message remains "coming soon" → S6. Mobile-only; public web SSR stays deferred to S8.
- 2026-06-06 — S4 Listings CRUD (M3). Seller posts listings via an 8-step mobile wizard (seven data steps plus Review) with VIN/photos/specs/price/location/contact; anonymous buyer views the chronological feed + full detail on mobile; public web SSR is deferred to S8 per the 2026-05-29 S4 retro. Drafts auto-save, mobile photo uploads run in parallel with form-filling, and My Listings/Drafts supports owner management. Multi-currency input (TMT/USD/AED) displays public prices in TMT through admin-managed FX rates. State machine shipped for active/sold/archived + soft-delete, 14-day sold fade, locked identity fields, price-change audit, and foundation ports (`VinDecoder`, `MediaContentClassifier`, `FeedRanking`, `ImageVariantGenerator`) with null/sync adapters for later swaps.
- 2026-05-17 — S3 Catalog. Trilingual catalog API (read + admin write for Brand+Model) shipped: 7 entities seeded (Brand/Model/Color/BodyType/Region/City; Generation table-only), Accept-Language middleware live, dev-only `/dev/catalog` mobile route renders the brand list via apiClient. Admin write tested with mintAdminJwt helper; full admin UI ships in S7 under the MLP beta roadmap.
- 2026-05-16 — S2 Identity (M2). Phone OTP login works end-to-end on mobile: request OTP → verify → JWT access + per-session bcrypt-hashed refresh (ADR-0012), 10-session cap with FIFO eviction, rate-limited (5/phone/day + 10/IP/hour), full chaos coverage at domain/application layer, e2e for happy path + rate-limit shape + logout/me/delete-me. Public web stayed anonymous-only (#41 retracted); deferred-action replay tracked at #52; mobile data-fetching architecture locked in ADR-0015 with implementation at #53. _(Carry-over: PRs #60, #61, #63 — mobile data-fetching wrapper, apiClient diagnostic fix, action-gated auth — merged on 2026-05-16 after the sprint-close PR #55 ran. They count as S2-adjacent work; the rest of the line above is in-sprint scope.)_
- 2026-05-14 — S1 Scaffold (M1). Local dev stack runs (`pnpm install && pnpm dev`); CI green; air-gapped bundle path proven via `make -n bundle`.

---

## Cross-references

- **Feature PRDs** — [`features/`](features/) — one per product capability
- **End-to-end flows** — [`flows/`](flows/) — user journeys; some are post-MLP now
- **UI / design system** — [`ui/`](ui/)
- **Ops** — [`ops/`](ops/) — deploy / monitoring / launch
- **Decision log** — [`../adr/`](../adr/)
- **Domain state** — [`../../CONTEXT-MAP.md`](../../CONTEXT-MAP.md) (always-current per-context invariants)
