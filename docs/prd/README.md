# Product Requirements — AutoTM

This directory is the **product spec**. ADRs answer *why*; CONTEXT.md describes *what is true now*; the PRD describes *what we're building*.

Read in order if you're new:

1. [00-vision.md](00-vision.md) — what AutoTM is and why
2. [01-glossary.md](01-glossary.md) — domain language
3. [02-phases.md](02-phases.md) — scope per phase
4. [03-roadmap.md](03-roadmap.md) — **the trajectory** (current sprint + sprint status table + milestones)
5. [10-personas.md](10-personas.md) — who uses it
6. [20-information-architecture.md](20-information-architecture.md) — sitemap + nav

## Sprints

Per-sprint detail (DoD, file list, tests, references) lives in [`sprints/`](sprints/):

| # | Sprint | Phase | Milestone |
|---|---|---|---|
| [01](sprints/sprint-01-scaffold.md) | Scaffold | 1 | M1 |
| [02](sprints/sprint-02-identity.md) | Identity (OTP) | 1 | M2 |
| [03](sprints/sprint-03-catalog.md) | Catalog | 1 | — |
| [04](sprints/sprint-04-listings-crud.md) | Listings CRUD | 1 | M3 |
| [05](sprints/sprint-05-search-listing-detail.md) | Search + listing detail | 1 | M4 |
| [06](sprints/sprint-06-contact-seller.md) | Contact seller | 1 | M5 |
| [07](sprints/sprint-07-minimal-admin.md) | Minimal admin + moderation | 1 | M6 |
| [08](sprints/sprint-08-private-beta-polish.md) | Private beta polish | 1 | M7 |

Post-MLP sprint files get created from shaped bets after the Phase 1 beta retro (see [03-roadmap.md](03-roadmap.md) and [ADR-0027](../adr/0027-mlp-beta-scope.md)).

Deferred features should not become orphan sprint files or loose issues. Put the target capability in the owning feature PRD or flow, add/keep a row in `03-roadmap.md` with a trigger to build, and create a sprint file only when the bet is shaped for execution. `CONTEXT.md` may mention the item only as a planned addition that points back to that PRD/sprint home.

Then pick a feature:

## Features (Phase 1 MLP beta)

| # | Feature | Bounded context |
|---|---|---|
| [30](features/30-identity.md) | Identity (auth, basic profile) | `identity/` |
| [31](features/31-catalog.md) | Catalog (brands, models, regions) | `catalog/` |
| [32](features/32-listings.md) | Listings (create, view, edit, photos) | `listings/` |
| [33](features/33-search-discovery.md) | Basic search + listing detail discovery | `listings/` + client |
| [34](features/34-conversations.md) | Contact seller (simple text thread) | `conversations/` |
| [40](features/40-admin.md) | Minimal admin moderation | `admin/` + `apps/admin` |

## Features (post-MLP marketplace bets)

| # | Feature | Bounded context |
|---|---|---|
| [35](features/35-subscriptions.md) | Saved searches → match notifications | `subscriptions/` |
| [36](features/36-notifications.md) | Push + in-app notifications | `notifications/` |
| [37](features/37-garage.md) | My Garage (cars I own / dream of) | `identity/` |
| [38](features/38-showroom.md) | Dealership showroom (public page) | `identity/` + `apps/web` |
| [39](features/39-content-blogs.md) | Bortzhurnal (blog posts) | `content/` |
| [40](features/40-admin.md) | Full admin dashboard expansion | `admin/` + `apps/admin` |

## Features (trust and premium bets)

| # | Feature | Bounded context |
|---|---|---|
| [50](features/50-reports-tier.md) | Inspection reports + 3-tier system | `reports/` |
| [51](features/51-pdf-export.md) | PDF generation for reports | `reports/` |

## Features (premium media bets)

| # | Feature | Bounded context |
|---|---|---|
| [52](features/52-orbit-photos.md) | 360° orbit photos | `listings/` + client |

## Flows (end-to-end user journeys)

| # | Flow |
|---|---|
| [60](flows/60-first-time-user.md) | Anonymous browse → action → OTP → in |
| [61](flows/61-create-listing.md) | Sell button → wizard → publish → shared link |
| [62](flows/62-buy-flow.md) | Browse → contact → meet |
| [63](flows/63-share-listing-in-chat.md) | Deep link round trip |
| [64](flows/64-saved-search-match.md) | Post-MLP saved-search match |
| [65](flows/65-admin-moderation.md) | Report received → review → action |

## UI / design

| # | Topic |
|---|---|
| [70](ui/70-design-principles.md) | Design principles |
| [71](ui/71-design-tokens.md) | Tokens (the source values) |
| [72](ui/72-light-and-dark.md) | Mode strategy |
| [73](ui/73-typography.md) | Type scale + usage |
| [74](ui/74-iconography.md) | Lucide icons |
| [75](ui/75-illustration-style.md) | Empty states + errors |
| [76](ui/76-motion.md) | Animation principles |
| [77](ui/77-accessibility.md) | Contrast + tap targets |
| [78](ui/78-component-library.md) | Component library index |
| [79](ui/79-web-vs-mobile.md) | What's shared, what differs |

Per-component specs live in [`ui/components/`](ui/components/).

## Ops

| # | Topic |
|---|---|
| [80](ops/80-deployment-runbook.md) | Deploy runbook |
| [81](ops/81-monitoring-alarms.md) | Monitoring + alarms |
| [82](ops/82-incident-template.md) | Incident response template |
| [83](ops/83-legal.md) | Legal documents (Privacy Policy + Terms) |
| [84](ops/84-launch-plan.md) | Launch / cutover plan |
| [85](ops/85-launch-analytics-plan.md) | Launch analytics and scaling plan |
| [86](ops/86-admin-bootstrap-runbook.md) | Admin bootstrap runbook |
| [88](ops/88-play-console-submission.md) | Google Play Console submission pack |
| [91](ops/91-release-program-charter.md) | Release program charter for milestones A, B and C |

## How to write a PRD page

Every page follows this skeleton:

```markdown
# <Feature>

## Summary
<one sentence — what this is>

## Why it exists
<user problem in 1-2 paragraphs>

## What it does (user-visible behavior)
<numbered list — screens described not just named>

## Screens / states
<each screen: purpose, primary action, edge cases, error states>

## Data references
<points to relevant CONTEXT.md files>

## Decisions
<points to relevant ADR numbers>

## Phase
<Phase 1 / 2 / 3 — explicit>

## Out of scope (explicit anti-list)
<things we considered but chose not to build>

## Open questions
<things still TBD — should be empty by code-freeze>
```

Keep pages 1-3 pages each. Smaller = under-specified. Bigger = nobody reads them.

## Closing a phase or beta gate

At a phase boundary, run a documentation closeout before creating the next wave of sprint issues:

1. Reconcile roadmap status against shipped sprint retros and closed parent/child issues.
2. Check every post-MLP candidate has a PRD/flow home and trigger to build.
3. Remove or relabel orphan issues that imply Phase 1 work but are really Phase 2/3 bets.
4. Confirm `CONTEXT-MAP.md` indexes every current `CONTEXT.md`.
5. Confirm changed invariants landed with matching `CONTEXT.md` updates.
6. Add an ADR only for material capability movement or a surprising architectural trade-off; routine deferred-feature placement does not need one.
