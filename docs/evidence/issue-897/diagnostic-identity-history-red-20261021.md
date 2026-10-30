# Immutable visit identity HTTP test checkpoint

Test-only slice #914 within #897, sole integration PR #904. Parent/base `1af313305375a9df1cda3f0700b9400aca1692de`, containing accepted [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) and its [approved handoff](diagnostic-continuity-approved-implementation-20261021.md). Founder/parent authorized this HTTP seam and autonomous test implementation. Reservation `agent/issue-914-identity-history-red-20261021` was pushed at the base before edits. Host isolated worktree reused; scaffold `t3/issue-914-identity-history-red` remains at the base.

One new [joined HTTP spec](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityHistory.e2e.spec.ts) uses existing `defineE2eSuite`, `cleanSuiteFixtures`, `bullTestRoot`, real DiagnosticsModule, Prisma and identity authority. Session/grant/qualification fixtures and clock/synthetic-runtime overrides follow DiagnosticReports.e2e.spec.ts. No collaborator mocks, direct identity-history database assertions or new Prisma model imports. Order, template, authorization, arrival, observations and assignment revocation use HTTP. No report or storage object is needed. Existing tests remain byte unchanged.

## Chosen wire contract for the source writer

`GET /api/v1/diagnostics/orders/:id/identity-records` takes the existing bearer Session. Current qualified staff assigned to this order may read, following existing order/workspace authority. Commissioner status and marketplace admin role alone confer no access. This is a single-visit read; comparative cross-visit access and proof operations remain separate work.

Success is HTTP 200 with `Cache-Control: no-store, private` and a bare array. Each record has exactly these fields:

```json
{
  "id": "<stable record UUID>",
  "orderId": "<this order UUID>",
  "orderVersion": 7,
  "observationHash": "<64 lowercase hexadecimal SHA-256 binding>",
  "observation": {
    "observedAt": "2026-10-17T10:00:00.000Z",
    "mileageKm": 123000,
    "method": "manual",
    "manualReference": "Synthetic chassis fixture A, initial reading",
    "vin": null
  },
  "recordedBy": "<observing technician UUID>",
  "recordedAt": "2026-10-18T00:00:00.000Z"
}
```

`orderVersion` is the resulting version returned by the successful existing `POST orders/:id/vehicle`, not its expected input version. The example version is illustrative; the test uses the returned version. Return records in capture order, ascending observation-write order version, even when recording times tie. Each successful observation appends one record. Original fields, id and hash survive correction and rereads unchanged; corrected content has a distinct id/hash. The hash canonical encoding is an implementation choice, not recomputed by this test. The existing order's `observedVehicle` stays the newest observation. A stale observation write returns 409 and changes neither history nor the current observation.

Refuse nonassigned but qualified staff, the commissioner, marketplace admin and another user with uniform HTTP 403 for existing and nonexistent order ids. The exact existing GlobalErrorFilter envelope is `{ statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed", timestamp: <string>, requestId: "unknown" }` for this harness. No additional history fields. Recheck assignment on each read: the original technician JWT loses access immediately after reception revokes the assignment through HTTP, while the assigned reviewer still reads unchanged history.

All identity and provenance values are synthetic fixture references. This checkpoint grants no rights, retention duration or real-service admission. No fabricated/backfilled history or proof is requested. Proof issuance, consumption, transfers, cross-visit comparisons and deeper ADR-0108 invariants are outside this slice.

## Evidence and checkpoint gate

- PASS: targeted ESLint with zero warnings; API TypeScript 7 `typecheck`; API TypeScript 6 `exec tsc6 --noEmit`; `git diff --check`.
- Initial typecheck found absent compiled workspace dependencies in the fresh worktree. Built unchanged contracts and db prerequisites. Prisma generation needed a config URL; used inert `postgresql://127.0.0.1:1/typecheck_only`, without credentials or any database connection/execution. No tracked generated files changed.
- Docs: not applicable, existing repository interfaces and fixture conventions only; no dependency changes.
- NOT RUN: HTTP/database execution. Root collects hosted RED after assembling the batch, using the established disposable PostgreSQL/Redis harness. Target command in that environment: `pnpm --filter @auto-tm/api test src/modules/diagnostics/presentation/DiagnosticIdentityHistory.e2e.spec.ts`.
- Expected first behavior RED: the first technician history GET's `.expect(200)` after a successful HTTP 201 physical observation. The supplied base has no history route, so source inspection predicts HTTP 404. This is a prediction, not observed runtime RED. No missing schema/model/import is used to force failure.
- UNKNOWN until execution reaches them: append/correction immutability, exact values/order, stable ids/hashes, newest current observation, stale-write refusal, denial/no-leak matrix and revocation. The first read intentionally precedes correction so later reads can compare the original record's binding and entire content.

No source, contracts, schema, migration or existing test edits. No local services, Docker, database suite, live Railway, credentials, CI dispatch/poll, GitHub content mutation, PR or subagent. Stop at the pushed test checkpoint. Source GREEN must wait for root's actual hosted behavior RED.
