# Private manual/manual proof consumption RED slice

Test-only follow-up to checkpoint `4269843525b294fd8731f219d59578e8c372d00d`, reserved from the exact parent tree. Root owns hosted RED execution and later source work. This writer opens no PR and changes no production code, schema, contracts, CI or existing tests.

## Scope

`DiagnosticContinuityProofIssuance.e2e.spec.ts` reuses the existing real `pair()` and `ordinaryProof()` setup. The main fresh-material case also uses the existing visit, capture, upload and assignment helpers to release A with actual sanitized finding evidence and prepare B under a distinct, ordinarily published template. It establishes a B-only reviewer before proof issuance. That reviewer can read B after linking but must still be denied A's report, evidence, document list and PDF route. A's PDF intents exist through ordinary finalization; this slice does not render/download PDF bytes. Exact-owned report evidence is removed in finally without changing old cleanup hooks.

Each new case first creates and reads the actual restricted manual/manual proof. The setup is a gate: if issuance/read fails, the consumption assertions are unreached and do not establish valid RED.

The six new cases are:

- POST `/orders/B/reinspections` as B's currently assigned linking technician with the strict existing reinspection fields plus `proofId`; expected 201. On current source, `DiagnosticReinspectionSchema` is strict and omits `proofId`, while `PrismaDiagnosticReports.reinspect` ignores proofs and only admits public equal VIN, so this is intentionally pending runtime RED.
- A successful private draft must use B's own observed date, mileage and pinned template, have no findings, and expose no copied A evidence or PDFs. Persistence checks count only B report evidence and reports; HTTP checks cover B reports, A's minimum draft-link disclosure, and B document list.
- Exact retry returns the identical result with no extra report or `REPORT_REINSPECTION_CREATED` audit.
- Changed proof, reason or expected order version on an existing retry conflicts without persistence changes.
- A second report id cannot consume the already-used proof or create another successor.

No concurrency, automatic VIN, public transfer, erasure, lifecycle or other consumption slice is included.

## Offline verification

- Branch reserved and pushed before editing: `agent/issue-914-private-manual-consumption-red-20261021`.
- Collection-only Vitest config has empty global setup/setup files and no service execution. Collection result: **75 cases**, previous exact 69 plus six new cases.
- `pnpm --filter @auto-tm/api exec eslint ... --max-warnings 0`: pass.
- `pnpm --filter @auto-tm/api typecheck`: pass.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: pass.
- `git diff --check`: pass.
- A protected oracle removed only the new consumption block and reproduced checkpoint `42698435`'s test file byte-for-byte. The original 69 cases, reset suites, interrupted six bodies and CampaignFullV3 suites remain unchanged.

The new HTTP cases are not runtime proved here. No local containers, live services, Railway, credentials, quota calls or authentication shortcuts were used.

## Handoff

Root should inspect and assemble this checkpoint, run the affected suite against the real current authority/PostgreSQL/storage composition, and preserve the resulting RED classification before any source writer changes behavior. The expected current failure is strict 400 at proof-bearing reinspection input; later assertions must remain pending until the positive POST reaches actual HTTP 201.
