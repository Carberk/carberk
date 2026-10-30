# A-02 worker-first refusal status dependency — OPEN

The offline ordinary-route audit found two more incompatible selectors. The
worker stopped these dependent implementations without editing any existing
test or production path. No runtime or HTTP request was made.

The unchanged batch suite's early-refusal branch and opponent assertion
(`DiagnosticWorkerOwnershipBatch.e2e.spec.ts:267,280–281`) require HTTP 409
after worker-first capture or proof use, while requiring ordinary acceptance
before expiry for the reverse ordering.

| Boundary | Current source behavior at/after declared expiry |
|---|---|
| Classified vehicle capture | `DiagnosticOwnershipCapture.classification` rejects `rights.schedule.until <= now` as `DIAGNOSTIC_INVALID_INPUT`; `DiagnosticIntakeController.run` maps it to HTTP 400. Omitting classification does not preserve the classified request and expired grant admission returns `DIAGNOSTIC_NO_ACCESS`, HTTP 403. |
| Proof consumption | `PrismaDiagnosticContinuityProofs` uses `denied()` (`DIAGNOSTIC_NO_ACCESS`) for expired/missing proof and stale source-plan recovery. `DiagnosticReportsController.run` maps that code to HTTP 403. |

The coordinator read back classification, planned capture, both controller
mapping functions and expired-proof refusal. This is source diagnosis, not
runtime acceptance. No request-body substitution was found that honestly
preserves both success-before-expiry and this suite's fixed 409-after-expiry.
Stale/conflicting command input cannot stand in for expiry refusal.

The historical continuity contract distinguishes uniform privacy denials from
version/conflict failures (`diagnostic-reinspection-contract-20261021.md:31,48`),
but that document alone is not a new product decision for these exact cases.
The coordinator/Parent must reconcile the intended refusal criterion before a
separately bounded assertion or production repair. Exact affected paths are
the batch spec, both diagnostic controllers, `DiagnosticOwnershipCapture.ts`
and `PrismaDiagnosticContinuityProofs.ts`; all remain read-only in this worker.
No generic accepted-status set, weakened assertion or status-only PASS is
authorized. Byte/row/receipt closure, no delivery and both orderings remain
required.

The new producer will fail closed before connecting or writing fixture output
for `overlimit`, `worker-first-capture` and `worker-first-proof-use`. Other
case preparation continues, with native startup/beforeAll/barrier timing
explicitly unproved. A-02 remains FAIL/open and cannot pass with these cases
skipped. Ordinary fixture production remains authorized; permission is not the
blocker. No foreign65379, DB, service, storage or hosted resource was touched.
