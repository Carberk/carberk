# Diagnostics bootstrap test handoff

Blocked test-only slice for #901 under #897 / sole draft PR904. Supplied base: `c704d02a0880d9f8284c7354fefd9cacc3e3219c`. Sole writer used the host-owned worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-a5758b55`. Branch `agent/issue-901-diagnostics-bootstrap-tests-20261021` was created at that base and successfully pushed before edits. Existing contract attempt `58d5b755` and durable graph/capacity handoffs were inspected. Root retains integration, GitHub execution records, hosted execution and cherry-pick ownership. No children or PRs were created.

## Stop condition and source evidence

The assignment requires stopping with evidence when source contradicts feasibility or a material decision remains. The [bootstrap contract](full-v3-diagnostics-bootstrap-contract-20261021.md) fixes the first intake request key to `issue901-private-intake-v1`. However, [DiagnosticCreateSchema](../../../packages/contracts/src/schemas/diagnostics.ts#L19) requires `requestKey: z.string().uuid()`. [DiagnosticIntakeController](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIntakeController.ts#L36) parses that schema before calling intake, and its parser throws HTTP 400 `DIAGNOSTIC_INVALID_INPUT` on failure. The key therefore cannot reach the [ordinary idempotency comparison](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts#L55). Existing diagnostic HTTP tests use UUID request keys.

Offline reproduction, executed successfully with exit 0:

```sh
pnpm exec tsx -e 'import { DiagnosticCreateSchema } from "./packages/contracts/src/schemas/diagnostics.ts"; const result = DiagnosticCreateSchema.safeParse({ requestKey: "issue901-private-intake-v1", centerId: "11111111-1111-4111-a111-111111111111", templateVersionId: "22222222-2222-4222-a222-222222222222", audience: "buyer_private", synthetic: true }); if (result.success) throw new Error("Expected contract/source mismatch was absent"); const issues = result.error.issues.map(({path, code}) => ({path, code})); if (issues.length !== 1 || JSON.stringify(issues[0]?.path) !== JSON.stringify(["requestKey"])) throw new Error("Unexpected validation failure"); console.log(JSON.stringify({success: result.success, issues}));'
```

Sanitized output: `{"success":false,"issues":[{"path":["requestKey"],"code":"invalid_string"}]}`. This is schema validation evidence, not executed HTTP RED. pnpm materialized pinned dependencies from the local store, downloaded zero packages and made no tracked dependency/config changes.

No test file was written. Substituting or deriving a UUID would change the exact contract; expanding the schema would exceed test-only authority. Writing the required positive intake assertion with the literal would knowingly encode an invalid request. Root must resolve this key mismatch before redispatch, either by selecting a valid fixed UUID in the test contract or assigning a separately approved API contract change. This handoff does not select either option.

## Root disposition preserved for the next assignment

Selections authorize test expectations only. Use the contract's reservation/candidate-derived center ID and code with `operationalApproval=null`, the two reception-steward reception/templates qualification tuples, and a protected server-issued two-hour binding. Candidate/lifecycle changes invalidate admission, and renewal is forbidden. Trusted reservation-aware admission follows Support's ownership checks, never configured user lists or provider overrides. This is synthetic fixture preparation, with no real qualification or legal retention claim.

Delete all 11 owned diagnostic rows, including all five diagnostic audits. Retain historical journal/terminal receipt. The four application `audit_logs` retain existing redaction rules; the three email delivery tombstones retain existing disposal rules. Keep mapping D, caps of 128 records / 2048 events and complete fit UNKNOWN. Planned literal accounting remains 53 auth records / 63 events / 3 deliveries, then 64 records / 74 events including diagnostics before reset. Reset mutation/event totals must be measured, never guessed.

The predicted first HTTP RED remains template publication expecting 201 and receiving 403 `DIAGNOSTIC_NO_ACCESS`, because [diagnosticRuntime](../../../apps/api/src/modules/diagnostics/infrastructure/diagnosticRuntime.ts#L6) is default-closed and [DiagnosticAuthority.current](../../../apps/api/src/modules/diagnostics/infrastructure/DiagnosticAuthority.ts#L16) runs before qualification. No HTTP request was executed and no unchanged-state digest was captured. Such evidence must accompany the failed 201 assertion in the future test without accepting refusal as positive behavior.

Still unimplemented and masked: ordinary delivered-email OTP Sessions for only coordinator, reception-steward and buyer-a; real TOTP enrollment/elevation; coordinator HTTP grants; template v1 publication/read-only replay; private intake and exact duplicate/conflict behavior; foreign-reference/candidate refusal without writes; and exact reset with historical accounting, redacted audits, delivery tombstones and observe-only replay. Known queue job IDs must be cleaned in finally, with cleanup refusal preserving the primary failure. No auth/qualification/center seeding, admission allow-list, timestamp/rate/timeout/concurrency changes, report/evidence/PDF/worker expansion or product/schema/fixture source edits were made.

## Checks and open gates

- PASS: offline schema reproduction above.
- PASS: `pnpm check:agent-docs`.
- PASS: `git diff --check`.
- PASS: single-path diff/allowed-write inspection, only this evidence file changed.
- Not applicable: TypeScript lint/typecheck, test collection and embedded-child syntax/transport privacy checks, because no TypeScript or child program was written.
- Not run: runtime RED/GREEN, local services/Docker, hosted CI, staging, Railway, providers, credentials or GitHub APIs. No CI polling/rerun/dispatch occurred.

Root's next action is to resolve the literal key mismatch and redispatch the isolated test checkpoint. Hosted RED on that checkpoint, separate source assignments, subsequent runtime GREEN, independent review and operational readiness remain open. This docs-only checkpoint does not complete the requested test slice or authorize activation.
