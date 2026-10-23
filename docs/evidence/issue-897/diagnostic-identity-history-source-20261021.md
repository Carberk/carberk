# Immutable visit identity history source checkpoint

Source GREEN slice #914 within #897, sole integration PR #904. Base `880a9b21aacf394298233dd03dbc556be523f6d0`, where root observed hosted behavioral RED (PR Checks 39616930726, API job 119280517045: [DiagnosticIdentityHistory.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityHistory.e2e.spec.ts) line 102 expected 200, got 404). Reservation `agent/issue-914-identity-history-source-20261021` was pushed at the base before edits. Implements only the [RED checkpoint](diagnostic-identity-history-red-20261021.md) contract under [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md).

## Changes

- Forward migration `20261021110000_diagnostic_identity_records`: table `diagnostic_identity_records` with unique `(orderId, orderVersion)`, order FK cascade, recorder FK set-null, and a content CHECK (live rows carry observation plus 64-hex hash; erased rows carry neither). Trigger `diagnostic_identity_record_immutable`: INSERT must match the live order's resulting version and current `observedVehicle`; UPDATE cannot change id/order/version/recordedAt or live content, may only erase content once or detach the recorder; DELETE refuses while the order exists. No backfill: legacy observations stay without records.
- `observeVehicle` appends one record in the same locked transaction with the resulting version, a SHA-256 binding over a versioned canonical tuple, recorder and runtime clock. Stale/refused writes throw before any write. `observedVehicle` still holds the newest observation.
- `GET /api/v1/diagnostics/orders/:id/identity-records` (`no-store, private`) returns the bare strict array ordered by `orderVersion`. Access uses the existing `staffScope`/`DiagnosticAuthority.order` path, rechecking session, grant, qualification, assignment and erasure per read; commissioner, admin and unassigned staff receive the existing uniform 403.
- Account erasure clears record content and recorder for the commissioner's orders before order erasure, and detaches a deleted staff recorder elsewhere.
- Clean-reset manifest gains the table (`delete`) and trigger; reviewed schema profile, retained SQL copy and a focused schema invariant test follow the existing pattern. Campaign v3 journals and reset operations are unchanged.

## Evidence and limits

- PASS: Prisma validate/generate and offline schema diff (inert URL `postgresql://127.0.0.1:1/typecheck_only`, no connection); TS7 and TS6 for API and worker; contracts and db typecheck; targeted ESLint zero warnings; `node --test 'scripts/*.test.mjs'` 577 pass, 0 fail; `git diff --check`.
- Hosted test byte-unchanged: blob `75852a6e5b8936bb28039f1a104adbc6ba9b6a86` equals base.
- NOT RUN: any HTTP/database suite, Docker, local services, CI. Hosted GREEN and trigger behavior against PostgreSQL are root's later milestone. The three retained historical reset-tail failures are untouched.
- Remaining, explicitly incomplete: pair-bound proof issuance/consumption, comparative cross-visit reads, transfer admission, survival/erasure acceptance in the purge suite, and real-service purpose/rights/hold enforcement before any real collection. Real intake stays closed.
