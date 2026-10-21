# Diagnostic reinspection source slice

Source/schema/contract slice for #914 under #897 / PR #904, 2026-10-21. Base `83742f07223ffb21b13d11bec479bf19a5e7ee63`. Reservation `agent/issue-914-reinspection-source-20261021` was pushed at that base before edits. It implements the [green slice plan](diagnostic-reinspection-green-slice-plan-20261021.md) under root's explicit selection of the incremental equal-VIN, same-Listing, same-public-commissioner path. That path is **temporary implementation progress, not the release admission policy**. D2 and D3 still block final acceptance.

## Scope selected by root

- D1: the new order's currently assigned technician links the predecessor when creating the draft. No predecessor read, edit, download or browse authority is granted.
- D5: minimum disclosure. A cross-order successor id is projected only when the successor is independently publicly available, or when the reader is the successor order's own current commissioner. Assignment to the predecessor order alone discloses nothing. Draft successors are never disclosed.
- Admission: both orders `listing_public`, same Listing, same non-null commissioner, and both current observations `method: "vin"` with equal trimmed uppercase VINs. Everything else gets a uniform 403. This includes private lineages, manual or changed identity, and a different commissioner. These refusals are **deferred decisions, not coverage**.

## Changes

| Area | Change |
|---|---|
| Contract | `DiagnosticReinspectionSchema` `{ reportId, predecessorId, expectedOrderVersion, reason }`, strict. |
| Port / route | `DiagnosticReportsPort.reinspect`; `POST /api/v1/diagnostics/orders/:id/reinspections` returns 201 with `Cache-Control: no-store, private`. |
| Persistence | `PrismaDiagnosticReports.reinspect` runs one transaction. Unlocked discovery only picks lock targets, then locks in this order: identity, public Listings by id, both orders by id, current B technician authority, predecessor report. Every relationship is re-read after locking. B's technician authority is checked before any retry or state result. A matching retry (kind, order, predecessor, reason, author, not erased) returns the existing record with no second write. Any other id match → 409 `DIAGNOSTIC_REINSPECTION_CONFLICT`. Then: stale version → 409; missing observation → 400; first report exists → 409 `DIAGNOSTIC_REPORT_EXISTS`; predecessor or continuity mismatch → 403; predecessor already succeeded → 409 conflict; B's current publication association is checked; the domain `reinspect` applies. A `P2002` on insert → 409 conflict. One `REPORT_REINSPECTION_CREATED` audit is written, on B only. |
| `create` | The first-report check covers originals and reinspections. A retry returns only an original (`predecessorId` null). |
| `correct` | A retry matches only a same-order, non-reinspection successor. An existing reinspection gives `DIAGNOSTIC_CORRECTION_CONFLICT`. Same-order correction inheritance is unchanged. |
| Evidence | The walk includes a reinspection and stops there. A correction of a reinspection reuses that visit's evidence, never an earlier order's. Private and public evidence reads stay bound to the requested report's own order. |
| Projection | `DiagnosticReportAccess.successorId` serves staff/commissioner and public readers. `loadPublic` now applies the same gate through a lock-free `publiclyAvailable` after taking its existing locks. The projection takes no new locks, so no multi-order lock path is added. Stored lineage, snapshots, hashes and PDF bytes are untouched. |
| Migration | New forward-only `20261021100000_diagnostic_reinspection_lineage`. It adds `reinspection BOOLEAN NOT NULL DEFAULT false` (no backfill), a CHECK requiring a predecessor, and the identity-immutability row including `reinspection`. Reinspection continuity is checked on **INSERT only**. Existing rows keep the same-order correction rule unchanged. The index `diagnostic_report_original_order` is replaced by `diagnostic_report_first_order (orderId) WHERE predecessorId IS NULL OR reinspection`. The old migration is not edited. Retained SQL copy, profile addition, schema hash `bfc19cf8…` and inventory are added, plus `scripts/diagnostic-reinspection-schema.test.mjs`. The INSERT guard encodes the temporary admission and must be replaced by a later forward migration once D2/D3 are decided. |
| Overview | `apps/api/src/modules/diagnostics/CONTEXT.md` records the cross-order constraint and the temporary admission. |

## Tests

The joined case `releases a public reinspection from a new physical visit…` is unchanged; the spec diff against base is insertion-only (59+/0−). One focused case is added: `retries a reinspection link exactly, refuses conflicting links and keeps each visit's evidence and successor disclosure separate`. It covers:

- exact retry with no second audit;
- changed reason, stale version, a second first report, and `create` on B, all 409;
- no draft successor disclosure;
- correction of A naming the reinspection id, or a new id, → `DIAGNOSTIC_CORRECTION_CONFLICT`;
- a consumed predecessor named by a third public visit → 409;
- authoring B after A's order is reobserved manually, which proves continuity is not rechecked on UPDATE;
- a correction of the reinspection that reuses B's evidence and refuses A's;
- after B is withdrawn, the public and staff A readers drop the successor id while B's commissioner still sees it.

RED: hosted run `39534489428` on `46f9ab8a` recorded 201 expected / 404 received for the joined case ([green plan](diagnostic-reinspection-green-slice-plan-20261021.md)). On base `83742f07` the route is absent, so the focused case's first reinspection POST should also return 404. That is a prediction, not an execution. **GREEN is not executed.** The policy forbids local Docker/services, so neither e2e case has run against PostgreSQL/MinIO. The hosted `pnpm test:api` on the assembled candidate is required. Root reports that the current `83742f07` API job failed with its log still unavailable; the Support failure is separate.

## Commands (offline)

| Command | Result |
|---|---|
| `DATABASE_URL=<dummy> pnpm --filter @auto-tm/db build` | client generated, no connection |
| `pnpm --filter @auto-tm/api typecheck` (TS7), `apps/api/node_modules/.bin/tsc6 --noEmit -p tsconfig.json` (TS6) | pass |
| `pnpm --filter @auto-tm/contracts typecheck` | pass |
| `npx eslint --max-warnings 0 src/modules/diagnostics` (apps/api) | pass |
| `AUTO_TM_TEST_DATABASES=off npx vitest list <spec>` | both reinspection cases collected statically |
| `npx prisma validate` (dummy URL) | valid |
| `node --test scripts/*-schema.test.mjs` | 14/14 pass |
| `node --test scripts/staging-ledger.test.mjs` and selected profile tests | 10/10 pass |
| `pnpm check:agent-docs`, `git diff --check` | pass |

No integration run, Docker, staging, Railway, provider, GitHub write beyond the reservation push, CI dispatch or merge.

## Unresolved and remaining

- **D2** (manual/manual, manual/VIN, corrected VIN, changed Listing identity, private visits without a common Listing): refused. Needs a durable continuity proof and failure decision.
- **D3** (public commissioner/publisher change, ownership transfer): refused. Needs a policy decision.
- **D4** reader labels: readers still call every successor a correction. No contract field or copy has changed.
- **D5** broader staff visibility beyond minimum disclosure: not granted. B-assigned staff who also read A see the B id only while B is public.
- **D6** full-v3 deployed lineage/capacity: untouched.
- Private same-commissioner reinspection is refused in this slice. The proposal's private-lineage reader/PDF/evidence cases and Buyer B refusal have not been exercised as positives.
- Worker erasure (`PurgeExpiredAccounts.e2e.spec.ts`) has no diagnostic coverage. In the admitted scope both orders share one commissioner, so erasure fences both together. The surviving-successor case appears only once D3 admits different commissioners. The UPDATE-only guard is proven here only through the HTTP reobservation case.
- Concurrency (correction-versus-reinspection race, concurrent identical links) follows the source lock plan but has no test.
- The admin workspace has no reinspection action. Only the HTTP route is delivered.
- Database-backed trigger tests (false cross-order insert refusal, discriminator immutability, first-report index) are not added. Static bytes tests cannot establish those runtime properties.
