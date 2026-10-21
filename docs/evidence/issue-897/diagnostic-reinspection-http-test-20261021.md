# Diagnostic reinspection HTTP test (RED handoff)

Test-only slice for #914 under #897 / PR #904. Parent local base `644f590145b8f1390e33f613aaa8051e76a261e6` (descends from origin integration `0101654d`). Reservation `agent/issue-914-reinspection-http-tests-20261021` was pushed at that base before edits. No source, contract, schema or migration changed. It implements no part of the [contract proposal](diagnostic-reinspection-contract-20261021.md); that proposal only supplies the route and body under test.

## Seam

This is the existing [HTTP/PostgreSQL/storage suite](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReports.e2e.spec.ts). It is required by [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md) and by the correction, reinspection and history acceptance in [feature 50](../../prd/features/50-reports-tier.md) and [flow 66](../../prd/flows/66-diagnostic-inspection.md). The new case is `releases a public reinspection from a new physical visit without inheriting findings, evidence or the old snapshot`.

Every report, order, template, consent, observation, finding, evidence upload and transition goes through public HTTP. The case inserts no reports and adds no fixture bypass. It reuses the suite's existing direct setup conventions: users, sessions, staff grants, center assignments, catalog and a Listing row. The only addition to that setup is the Listing's `vin`. Direct database reads cover only released snapshot bytes and PDF artifact rows, as in the existing correction test. To make the later release deterministic, the case moves the injected `DIAGNOSTIC_RUNTIME.now` port to a later date with `vi.spyOn`. It restores the port in `finally`. Suite setup, `draft`, `readyDocument` and existing cases are unchanged. Full-v3 is not touched.

## Literal journey

The identity positive is unambiguous. The case uses the same Listing `suite.id("public-car")`, the same commissioner `buyer`, who is also the seller, and Listing VIN `SYNTHVIN000000914`. Both public observations use `method: "vin"` with that VIN. Each public order records its own fresh physical authorization and publication consent.

1. Predecessor A: template v1 (`definition`) → public order → observation `2026-09-18T00:00:00.000Z`, 118000 km. Sanitized JPEG evidence is uploaded for a `fault` finding `worn`. Then submit, and independent reviewer finalize. Availability returns A. A's `snapshot`, `snapshotHash` and PDF artifact rows are captured.
2. Template v2 is published with title `{tk:"Gaýtadan", ru:"Повторная", en:"Reinspection"}`. The runtime clock moves to `2026-10-25T00:00:00.000Z`. Order B goes through new intake, assignments, physical consent, publication consent, confirmed/arrived and observation at that date with 123500 km.
3. **First request:** technician `POST /api/v1/diagnostics/orders/:B/reinspections` with `{ reportId: <uuid>, predecessorId: A, expectedOrderVersion: B.version, reason: "Scheduled reinspection after brake service" }` → **201**, `cache-control` contains `no-store`. The body matches `orderId: B`, `audience: "listing_public"`, `status: "draft"`, `templateVersionId: v2`, `observedAt: 2026-10-25T00:00:00.000Z`, `mileageKm: 123500`, `findings: []`, `authorId: technician`, `reviewerId: null`, `successorOf: A`, `correctionReason: reason`, `finalizedAt: null`, `template: v2 definition` and `supersededBy: null`.
4. Current authority: `reception`, `reviewer` (both assigned to B), `buyer` (commissioner), `other` and `admin` each send the same request with a fresh `reportId` → 403. The technician's `GET orders/:B/reports` then lists exactly `[reinspection]`.
5. Before release, availability still returns A, and public `reports/:reinspection` returns 404.
6. No inherited evidence: saving the predecessor's exact finding `worn` (same finding id and evidence id) on the reinspection returns 400 `REPORT_EVIDENCE_UNAVAILABLE`. The draft still reads `version: 0, findings: []`.
7. Ordinary authoring: save a `normal` finding (v0), submit (v1), author finalize → 403, reviewer finalize → 201.
8. Availability is exactly `{ listingId, reportId: reinspection, observedAt: 2026-10-25…, mileageKm: 123500, synthetic: true }`. The public reinspection reader shows `finalized`, the new date and mileage, `findings: [serviced]`, `successorOf: A`, the v2 template and `supersededBy: null`. The public A reader keeps `2026-09-18…`, 118000 km, `findings: [worn]` and the v1 template, and shows `supersededBy: reinspection`.
9. A's `snapshot` and `snapshotHash` are unchanged, and its PDF artifact rows are deep-equal to the captured rows. The reinspection has its own three `pending` artifacts (en/ru/tk), and none carries A's hash.
10. Audience refusal: a `buyer_private` order C for the same commissioner and Listing goes through arrival and a VIN observation. Its technician names the released public reinspection as predecessor → 403. `GET orders/:C/reports` returns `[]`.
11. A reviewer withdraws the reinspection (v3). Availability → 404, with no fallback to A. The public reinspection reader → 404. The commissioner's private read shows `withdrawn`.

## Predicted first RED

On hosted `pnpm test:api`, the failure should be at step 3: `expected 201 "Created", got 404 "Not Found"`, because the route is absent. Steps 1–2 use only existing routes that the current suite already exercises, so a setup or auth failure there would be a separate defect. This prediction has not been executed. Root owns the hosted RED after assembly.

## Offline checks

| Command | Result |
|---|---|
| `git merge-base --is-ancestor 0101654d HEAD` | ancestor confirmed |
| `DATABASE_URL=<dummy, unused> pnpm --filter @auto-tm/db generate && pnpm --filter @auto-tm/db build` | generated the client locally, no connection |
| `pnpm --filter @auto-tm/api typecheck` | pass |
| `pnpm exec eslint --max-warnings 0 <spec>` (apps/api) | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm exec vitest list <spec>` (apps/api) | 13 cases collected, including the new case |
| `pnpm check:agent-docs`; `git diff --check` | pass; clean |

No Docker, services, integration tests, staging, Railway or CI were run.

## Limitations and open decisions

- **Not resolved here, and not restricted in production by this test:** manual or changed vehicle identity matching (D2), ownership transfer and public commissioner identity (D3), and full-v3 deployed capacity and lineage choice (D6). The case proves only the VIN-equal, same-commissioner, same-Listing positive.
- Also open: linking authority (D1; the test assumes the staff-link route from the proposal), reader labels for reinspection versus correction (D4), and predecessor-staff visibility of the successor (D5).
- Proposal assertions intentionally left out of this bounded slice: idempotent retry and changed-reason 409; same-order 400; Buyer B private cross-commissioner 403; private predecessor named by a public order; a second reinspection or a later correction 409; `create` on the new order → `DIAGNOSTIC_REPORT_EXISTS`; private-lineage reader, PDF and evidence gates; and account-erasure survivability in `PurgeExpiredAccounts.e2e.spec.ts`.
- The audience refusal names the released public reinspection, which has no successor, so 403 does not depend on how a conflict check is ordered. The authority refusals run after creation and expect 403 before any 409, which means authority must be checked before state.
- The reinspection's `template` and `templateVersionId` are asserted from the new order's pin. They are not asserted from the predecessor.
