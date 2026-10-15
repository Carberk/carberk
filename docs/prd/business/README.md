# Business / GTM strategy

This directory holds **revenue-model + go-to-market strategy documents** — distinct from product PRDs (which describe target capability), user flows (which describe journeys), or operational runbooks (which describe production operations).

## What lives here

| Document | Revenue stream | Phase first matters | TL;DR |
|---|---|---|---|
| [`inspection-program.md`](inspection-program.md) | Center-based diagnostic service | **Readiness-gated launch, later scaling** | One own Aşgabat center/one plan first; preserve future center/staff/capacity strategy separately |
| [`ad-sales-strategy.md`](ad-sales-strategy.md) | Third-party display + native advertising | **Post-MLP marketplace bet** | Banks, insurance, parts, service centers; direct-sales motion; modest but compounding |
| [`dealer-subscriptions.md`](dealer-subscriptions.md) | Free dealer access | **Proposed dealer scope** | No dealer subscription, trial expiry or paid ranking; track useful inventory and operating cost |

## How these documents relate to the rest of the repo

- **Not ADRs** — these aren't architectural decisions. They're business plans subject to revision as the market teaches us. Per [ADR-0020](../../adr/0020-document-hierarchy-and-mutability.md), strategy docs are mutable; significant pivots may generate ADRs when they have architectural implications.
- **Inform PRD features** — when these strategies translate to user-visible capabilities (e.g., "PRO badge on dealer listings"), a feature PRD captures the spec.
- **Inform sprint planning** — the timing claims here ("first paid dealer by Month 12") feed into roadmap milestones, not the other way around.

## Honest framing

These documents are **forward-looking strategy**, not commitments. The dealer and inspection documents have a 2026-10-14 proposed revision; older market analysis below remains dated historical evidence and needs fresh validation. It is not approval of an operational promise. Other documents retain their own dates. Three things worth knowing:

1. **TM-specific data is limited.** Some numbers are extrapolated from comparable markets (KZ, UA, RU) adjusted downward for TM specifics. Where I'm guessing, I say so.
2. **Bias checks are explicit.** Each document has a "Biases to question" section. I'm pattern-matching against Western marketplaces; TM may behave differently.
3. **Failure modes are first-class.** Each document includes "what kills this" sections. The goal is to be honestly prepared, not to manifest success.

## Competitive landscape — TM incumbents

> Added 2026-06-11 after the trust-wedge grilling ([ADR-0037](../../adr/0037-trust-inspection-competitive-wedge.md)). These docs previously benchmarked only **foreign** marketplaces and named **no Turkmen competitor** — the single biggest gap in the analysis. The real competition is domestic and already strong.

| Competitor | Reach | Strengths | Gap = AutoTM's opening |
|---|---|---|---|
| **TMCARS** (`com.tm.tmcar`) | ~254K+ users; self-described #1 TM car marketplace; iOS + Android | Largest listing DB + model catalogs; search/filter; **already multi-category** (cars + real estate + electronics + household + news) | Cluttered everything-store; **no inspection / verified trust layer** |
| **Teklip Cars** | Established; Android | Clean baseline; advanced filters; **buyer↔seller chat**; AI / price-average; imported-car (China / Korea / Dubai) listings | **No dealers, no garage, no inspection** |
| Tmstore / Bildirishler | General classifieds | Broad ad inventory | Not car-focused |

**Strategic read (full record in [ADR-0037](../../adr/0037-trust-inspection-competitive-wedge.md)):** TMCARS's 254K users **validate demand** — AutoTM's problem is *differentiation*, not market existence. Neither incumbent offers **vehicle inspection / a verified trust layer**, which is exactly AutoTM's documented moat ([inspection-program.md](inspection-program.md)). **Trust is the wedge.** Multi-vertical *breadth* ([ADR-0035](../../adr/0035-multi-vertical-platform-direction.md)) is *already held by TMCARS* — table stakes, not a differentiator.

## Source material referenced across docs

- [`../00-vision.md`](../00-vision.md) — anti-goals, especially "no paid placement"
- [`../02-phases.md`](../02-phases.md) — MLP beta, post-MLP marketplace bets, trust/premium bets
- [`../03-roadmap.md`](../03-roadmap.md) — sprint sequence + milestones
- [`../features/32-listings.md`](../features/32-listings.md) — listing capability (Open Questions section)
- [`../features/`](../features/) — other feature PRDs as they're written
- **TM incumbents (direct competition): TMCARS (`com.tm.tmcar`), Teklip Cars** — see "Competitive landscape — TM incumbents" above
- Comparable (foreign) marketplaces: Auto.ru (RU), Auto.ria (UA), Kolesa.kz (KZ), Drom.ru (RU), CarGurus (US/UK), Carvana (US)

## Review cadence

These docs should be revisited:
- **Every 6 months** for sanity-check + numbers refresh
- **Before each phase or post-MLP bet boundary**
- **After any major market signal** (competitor launch, partnership formed, dealer feedback at scale)
