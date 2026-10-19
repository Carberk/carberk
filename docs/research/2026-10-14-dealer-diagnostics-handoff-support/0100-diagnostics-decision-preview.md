# ADR-0100: Build center-based diagnostics with private and public reports

- **Status**: Proposed preview; root ADR file not created
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Relationship**: Amends ADR-0037's manual-pilot-before-inspector-software sequencing and ADR-0057's blanket release inspection-CTA restriction only for a ready real service. Preserves the ban on coming-soon demand signals and paid placement.

## Context

The founder is preparing an own diagnostic center in Aşgabat and wants software work to continue while mechanics validate equipment and checks. Prior documents describe traveling inspectors, competing tier formulas and several service/pricing tracks. The larger inspection-program document is a scaling strategy. It must retain that purpose while describing center-based inspection at every stage.

Buyer-funded private inspections also differ from seller-authorized public listing reports. Paying for inspection does not make its results public or grant another buyer access. Prototype demonstrations are not secure implementation or validated mechanical scope.

## Decision

Carberk develops a center-based diagnostic service with one report workflow and an explicit private-buyer or public-listing audience, starting with one own center in Aşgabat and one service plan.

Cars come to centers at every scale. Additional branches, staff and capacity remain future strategy requiring demand, quality and readiness evidence. No traveling inspection, seller-location dispatch or vehicle collection service is part of this decision.

Software work may progress while the center is prepared, after the owning PRDs and required open decisions are ready for execution. Public requests open only after operational approval of actual scope, equipment, price, duration, consent, staff access and tested delivery. Manual appointment confirmation and payment at the center are the initial direction. Ordinary personal and dealer publishing remains optional with respect to diagnosis and uses the same existing wizard.

Buyer-private reports are accessible to the commissioning buyer and specifically authorized center staff. Vehicle access requires owner authorization. Neither a seller, dealer member nor a later buyer receives report access from vehicle ownership, membership or a Listing link. Seller/dealer public reports require publication authorization before inspection and release complete findings. Public readership is free. Initial flows omit private-to-public conversion and resale of private access.

Use configurable versioned checklists and structured findings with notes, measurements and evidence. Final report and PDF share the same immutable snapshot. Body diagrams use stable panel/finding IDs with a text equivalent; damage, repair/repaint evidence and supported accident history remain separate facts. No automatic Normal result or assumption that a blank diagram proves an undamaged car.

Initial displays use factual inspection availability, recorded date/mileage and findings, without Gold/Silver/Bronze, a condition guarantee or automatic search boost. This revises prior mutable tier proposals; any charter-level branding consequences need explicit reconciliation before public copy approval. Paid placement remains prohibited. Do not reactivate InspectionInterest, a coming-soon CTA or the old post-publish interest prompt as a substitute for booking.

Exact identity matching/masking, corrections and freshness, role/reviewer separation, retention, cancellation/refund and listing transfer/association remain PRD decisions required before affected execution. They are not supplied by this ADR or a role-switching demo.

## Consequences

### Positive

- Mechanics can refine check coverage while software preparation proceeds.
- One dataset supports the worker portal, authorized reader and printable report.
- Explicit audiences protect private purchase decisions and let public reports serve multiple buyers without another access fee.
- The scaling strategy can grow through equipped centers without inventing traveling operations.

### Negative / accepted costs

- The service needs real staffing/equipment, quality review, privacy, complaint and operational evidence before opening.
- Private reader/PDF/media access requires scoped authorization and protected storage delivery.
- One initial city creates unequal access; report availability alone cannot establish a ranking-quality signal.
- Finalized report history, corrections and downloaded copies need clear communication and retention policy.

### Neutral

- Free dealer access does not imply free inspection work.
- Existing demand-capture data/code may remain disabled; it is not booking.
- Center strategy estimates stay unvalidated hypotheses, not hiring dates, public prices or SLAs.

## Alternatives considered

- Freeze all software until the checklist is final: prevents independent progress the founder requested.
- Traveling inspectors: contradicts the center-based operating model.
- Automatically publish buyer-funded reports: confuses payment with disclosure rights.
- Separate native worker app first: adds delivery cost before an offline/native need is established.
- Automatic tiers or ranking boosts: lacks a validated rubric/evidence and risks misleading trust/paid placement.

## References

- docs/prd/features/50-reports-tier.md
- docs/prd/features/51-pdf-export.md
- docs/prd/flows/66-diagnostic-inspection.md
- docs/prd/business/inspection-program.md
- docs/research/2026-10-14-carberk-inspection-report-patterns.md
- docs/adr/0037-trust-inspection-competitive-wedge.md
- docs/adr/0057-defer-the-in-app-inspection-demand-signal.md
- docs/adr/0021-feed-ranking-port.md
- docs/prd/00-vision.md
