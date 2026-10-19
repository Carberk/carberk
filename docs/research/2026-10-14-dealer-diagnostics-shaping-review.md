# Dealer, sharing and diagnostics PRD review

2026-10-14. Draft reconciliation on `shape/dealer-showroom-diagnostics`, based on `cf452fd3`. This is an evidence/provenance and review index, not another feature specification. No production implementation, live service, scheduled sprint or root ADR approval is claimed.

## Read the proposed capability in this order

1. [Dealer workspace and showroom](../prd/features/38-showroom.md), then [dealer and sharing journeys](../prd/flows/67-dealer-workspace-and-sharing.md).
2. [Diagnostic inspection and reports](../prd/features/50-reports-tier.md), then [inspection journeys](../prd/flows/66-diagnostic-inspection.md).
3. [Report PDF output](../prd/features/51-pdf-export.md).
4. [Inspection program and center scaling](../prd/business/inspection-program.md), which keeps future expansion separate from the initial service.
5. [Create Listing](../prd/flows/61-create-listing.md), reconciled to the current seven-step contracts rather than the obsolete VIN-first/one-photo flow.

Identity, Listings, Search, Conversations, Admin, information architecture, buyer flow, external sharing entry and business directory index link these owning specifications. The historical S9b rubric remains intact with a scope note; it is not the finalized center checklist.

## Founder direction captured

| Decision | Canonical owner |
|---|---|
| Free dealer access, one app, personal staff sign-in, Cabinet workspace, business-owned inventory/enquiries | [38](../prd/features/38-showroom.md) |
| Existing wizard/design conventions, explicit Personal/Showroom context, recoverable drafts/media | [32](../prd/features/32-listings.md), [61](../prd/flows/61-create-listing.md) |
| Both Listing and showroom sharing, public browser fallback and truthful availability | [67](../prd/flows/67-dealer-workspace-and-sharing.md) |
| One own diagnostic center in Aşgabat, one plan initially, optional for personal/dealer Listings | [50](../prd/features/50-reports-tier.md) |
| Cars come to centers at every stage; preserve the larger center scaling plan | [inspection program](../prd/business/inspection-program.md) |
| Private buyer inspection and seller/dealer-authorized public Listing inspection | [50](../prd/features/50-reports-tier.md), [66](../prd/flows/66-diagnostic-inspection.md) |
| Configurable checks, descriptions/evidence, worker portal and printable report | [50](../prd/features/50-reports-tier.md), [51](../prd/features/51-pdf-export.md) |
| Original body diagrams informed by authentic report samples | [50](../prd/features/50-reports-tier.md), [source research](2026-10-14-carberk-inspection-report-patterns.md) |

The founder's final "okay these are fine" precedes the request to update PRDs and follows the two-audience recommendation. Record audience direction as agreed. That does not supply price, duration, equipment, staff roles, consent wording or an implementation authorization. Ranking boosts were discussed, not approved. Existing ranking and the ban on paid placement stay effective.

## Still open before affected implementation or opening

- Dealer eligibility/evidence, invite lifecycle, membership cardinality, last-owner recovery, business contact proof, staff-removal handover, suspension and personal-to-business transfer.
- Canonical host, locale/deep-link routes, slug redirects and HTTPS association. Reopening sharing does not make the public pages exist.
- Diagnostic price, duration, equipment, validated coverage/exclusions, supported vehicles and operational readiness.
- Vehicle/report identity matching, public masking, authorized attribution, review separation/elevation, consent evidence, privacy/retention and support access.
- Freshness, changed vehicle condition, repairs, corrections/reinspection, withdrawal, no-shows/refunds, listing transfer/relist and public report association.
- Later expansion center locations, capacity/hiring assumptions, actual economics and success thresholds. Historical estimates are not budgets or promises.

The initial proposed flow omits private-to-public conversion and resale of a previous buyer's private access. Detailed refund policy is unresolved; refusing to buy the car is not evidence the inspection was never delivered.

## Current-source boundaries checked

- [Schema](../../packages/db/prisma/schema.prisma): Listing/draft ownership and Conversations remain User-based. Dealership membership scaffold is not a business inventory or shared-inbox implementation; current membership makes User unique.
- [Wizard contracts](../../packages/contracts/src/schemas/wizard.ts), [machine](../../apps/mobile/src/listings/wizard/wizardMachine.ts), and [tab layout](../../apps/mobile/app/(tabs)/_layout.tsx) establish the existing seven-step sequence and five tabs. The old flow 61 diverged from these sources and has been reconciled without changing code.
- [Reports](../../apps/api/src/modules/reports/CONTEXT.md) implements interest capture/aggregates, not a diagnostic service. [Admin](../../apps/admin/CONTEXT.md) currently requires full admin/TOTP; worker-scoped access must be designed.
- [Public web orientation](../../apps/web/CONTEXT.md) is not proof of functioning Listing/showroom share routes. Actual browser/native/crawler verification is a future release gate.

Source evidence is source inspection, not a newly executed runtime test. Prototype state transitions and paper PDFs are exploratory artifacts.

## ADR implications

Accepted ADRs remain unchanged. Proposed PRD status is deliberate:

- Dealer ownership/workspace decision complements [ADR-0013](../adr/0013-user-role-split.md) and preserves [ADR-0027](../adr/0027-mlp-beta-scope.md) release boundaries. New ownership/membership/contact contracts require formalization.
- Center service/portal sequencing needs an explicit amendment of [ADR-0037](../adr/0037-trust-inspection-competitive-wedge.md), which committed to manual pilot first. A real ready service placement needs reconciliation with [ADR-0057](../adr/0057-defer-the-in-app-inspection-demand-signal.md); the fake-door restriction remains.
- [ADR-0021](../adr/0021-feed-ranking-port.md) is a ranking extension seam, not authorization to boost paid inspections.

Complete proposed decision previews and index rows are staged for local review in `/tmp/carberk-prd-review-20261014/`. Tentative numbers 0099/0100 need another collision check before creation. Root ADR creation/status and subsequent commit/PR follow the repository's explicit review/approval workflow. This draft revision is not an Accepted decision.

## Diagram and document evidence

Mermaid diagrams describe workspace entry, dealer publishing, shared enquiry assignment, external share resolution, template snapshots, body findings, center scaling, inspection audiences, report review and PDF delivery. They are explanatory target flows, not a database schema or deployed UI.

Local review artifacts under `output/pdf/` include the six-page Turkmen mechanic capability checklist and two-page body-map worksheet. Each was rendered and visually checked earlier. They are for mechanic/terminology review, not completed inspection reports or final mechanical scope. The local throwaway app/worker prototype remains under `/tmp/carberk-dealer-prototype-20261014/`; this documentation pass adds no portal permissions or production map editor.

No accepted ADR, locked sprint, retrospective, current-state overview or production source is changed in this pass. Final validation results are reported with the draft delivery.


## Validation checkpoint

Independent read-only review compared a SHA-256-pinned draft of all 20 changed/new documentation files and both decision previews. It found no major blockers. One wording fix distinguishes an unassessed panel from an assessed panel with zero findings; two residual generic PRO goals were reconciled. All were corrected in the final draft. This is a draft review, not the workflow's fixed-commit final merge review.

All 13 Mermaid diagrams parsed and rendered in the collaborative browser using local Mermaid 11.12.0 tooling. Local-link and fence checks, domain glossary, agent-documentation and diff whitespace checks passed. Typecheck passed with all 11 Turbo tasks served from cache. The repository test command was attempted but failed because container-backed database suites could not find a working container runtime; dependent suites did not all complete. This is missing full-suite evidence, not a passing test gate. No production behavior changed.


## Filled visual report follow-up

The founder additionally requested car diagrams inside the sample report itself. A [four-page Turkmen filled example](../../output/pdf/carberk-diagnostika-hasabat-nusgasy-tk.pdf) now includes five exterior vehicle views, four stable numbered findings, an important-fault summary and ten illustrative results. Values/vehicle/findings are fictional, explicitly marked; no real photos or verification identity are fabricated. It supplements the capability checklist and blank map rather than converting either into a completed inspection. All four final pages were rendered and visually inspected. Mechanic and fluent Turkmen review remain required.

### Report visual revision

Founder requested a mobile brand pass after reviewing the first sample. The [phone report prototype](../../output/report-design/report.html) uses the existing Carberk logo, bundled Geist fonts, brand red and warm neutral palette. Five selectable orthographic sedan views share the same original artwork as the [sample PDF](../../output/pdf/carberk-diagnostika-hasabat-nusgasy-tk.pdf) and [blank body worksheet](../../output/pdf/carberk-kuzow-barlag-kartasy-tk.pdf). Numbered phone markers open the matching findings. These are generic sedan diagrams, explicitly not exact Toyota Camry panel geometry. The sample findings and mechanical scope remain illustrative. This is a local report-reader prototype; staff authoring and app integration remain proposed work.

The follow-up [native design alignment analysis](../../output/report-design/mobile-alignment.md) records comparison with the live iOS Listing detail, current components, theme overrides and committed screenshots. The report reader now follows native page surfaces, Geist/Geist Mono roles, grouped rows and default black action styling. Phone and desktop adapt the layout of the same report; the print PDF remains A4.

### Complete inspection workspace prototype

The [staff/admin workflow scope](2026-10-14-inspection-workspace-prototype-scope.md) maps the full local prototype to production work still required. The [self-contained workspace](../../output/inspection-workspace-prototype/index.html) covers reception intake/appointments, technician checklist and body findings, reviewer return/finalization, template versioning, private/public delivery simulation, PDF failure/retry, corrections, reinspection and history. Six guided walkthroughs exercise these paths. It remains a throwaway review artifact with in-memory data; it does not implement production authorization, storage, booking or issued PDF generation.

## Chief of Staff handoff

The [durable handoff](2026-10-14-dealer-diagnostics-chief-of-staff-handoff.md) collects agreed scope, open decisions, stable prototype/PDF entry points, delivery dependencies and verification limits. Shaping is ready for handoff; production implementation remains outstanding.
