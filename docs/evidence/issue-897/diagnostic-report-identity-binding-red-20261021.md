# Report identity binding RED checkpoint

Test-only predecessor slice for #914 within #897, sole integration PR #904. Base `42b07ffac9d4bf8148ba39eee75ef9f4aafa4add`. Reservation `agent/issue-914-report-identity-pin-red-20261021` was pushed at that base before edits, reusing the host worktree. No issue PR, source, schema, contracts, old tests or timeout changes.

Authority: accepted [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) and only the first predecessor in the [next RED contract](diagnostic-pair-proof-next-red-contract-20261021.md). The root supplied actual hosted foundation GREEN at published `a51bf6cf`: PR Checks `39622886246`, API job `119300813081`, DiagnosticIdentityHistory 1/1 PASS, worker 369/369, API 3066/3069 with three old reset tails. DB 370/371 has a separate clean-reset refusal diagnostic issue. Those results are supplied foundation evidence, not runs performed by this writer; this checkpoint leaves that issue untouched.

## Strict first-slice comparison contract

`GET /api/v1/diagnostics/orders/B/reinspection-comparison?predecessorId=A` returns 200 only for current staff independently assigned and qualified on both orders, with current grants and session. A is a report id; B is an order id. Both successes and refusals use `Cache-Control: no-store, private`.

The entire response has exactly these keys. Symbols represent values captured through HTTP in the fixture:

```json
{
  "predecessor": {
    "reportId": "A",
    "reportVersion": 3,
    "snapshotHash": "HA",
    "identityRecordId": "IA",
    "identityRecordHash": "HIA",
    "identity": {
      "observedAt": "2026-10-17T10:00:00.000Z",
      "mileageKm": 123000,
      "method": "manual",
      "manualReference": "Synthetic A initial observation",
      "vin": null
    }
  },
  "candidate": {
    "orderId": "B",
    "orderVersion": 9,
    "identityRecordId": "IB",
    "identityRecordHash": "HIB",
    "identity": {
      "observedAt": "2026-10-18T00:00:00.000Z",
      "mileageKm": 124000,
      "method": "manual",
      "manualReference": "Synthetic B independent observation",
      "vin": null
    }
  }
}
```

For this bounded predecessor, `identity` is exactly the existing retained observation object. There are no placeholder evidence arrays, invented provenance fields or implied manual attestation. Structured provenance and justified identity corrections need their later agreed capture contract. `manualReference` here supplies synthetic observation content only and establishes no continuity proof.

A's first draft selects IA from A order version 8. A receives another observation while the draft exists, at order version 9, then releases at report version 3, then receives another observation at order version 10. Comparison must still return IA/HIA and the literal original observation. Selecting identity at finalization or from mutable intake fails this contract. B uses its own latest retained observation IB/HIB at order version 9. Retained record ids and observation hashes are captured from the existing HTTP identity-history route after asserting its exact observation, version, actor and recording clock. HA is first captured by the authorized comparison read, checked for 64-hex format and compared unchanged on later reads; no ordinary report endpoint exposes it. The test does not recompute production hashes.

An editorial report correction created after both A reobservations inherits IA/HIA. After its release, comparison using its report id returns report version 2, its own snapshot hash and the same original identity pin. This checks same-visit report correction inheritance, not a justified physical-identity correction. Reading the original report's comparison still returns the original HA. The comparison read itself grants no eligibility decision or issuance rights and remains readable for the original after a same-visit correction.

## HTTP journey and coverage

[DiagnosticReportIdentityBinding.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReportIdentityBinding.e2e.spec.ts) uses real Nest, DiagnosticsModule, JWT guard, current sessions and PostgreSQL, following [DiagnosticIdentityHistory.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityHistory.e2e.spec.ts). Only clock and synthetic admission use the established deterministic overrides. Sessions, grants, qualification, users, center and a synthetic public Listing use the existing fixture boundary. Templates, intake, assignments, separate physical/publication authorization, arrival, observations, reports, findings, submit, finalize and corrections use existing HTTP operations. No internal repository module is mocked, no future generated model is imported, and no report, identity or proof records are manufactured or queried through Prisma. Scoped DB deletion is teardown only, including pending PDF metadata; no object upload/download or PDF rendering is needed.

One coherent journey covers:

- First positive comparison GET expects 200 only after A has released and been reobserved and B has its own retained observation. Both a reviewer and a technician assigned to both orders can read the exact strict result.
- Released ordinary staff, commissioner and anonymous public report responses remain unchanged after reobservation. Draft/released/correction report DTOs, report lists and successful public/commissioner readers contain none of the identity ids, hashes, manual references or restricted pin keys. B has no report after comparison.
- Correction inheritance preserves A's original identity while giving the correction its own report version and snapshot hash. No findings, contacts, PDFs or unrelated identity history enter the comparison result.
- B-only technician, A-only reviewer, B-only reviewer, commissioner, admin, outsider and unassigned qualified technician receive exactly the existing generic 403 envelope, apart from the variable timestamp. Real A, missing A and missing B disclose no protected facts. Authorized both-order staff also receive the same refusal for missing pairs.
- HTTP revocation of the reviewer's A assignment immediately denies the exact same JWT and live session, despite retained B authority. Another current both-order technician still succeeds.

Erased-pair refusal fixture is pending direction: no diagnostics erasure HTTP operation exists, and account deletion schedules a later worker purge. The writer requested permission for an order-only `erasedAt` fixture without touching report/identity/proof rows. No fake erasure or unknown-id substitution is claimed as erased-pair evidence.

Full structured provenance, justified physical-identity corrections, proof issuance/read/consumption, transfer admission, races and purge acceptance remain later slices. Public Listing equality in this fixture grants no continuity. No proof is issued and no reinspection is created.

## Verification and handoff limits

- PASS: offline frozen-lockfile dependency setup with lifecycle scripts disabled; contracts build; DB generate/build using inert `postgresql://127.0.0.1:1/typecheck_only`, with no connection; API TS7 `pnpm --filter @auto-tm/api typecheck`; focused ESLint with zero warnings; agent-doc and glossary gates.
- PASS: API TS6 `pnpm --filter @auto-tm/api exec tsc6 --noEmit`; local evidence-link existence checks. Staged diff whitespace check passed; inspected scope is exactly the two owned new files.
- An initial `pnpm --filter @auto-tm/api exec tsgo --noEmit` failed because this workspace's TS7 binary is named `tsc`. The configured typecheck then passed with TypeScript 7.0.2; this was a command-name failure, not a test or compiler diagnostic.
- NOT RUN: behavioral HTTP/PostgreSQL test, Docker/local DB, live services, Railway, credential access, CI dispatch/poll/wait, agents or GitHub content writes. Root owns hosted actual RED evidence on the assembled candidate. Predicted behavioral RED is the first comparison GET returning 404 rather than 200 because the route is absent at this base. This writer has not observed that failure and does not claim it occurred.
- Docs: no external lookup needed. This adds no dependency/API usage beyond the existing fixture's established library operations.
