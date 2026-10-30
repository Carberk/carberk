# Diagnostic reinspection contract proposal

Docs-only design handoff for #914 under #897 / #907 / PR #904. Exact base `0101654de40ecaceae0254bb5ded01591db7968e`; reservation `agent/issue-914-reinspection-contract-20261021` was pushed at that base before edits. This note proposes a contract only. Root selects it before any source or test work.

## Required behavior and current gap

[ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md#L20) requires new inspections to record new observations and [acceptance](../../adr/0104-center-diagnostics-with-private-and-public-reports.md#L40) to exercise reinspection/history. [Feature 50](../../prd/features/50-reports-tier.md#L106) and [flow 66](../../prd/flows/66-diagnostic-inspection.md#L99) require a linked new snapshot with its own date/mileage, preserved old snapshots, and the original audience. [Flow 66](../../prd/flows/66-diagnostic-inspection.md#L69) excludes reusing another commissioner's snapshot.

`correct` ([domain](../../../apps/api/src/modules/diagnostics/domain/DiagnosticReport.ts#L107), [HTTP](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L155)) needs a finalized predecessor. It copies findings, date and mileage onto the **same order and template**. `reinspect` ([domain](../../../apps/api/src/modules/diagnostics/domain/DiagnosticReport.ts#L113), [spec](../../../apps/api/src/modules/diagnostics/domain/DiagnosticReport.spec.ts#L65)) needs a finalized or withdrawn predecessor and a **different order**. It starts with empty findings and takes the new date, mileage and template. Nothing persists or routes it.

## Same-order assumptions that reject or leak

1. The [trigger](../../../packages/db/prisma/migrations/20261015190000_diagnostic_reports/migration.sql#L130) requires `p.orderId = NEW.orderId`. A cross-order insert raises `diagnostic_correction_audience`. **The existing schema cannot represent the link; a migration is required.**
2. The [partial unique index](../../../packages/db/prisma/migrations/20261015190000_diagnostic_reports/migration.sql#L148) and the [`create` existence check](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L72) cover only `predecessorId IS NULL`. Without a change, the new order could hold both an original report and a reinspection report.
3. The [evidence walk](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L96) denies any predecessor on another order. It would refuse every save, submit and finalize, even with no evidence.
4. [Private](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticEvidence.ts#L72) and [public](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticPublic.ts#L50) evidence reads require the reader's order. Keep this rule: it stops evidence carrying across.
5. `supersededBy` ([staff/commissioner](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L49), [public](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticPublic.ts#L41)) and the [public latest selector](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticPublic.ts#L20) already work across orders on the same Listing. The selector never falls back to an older report. `forOrder` lists only one order. Lineage navigation uses `successorOf`/`supersededBy` alone.
6. [Web](../../../apps/web/src/diagnostics/Reader.tsx#L9) and [mobile](../../../apps/mobile/src/diagnostics/DiagnosticReader.tsx#L27) readers label every successor as a correction and show `correctionReason`, which the domain reuses for the reinspection reason.
7. [Erasure](../../../apps/worker/src/jobs/diagnosticAccountErasure.ts#L15) fences reports one commissioner's orders at a time. It nulls `listingId`/`commissionerId` on erased orders. A cross-order check that runs on UPDATE would then permanently block writes to a surviving successor.
8. [Private intake](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts#L64) accepts any Listing without an ownership check. Buyer B can therefore hold a private order for the same car. Order equality on the Listing alone must never link private lineages.

## Proposed contract

| Element | Proposal |
|---|---|
| Route | `POST /api/v1/diagnostics/orders/:id/reinspections`, `Cache-Control: no-store, private`. `:id` is the new order. |
| Input | New strict `DiagnosticReinspectionSchema`: `{ reportId: uuid, predecessorId: uuid, expectedOrderVersion: int≥0, reason: trim 1..1000 }` |
| Result | 201 with the existing `DiagnosticReportRecord`: draft, `successorOf=predecessorId`, the new order's `templateVersionId`, observation, `findings: []` and `correctionReason=reason`. |
| Authority | Current technician assigned to the new order, which then authors the report. No predecessor access is granted. A different qualified reviewer still finalizes public reports. |
| Preconditions | The new order is arrived, has physical authorization and its own observation, and has no first report. The predecessor is finalized or withdrawn, not erased, on a different order, with the same audience and no successor. **Private:** both orders have the same non-null commissioner. **Public:** both orders have the same Listing, and the new order has publication consent and a validated association. |
| Errors | 403 `DIAGNOSTIC_NO_ACCESS`, uniform for predecessor missing, erased, other commissioner, other Listing or other audience. 400 `DIAGNOSTIC_OBSERVATION_REQUIRED` / `REPORT_REINSPECTION_REQUIRED`. 409 `DIAGNOSTIC_STALE_VERSION`, `DIAGNOSTIC_REPORT_EXISTS` or `DIAGNOSTIC_REINSPECTION_CONFLICT`, through the existing [code mapping](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReportsController.ts#L33). |
| Idempotency | An existing `reportId` with the same order, predecessor, reason and author returns the existing record without writes. Any other match is a conflict. A concurrent correction and reinspection race on the unique `predecessorId`, and the loser maps to a conflict. Existing `correct` then reports `DIAGNOSTIC_CORRECTION_CONFLICT`. |
| Atomicity | One transaction. Lock Listing (public), then both orders in id order, then the predecessor report `FOR UPDATE`. Insert the report and a `REPORT_REINSPECTION_CREATED` audit on the new order with `{ predecessorId, predecessorOrderId, reason }`: 2 records, 2 events. |
| Migration | Add `diagnostic_reports.reinspection BOOLEAN NOT NULL DEFAULT false`; no backfill or nulling. Redefine the trigger: identity immutability includes `reinspection`. On INSERT only, a reinspection requires the predecessor on another order, same audience, with a snapshot, and the private-commissioner or public-Listing equality above. Non-reinspection rows keep the same-order rule. Replace the index with `UNIQUE ("orderId") WHERE "predecessorId" IS NULL OR reinspection`. |
| Evidence | The walk stops at a `reinspection` row. A later correction of the reinspection may reuse that report's evidence, never the evidence of earlier orders. |
| PDF / listing | Finalizing creates three new artifacts. Old artifacts and snapshot bytes stay unchanged. The public badge moves to the new release. Withdrawing it removes the badge with no fallback. The old report is still readable under its own gates and shows `supersededBy` once the new report is released. |

GREEN changes:
- a new migration, with `schema.prisma`, a new [retained-schema profile hash](../../../scripts/staging-schema.mjs#L34), a retained SQL copy and a bytes test;
- the contract schema/type in `packages/contracts/src/schemas/diagnostics.ts`;
- `DiagnosticReportsPort.reinspect`, `PrismaDiagnosticReports` (`reinspect`, `create` first-report check, evidence boundary) and the controller route;
- an update to the diagnostics `CONTEXT.md`.

The domain needs no change. Migrating staging is a gated operation.

## Implementation choices versus root decisions

Ordinary implementation choices: lock order; the audit shape; uniform 403 for a mismatch; refusing an observation dated earlier than the predecessor's (domain already does this).

Root decisions:
- **D1, linking authority.** Staff link at draft creation (proposed, smallest) or a commissioner-declared intake field (an order column plus a `DiagnosticCreate` change)?
- **D2, vehicle continuity.** The proposal requires equal VINs when both observations used VIN. What links manual or changed identity?
- **D3, public commissioner.** Any current Listing publisher (proposed), or the predecessor's commissioner only?
- **D4, reader labels.** Should readers distinguish reinspection from correction? That needs an additive contract field and approved TK/RU/EN copy.
- **D5, staff visibility.** Should staff on the predecessor order see the successor id?

## Test evidence

**RED (test-only, hosted `pnpm test:api`).** Extend the [HTTP/PostgreSQL/storage suite](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReports.e2e.spec.ts#L93). Split its `draft` helper so it can create a second order on the same Listing. Release a public predecessor, then put a new order through intake, consent, arrival and a later observation. Expected positive 201 on the route above. Predicted failure: 404, route absent; not executed. It must not insert reports directly.

**GREEN assertions through public boundaries:**
- matching retry: same body and no new audit; changed reason: 409;
- same-order request: 400;
- Buyer B's private order naming A's report: 403, no rows;
- a private order naming a public predecessor, and the reverse: 403;
- a second reinspection, or a correction afterwards: 409;
- a `create` on the new order: 409 `EXISTS`;
- saving a predecessor `evidenceId`: 400 `REPORT_EVIDENCE_UNAVAILABLE`;
- the author cannot finalize a public report;
- public availability returns the new id/date/mileage; the old reader shows `supersededBy`;
- old and new artifacts are separate rows, each with its own `snapshotHash`; withdrawing the new report gives 404 with no fallback;
- a private lineage: A reads both, B and the owner get 403 on reader/PDF/evidence;
- in `PurgeExpiredAccounts.e2e.spec.ts`: erasing the public predecessor's commissioner leaves the reinspection successor writable.

Domain tests alone prove none of this.

## Joined acceptance lineage and lower bound

The journey is separate from the existing public correction/template/withdrawal chain, which stays unchanged. In one reservation: predecessor release → new physical order → reinspection link → new release → history and audience proof. No reset between steps and no reference into another reservation. Costs use the [operation ledger](../issue-901/full-v3-diagnostics-graph-plan-20261020.md#L84). Each order costs intake 3 + two assignments 4 + consents 1–2 + appointment 2 + observation 1 + draft 2 + submit/finalize 5.

| Option | Lower bound (records) | Notes |
|---|---|---|
| Private lineage joined to the private reservation: buyer-a v1 → buyer-a reinspection with audited self-review | 74 auth + 7 setup + 18 + 18 + F₁+F₂+E₁ ≥ **120**; ≥ **122** with return/resubmit moved there | Does not prove the public badge switch in deployment. |
| Public lineage as its own reservation, [mapping D](../issue-901/full-v3-diagnostics-capacity-disposition-20261021.md) | 70 auth + 5 center + 2 template + Listing 7 + C 2 + 19 + 19 + 3 ≥ **127**; ≥ **129** with template v2 | Under mapping M: ≥ **140**. |

These bounds do not prove fit with 128. Unknown: the bootstrap audit, real F/E from the validated template, PDF retry, failed and resend flows, and reset events. Actor mapping and qualification bootstrap remain unapproved, as in the capacity note. **D6:** choose the deployed lineage (private, public or both). Hosted e2e covers the public cross-order semantics either way.

## Checks

Only this file changed. Offline only: `git diff --check`, `pnpm check:agent-docs`, a local link/line existence check and a single-path diff review. No tests, services, staging, CI, agents or GitHub mutations were run.
