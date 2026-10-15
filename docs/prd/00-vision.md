# 00 — Vision

## What AutoTM is

A **mobile-first, multilingual car marketplace for Turkmenistan**, with built-in buyer/seller communication and optional center-based diagnostic reports that present complete dated findings. [ADR-0104](../adr/0104-center-diagnostics-with-private-and-public-reports.md) replaces the former three-tier quality claim with separately private buyer and authorized public seller reports, without grades or guarantees.

> **Long-term direction — cars is the wedge.** The MLP and near-term roadmap are a **car** marketplace. The longer arc is a **multi-vertical platform** — vehicles (incl. trucks/commercial), **auto parts** (incl. compatibility matching), and **services** (structurally Kolesa Group's shape). Cars proves the loop first; further verticals are **betting-table-gated** and **MLP stays cars-only**. Recorded in [ADR-0035](../adr/0035-multi-vertical-platform-direction.md).

## Why it exists

Turkmenistan's car-buying market has the same friction every emerging market has:

- Listings scattered across Telegram channels and Instagram pages
- No central place to compare prices
- Sellers hide history (accident damage, mileage rollback)
- Communication via phone calls — no chat trail, no scam protection
- Foreign apps (auto.ru, Otomoto) don't work well in TM due to network restrictions, language, and currency

We build inside Turkmenistan, for Turkmenistan: TM hosting, TM-friendly auth (phone OTP via our own SMS gateway), TM currencies, TM language support, TM regional structure.

## Who it's for

Three primary audiences (full personas in [10-personas.md](10-personas.md)):

- **Private sellers** — listing 1-3 cars in their lifetime
- **Private buyers** — searching, comparing, messaging sellers
- **Dealerships** — managing business inventory and shared enquiries through free workspaces, with truthful checked business identity

Plus purpose-authorized internal operators and center inspection staff. Software delivery and actual center/service activation have separate readiness gates.

## Why now

- Mobile penetration in TM is high; smartphone-first design is finally viable
- TM Telecom infrastructure supports our self-hosted architecture
- No competing local product owns this space
- The previous Flutter prototype proved the concept; the rewrite removes its structural limitations

## Success metrics (12-month targets after launch)

- **10,000 monthly active users** by month 6
- **1,000 active listings** at any time by month 3
- **300 messages/day** average (chat-as-core feature working)
- **30% of buyers** complete their journey from search → contact → meeting in-app (vs. switching to Telegram)
- **80% week-2 retention** for users who post a listing
- **<2% scam-report rate** per listing

## Design principles

1. **Mobile-first, anonymous-default.** No login wall on browse. Auth only on action.
2. **Honest UX.** No fake AI features, no fake "trust" badges, no pay-for-placement.
3. **Multilingual without forcing translation.** Three locales for UI; content in whatever language the seller wrote.
4. **Trust is earned, not paid for.** Complete inspection findings preserve their observation date, audience and correction history. A report-availability badge is not a quality guarantee, condition grade or ranking boost.
5. **Performance over polish.** Slow TM mobile data → aggressive client-side compression, minimal-payload pages.
6. **Air-gap by design.** Everything runs inside TM. No "cloud-only" dependencies.

## Anti-goals (things we explicitly will NOT build)

- A bidding / auction system (the market doesn't work this way locally)
- Escrow / payment processing (Phase ∞ if ever)
- Test drive scheduling (Phase ∞)
- Insurance integration (separate product)
- Cross-border listings (Phase ∞)
- AI photo enhancement / generative anything
- Crypto / NFT car ownership (no)
- Forums / public comments on listings (chat replaces them; less spam surface)

## Phases

Detailed in [02-phases.md](02-phases.md). Headline:

- **Phase 1** — MLP beta: listings, basic search, contact seller, minimal admin
- **Phase 2** — Post-MLP marketplace bets chosen from real beta usage
- **Phase 3** — Trust and premium bets: inspections, richer media, comparisons, polish

The approved [2026-10-14 campaign](../research/2026-10-14-carberk-campaign-decisions.md) admits the bounded dealer, diagnostic, service, video, views and trilingual admin/analytics work under its governing ADRs. It preserves historical sprint plans and requires concrete readiness before live service or data collection. [ADR-0107](../adr/0107-durable-permitted-vehicle-market-knowledge.md) establishes durable permitted vehicle knowledge and anonymized market insights as a business goal, with private/personal/provider rights kept separate.
