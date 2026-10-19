# Dealer and diagnostics handoff to Chief of Staff

2026-10-14. Shaping and review prototypes are ready for handoff. Production implementation and launch remain outstanding. This document records the handoff, not a scheduled sprint, accepted ADR or authorization to merge/deploy.

The working branch is `shape/dealer-showroom-diagnostics`, based on `cf452fd3`. At handoff, the documentation and artifacts are local, uncommitted and unpushed. No issue, PR or deployment was created for this work. Preserve the working tree before moving work between branches. Refresh current main and check ownership before reserving implementation work.

## Start here

| Material | Purpose |
| --- | --- |
| [PRD review index](2026-10-14-dealer-diagnostics-shaping-review.md) | Owning specifications, reconciliation and evidence |
| [Dealer workspace flow](../prd/flows/67-dealer-workspace-and-sharing.md) and [showroom specification](../prd/features/38-showroom.md) | Business ownership, app navigation, inventory, enquiries and sharing |
| [Inspection flow](../prd/flows/66-diagnostic-inspection.md), [reports](../prd/features/50-reports-tier.md) and [PDF contract](../prd/features/51-pdf-export.md) | Inspection/report lifecycle and audiences |
| [Center scaling strategy](../prd/business/inspection-program.md) | Launch center and later center-based expansion |
| [Dealer phone prototype](../../output/dealer-showroom-prototype/index.html) | 21-step journey and seven focused flows |
| [Staff/admin workspace](../../output/inspection-workspace-prototype/index.html) | Six guided workflows, reception through report history |
| [Workspace scope matrix](2026-10-14-inspection-workspace-prototype-scope.md) | 26 capabilities, prototype assumptions and production gaps |
| [Mobile-aligned report reader](../../output/report-design/report.html) and [design analysis](../../output/report-design/mobile-alignment.md) | Responsive customer report and current mobile design comparison |
| [Turkmen capability checklist](../../output/pdf/carberk-diagnostika-barlag-sanawy-tk.pdf) | Mechanics review of 36 draft checks |
| [Turkmen body worksheet](../../output/pdf/carberk-kuzow-barlag-kartasy-tk.pdf) and [sample report](../../output/pdf/carberk-diagnostika-hasabat-nusgasy-tk.pdf) | Vehicle diagrams and fictional printable findings |
| [Report pattern research](2026-10-14-carberk-inspection-report-patterns.md) | External examples and design rationale |
| [Preserved decision previews and review records](2026-10-14-dealer-diagnostics-handoff-support/README.md) | Proposed decisions and historical independent review |

The interactive dealer and workspace HTML files are self-contained and can be opened directly. Temporary localhost servers are optional conveniences. The durable handoff does not depend on `/tmp` or a running server.

## Founder clarification on 2026-10-15

The initial service includes buyer requests on both individual and dealer Listings, not a seller-only first release. Before confirmation, show checks/methods, limitations, illustrative output, audience and cash price/payment timing. Equipment is committed: diagnostic scanner, paint-thickness meter and basic physical checks. Exact supported checks and installed readiness still require validation. Payment is cash at the center, with no online payment.

Public-report sellers/dealers must sign before inspection that complete results may be published even when unfavorable. No selective fault removal or favorable-only publication. Exact consent wording/evidence and withdrawal/dispute rules remain to approve. Buyer-private access remains separate.

The founder wants collection/retention of vehicle inspection data. This is not blanket permission to expose private reports or create a public history database. Data purposes, retention periods, lawful basis and secondary uses remain to settle. Two clarifications were requested: what buyer agree/deny controls, and whether data collection means internal retention or a new public history product. Until answered, record these as pending rather than choosing policy in code.

The current prototype predates this clarification. It does not yet demonstrate the buyer-to-seller request/decline interaction or a legally reviewed publication/data signature. Task acceptance must include those flows after policy clarification. No production work or tickets have started.

## Founder-agreed direction

- Dealer tools are free. One Carberk app uses personal staff logins and switching through Cabinet into a business workspace. Preserve the existing five tabs and seven-step listing wizard. Make personal/business ownership explicit before drafting and on review.
- The business owns its inventory and shared enquiries, which survive staff removal. Personal records remain separate. Owners manage members/settings/reassignment; sales staff manage cars and claim enquiries. Assignment and Open/Closed state are separate.
- Dealer cars appear in mixed results with truthful dealer identity and a seller-type filter. Dealer identity opens the public showroom. Deliver external listing and showroom sharing with anonymous web fallback and correct sold/unavailable states.
- Diagnostics are optional for both personal and dealer cars. Start with one own center in Aşgabat and one plan. Cars come to centers at every expansion stage. No traveling inspectors.
- Manual appointments and a transparent fee paid in cash at the center are launch direction. Free dealer access does not mean free inspection. No online payment in the initial scope.
- Buyer-private reports and authorized complete public listing reports have separate audiences. Buyer A declining a car does not give the seller or Buyer B access to A's report. B may commission another inspection. Public report reading is free. No initial private-to-public conversion or private-report resale.
- Staff publish complete findings. Sellers cannot remove selected faults. Pin checklist versions and retain immutable finalized report snapshots. Findings link diagrams, named panels, measurements and photos. Unchecked is explicit; an assessed panel may have zero findings.
- Keep business verification distinct from vehicle condition. No ranking boost, paid placement, condition grade or guarantee is approved.
- Follow current mobile tokens/components and preserve wizard validation, media recovery, draft, contact-proof and editing behavior. Phone, desktop and A4 share report content with layouts suited to each format.

## Decisions still needed

The founder's agreement to the direction does not approve every prototype default. Resolve the affected questions before dispatching dependent implementation.

1. Review and approve decision previews through the repository ADR workflow. Proposed numbers 0099/0100 are tentative. Explicitly reconcile ADR-0037's pilot-first constraint and ADR-0057's inspection CTA restriction. Do not edit accepted historical ADRs or expose a fake-door/coming-soon service CTA.
2. Set dealer invitation/onboarding, membership cardinality, owner recovery, delegated contact proof, staff removal/handover, suspension and transfer rules.
3. Agree report/order/template/evidence ownership and injected cross-context contracts. Specify actual worker privileges, assignment, separate-review or self-review policy, stale-session denial and private media/PDF authorization.
4. Validate readiness of the committed scanner and paint-thickness meter, and have mechanics confirm supported checks, methods, measurement thresholds and required evidence. Set service scope, price, duration and center capacity. Review Turkmen terminology with a fluent technical reviewer. Checklist revisions can proceed alongside independent software work.
5. Set vehicle matching and identifier masking, consent wording/evidence, freshness and relisting/transfer behavior, correction/withdrawal authority, historical visibility, retention, refunds and disputes.
6. Decide production release/PDF readiness behavior and approved EN/RU/TK output. The prototype's reviewer, evidence-exception and release timing rules are reviewable proposals.

## Suggested delivery sequence

Chief of Staff should use the current [run-queue workflow](../../.claude/skills/run-queue/SKILL.md) and [coding workflow](../agents/coding-workflow.md). Select a bounded parent outcome, record criteria/exclusions/human inputs and dependencies, inspect existing tasks, then reserve one integration delivery from current main. This shaping handoff is not a preselected all-in-one implementation batch.

Dealer track: settle membership and ownership contracts, then business authorization and inventory through the existing wizard, shared enquiries/realtime/notifications, public showroom and real listing/showroom sharing. Include migration and regression evidence for existing personal behavior.

Diagnostics track: settle authorization/audience/ownership, implement versioned templates and service-order/report lifecycles, staff intake and evidence recovery, review/finalized snapshots, protected reader and stored PDF generation, then corrections/reinspection/history. Integrate optional listing entry and report display after these contracts are stable. See the scope matrix for production requirements and boundaries.

Before release, verify server permission and private-media denial, snapshot invariants, concurrency/recovery, native/web links, actual PDF generation/pagination/locales, accessibility and existing listing/chat behavior. Enable real service requests only after the center, staff, terms and approved service are ready. Center preparation need not block independent domain/template preparation.

Exclude a separate dealer app, paid dealer access, boosts, traveling inspectors, online payment, extra diagnostic tiers and reuse/resale of private buyer reports from this initial scope.

## Evidence and limits

- The original 20-file documentation draft received an independent read-only review with no P0/P1 findings. Follow-up fixes clarified zero findings versus missing assessment, removed generic PRO credibility wording and made center arrival explicit. That review predates the complete workspace prototype and its scope matrix.
- Original documentation checks covered 244 local links and 13 rendered Mermaid diagrams. Glossary and agent-document checks passed. Typecheck passed through 11 cached Turbo tasks. Full repository tests were attempted, but container-backed DB suites failed without a working container runtime, with teardown errors. Full-suite evidence is missing.
- The dealer journey and focused flows were browser-replayed. All six workspace guides and targeted intake, evidence, review, template, privacy, correction, reinspection and removed-access behaviors were browser-checked. See [workspace verification](../../output/inspection-workspace-prototype/verification.md) for exact claims and limits. Small-screen overflow and desktop/mobile visuals were checked.
- Static Turkmen PDFs were rendered and visually checked. The dynamic workspace PDF states are simulated. Browser print pagination/dialog, stored issued PDF generation and full locale rendering remain unverified.
- Prototypes have fictional in-memory data. They do not establish real authentication, backend authorization, durable storage, uploads, appointments, payment, notifications or native integration. No production source, schema or package configuration changed.

The next owner can begin task selection from this handoff. Implementation completion, independent fixed-commit review, required CI, acceptance and launch readiness must be evidenced in the ensuing delivery.
