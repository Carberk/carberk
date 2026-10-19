# Inspection workspace prototype scope

Founder authorized completing the staff/admin prototype on 2026-10-14 after reviewing the mobile-aligned customer report. [Open the self-contained prototype](../../output/inspection-workspace-prototype/index.html). [Instructions and limitations](../../output/inspection-workspace-prototype/README.md) accompany it.

This extends the current proposed [inspection capability](../prd/features/50-reports-tier.md), [PDF contract](../prd/features/51-pdf-export.md) and [center inspection flow](../prd/flows/66-diagnostic-inspection.md). It does not approve their open operational decisions or establish a production implementation. The [center program](../prd/business/inspection-program.md) remains the scaling strategy; all stages remain center-based.

## Coverage

| Capability | Prototype behavior | Production work still required |
| --- | --- | --- |
| Requests and appointments | Requested, confirmed, arrived, in-progress, completed, cancelled and no-show states; pending versus confirmed labels | Center hours/capacity, timezone storage, idempotent requests, scheduling persistence and support process |
| Intake | Vehicle, mileage, date, commissioner, audience and listing reference | Real identity matching, manual exceptions and data minimization |
| Consent | Separate physical-access, publication and scope acknowledgments | Approved wording, evidence/signature custody, revocation/dispute policy |
| Service and payment | One plan; at-center payment record only | Approved scope/price/duration, receipts, cancellation/refund rules |
| Staff | Reception, assigned technician, separate reviewer and checklist manager; removed-access denial demonstration | Personal login, server scopes/assignment, elevation policy, audit and stale-session/media denial |
| Checklist authoring | Clone, add/remove/edit, section/title/instructions, optional evidence request, publish template version | Durable template workflow, approved mechanical methods, authorization and localization |
| Template pinning | Started drafts and finalized reports retain v1 when v2 publishes | Transactional consistency and historical template storage |
| Inspection results | Normal/Note/Fault/Not checked/Not applicable; explicit result required; skipped scope needs explanation | Qualified operator validation, backend enforcement and approved incomplete-report policy |
| Body assessments | 17 named prototype panels, assessed/unchecked status, reasons and zero-or-more findings | Approved panel catalogs, alternative body styles and complete physical scope |
| Vehicle diagram | Five original generic orthographic views, named hotspots, panel-list alternative | Production component/accessibility integration; model-specific or body-style asset policy |
| Findings | Stable IDs, current damage versus repair evidence versus attributed history | Approved terminology, thresholds and history evidence rules |
| Measurements | Value/unit/method and uncertainty in notes | Equipment calibration, material compatibility and validated methods |
| Evidence | Local sample image selection, per-check/per-finding references and explanatory absence | Scoped upload adoption, image processing, retries, protected storage, retention and URL authorization |
| Draft handling | In-tab memory and explicit local-save wording; illustrative auto-fill only on an empty draft | Autosave, reconnect/restart recovery, concurrency and optimistic conflict handling |
| Review | Completeness issues, full draft preview, return reason and technician resubmission | Approved review separation and audit, transactional finalization |
| Finalization | Content copied into an immutable snapshot; draft editing blocked | Append-only durable records and backend invariants |
| Audience | Buyer A/public seller paths; Buyer B and seller denial for buyer-private reports | Real authorization, metadata/cache isolation, private evidence/PDF access |
| Report reader | Complete results, findings, explicit panels, missing scope and evidence; no internal reviewer reason or customer contacts | Native/web delivery integration and approved privacy fields |
| PDF readiness | Pending/failed/retry/ready simulation for the same snapshot | Server generation, real artifact identity/storage, verified download and job recovery |
| Print | Browser print/save control uses the selected snapshot; staff UI hidden, draft/demo labels | Actual printer/PDF pagination, page headers, all-locale render verification and stored issued artifact |
| Corrections | Linked successor preserves original date, mileage, checklist and audience; earlier snapshot retained | Approved correction notifications, previous-version visibility and dispute rules |
| Reinspection | New appointment and renewed authorizations, arrival, latest template and empty results; prior snapshots kept | Vehicle freshness/transfer policy, staff custody and booking orchestration |
| Withdrawal | Reason and unavailable reader; immutable report content retained | Approved withdrawal authority, legal retention, dispute and customer messaging |
| History | Multiple finalized report snapshots with mode, date, mileage and template versions | Durable archive, retention/access rules, search and operational reporting |
| Design | Geist/Geist Mono roles, native warm page/white groups, tonal controls and black actions; responsive layouts | Native safe areas/text scaling/screen-reader checks and admin application integration |
| Localization | English workspace with draft Turkmen check content; existing Turkmen report samples retained | Approved EN/RU/TK workflow and technical translations |

The prototype is complete for review of these workflows. It is not launch-ready software and does not include production integrations. Some proposed gates can be changed after review without changing the agreed dealer/listing direction.

## Reviewable operating assumptions

- Cars arrive at the center before technicians start. Reinspection repeats intake/authorization and arrival.
- The demo requires a separate reviewer and explicit check/panel outcomes. That is a conservative prototype proposal; staff policy is not settled by this artifact.
- An explicitly assessed panel can have zero findings. Empty drawings never imply a pass.
- Missing required evidence can be explained in this demo. The center must decide which missing evidence should block real finalization.
- Finalization makes the authorized reader available while PDF preparation is tracked separately. The exact production public-release transaction still requires agreement.
- Corrections retain the original observation date and audience. New physical inspection requires a new date/mileage and starts empty. Private-to-public conversion is absent.
- Withdrawal prevents reader access in the demo but does not erase snapshots or revoke already exported copies. Exact historical visibility and dispute behavior remain open.
- Roles and recipients are local switches. A production worker portal must not expose private reports through its client payload, public routes, guessed identifiers or image URLs.

## Suggested implementation order

1. Reconcile target decisions with ADR-0037/0057 and agree worker authorization, report audience and snapshot ownership. Formalize the open policy details needed for the first issue batch.
2. Implement template versioning, service order and report lifecycles with domain/application behavior checks and migrations.
3. Add staff intake, scoped assignment, draft checklist and body findings with evidence adoption/recovery.
4. Add review/finalization and immutable snapshots, then audience-protected reader and stored PDF generation.
5. Add corrections/reinspection/history, audit, failure recovery and full privacy/integration verification.
6. Integrate optional service entry/report display into the existing personal/dealer listing flow without changing its seven-step publishing wizard.
7. Complete mechanic capability validation, center readiness, scope/price/terms and localized output before enabling real service requests.

Dealer access stays free. Existing ranking remains unchanged. No extra dealer app, traveling inspector, online payment or additional inspection tier is introduced. Detailed mechanics feedback can refine versioned templates while software preparation continues.

## Verification record

See the prototype's [browser verification notes](../../output/inspection-workspace-prototype/verification.md). Evidence applies to the local throwaway artifact, not to production backend, security, native runtime or issued PDF generation.
