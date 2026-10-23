# Diagnostics bootstrap test handoff

Test-only r2 checkpoint for #901 under #897 / sole draft PR904. Base `c704d02a0880d9f8284c7354fefd9cacc3e3219c`. Owned host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-b6697342`; branch `agent/issue-901-diagnostics-bootstrap-tests-20261021-r2` was created at that base and successfully pushed before edits. Host scaffold `t3/issue-901-diagnostics-bootstrap-tests` remains at the base. The prior writer's different worktree and refs are preserved. Root owns integration assembly, hosted execution and cherry-pick-x. No children, PRs or issue mutations were made.

## Resolved request-key mismatch

Read the prior docs-only checkpoint `302baae8f3ad7a57449551c6e30d7a3dad0b7df1` with `git show`. Its schema finding is correct. Root now explicitly authorizes replacing the invalid wire literal with `uuid("campaign897:diagnostics:intake:issue901-private-intake-v1:<candidate>")`, using the exact reservation-prefixed staging-remote helper. This changes the test contract only. `DiagnosticCreateSchema.requestKey` retains UUID validation. First, duplicate and changed-payload requests use the identical UUID. For reservation `d901` repeated eight times and candidate `a` repeated forty times, it is `22d13294-330f-454e-a8d4-3aa52e9236cb`. An offline comparison against the actual helper confirms the derivation and schema success; the old literal still fails only `requestKey`.

The old decision to stop is superseded by this explicit root disposition. No product/schema change was needed. The [contract correction and root selections](full-v3-diagnostics-bootstrap-contract-20261021.md#root-disposition-for-the-r2-test-only-checkpoint) distinguish test expectations from future source authority.

## Test and first predicted boundary

[CampaignFullV3Diagnostics.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/CampaignFullV3Diagnostics.e2e.spec.ts) composes real Identity and Diagnostics providers. The existing fixed remote-program bridge sends SQL and exact disposal programs only to the configured disposable test lane. It uses production delivered-email OTP processing and normal Sessions for coordinator, reception-steward and buyer-a; real TOTP enrollment/elevation for both staff; and coordinator HTTP grants for reception/templates. It inserts no auth, center, qualification or grant rows itself. It uses no provider overrides, global diagnostic allow-list, auth timestamp edits, rate changes or timeout/concurrency changes.

The first diagnostic POST expects **201** for template publication with expectedVersion 0. Predicted **403 DIAGNOSTIC_NO_ACCESS remains UNKNOWN until runtime**. `diagnosticRuntime` is default-closed, and `DiagnosticAuthority.current` runs before center qualification. The test does not accept refusal as success. On unexpected status, it emits only status, an approved response-code category and SQL-generated hashes before/after for the six diagnostics tables and namespace manifest/journal/events. It also asserts preservation. Failure to capture diagnostics cannot replace the failed 201 assertion. No runtime digest was captured by this assignment. Fixture/auth/setup failures could precede that boundary; static checks do not prove they will pass.

## Masked assertions

All assertions after the failed positive boundary remain unexecuted:

- Exact reservation/candidate center id/code, standard plan and null operational approval; exactly the two reception-steward tuples with deterministic ids, common future deadline bounded by PostgreSQL server time plus two hours, and three content-bounded bootstrap audits. Fixture lost-response replay and template readback preserve every row/control hash and cannot renew qualification. Protected binding issuance/storage and SQL authority integrity still require source inspection plus hosted evidence; the test does not invent a binding table or manifest field.
- Template v1 exact definition and synthetic marker, read-only replay with no new audit/version, stale publication conflict and unqualified coordinator denial.
- Buyer-private intake without a Listing/publication authorization, exactly one reception auto-assignment, reception queue visibility, exact duplicate response without writes and changed-center conflict using the same request UUID. A non-owned template reference and unassigned coordinator refuse without diagnostic/journal changes.
- Changed serving candidate refuses ordinary access; stale reset candidate refuses without writes. An exact external-schema FK probe references the owned order. Reset must refuse with both diagnostics/control state and the foreign edge preserved. Schema integrity may mask the later FK preflight, so this is preservation/refusal evidence, not proof that the FK-specific guard ran. The exact probe table/schema are removed without CASCADE; cleanup failure adds a soft assertion without replacing the primary failure.
- Exact pre-reset ownership is 1 center, 2 qualifications, 1 template, 1 order, 1 order assignment and 5 diagnostic audits. Lost reset response is replayable; every owned application key is read back and absent except exactly four redacted audit_logs. All historical journal keys remain, delivery sink is empty, three exact delivery jobs are absent with permanent disposed Redis tombstones, and terminal state/hash/counts survive observe-only reset retry. Disposed lifecycle refuses diagnostics and fixture reallocation.

Known email job ids are learned before response assertions and cleaned in finally. No queue enumeration/drain exists. Exact reservation reset and foreign-probe cleanup also preserve primary failures with sanitized boolean/fixed-vocabulary diagnostics.

## Ledger and limits

Mapping D remains fixed. Literal successful simple-auth subtotal is 53 records / 63 events / 3 deliveries, followed by 11 diagnostic rows / 11 insert events, giving **64 records / 74 events** before reset. The test asserts those counts and the exact per-table diagnostic ownership. Namespace control metadata and the transient foreign-FK probe are outside public application record accounting. They do not hide public audits. Reset must delete all eleven diagnostic rows, including all five diagnostic audits; existing four application audit_logs retain actor-null/SyntheticCampaign redaction and the three email tombstones keep existing disposition. Journal keys and terminal proof remain.

Reset event totals are measured from the real tracker, emitted only after successful disposal, compared unchanged on retry and bounded by 2048. No reset mutation total is guessed. Record cap stays 128, event cap 2048; complete fit UNKNOWN. No real qualification, legal retention or live activation claim follows. This slice creates no report, evidence, PDF, diagnostic worker work or private object. The production email processor is used only for sign-in delivery.

## Offline checks

- PASS `pnpm --filter @auto-tm/contracts build`.
- PASS `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/unused pnpm --filter @auto-tm/db build`. This generates/compiles only; no connection or service was started. The initial DB build without DATABASE_URL refused config loading, then this build resolved the prerequisite. pnpm reused pinned local-store packages, downloaded zero packages and changed no tracked dependency/config files.
- PASS `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit` after dependency build and routine test typing corrections.
- PASS `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/CampaignFullV3Diagnostics.e2e.spec.ts --max-warnings 0`.
- PASS `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/diagnostics/presentation/CampaignFullV3Diagnostics.e2e.spec.ts --filesOnly --json`, one selected file. Full static `vitest list ... --json` also exits 0 but includes a spurious Nest createTestingModule entry; AST inspection confirms exactly one actual it call. Neither command runs test hooks or establishes runtime RED/GREEN.
- PASS `node /tmp/issue901-r2-static.cjs`: parses the generated remote program and all four embedded campaign functions with vm.Script; compares the spec UUID derivation with staging-remote; validates corrected intake against the actual schema and rejects the old literal; inspects all six console calls and auth/provider/queue mutation entry points for privacy/scope. This local audit script is outside the checkpoint.
- PASS `node --check scripts/staging-remote.mjs`, `node --check scripts/staging-campaign.mjs`, `node --check scripts/testing/process-campaign-email.cjs`, `node --check scripts/testing/query-disposable-postgres.cjs`.
- PASS `pnpm check:agent-docs`, `git diff --check`, and exact three-path allowed-write inspection. No overview ownership or implementation fact changed. Docs: not applicable, internal test-contract work follows existing repository APIs and pinned dependencies; no external dependency/service change.

No local Docker/services, staging, Railway/provider/credential operations, GitHub APIs or CI dispatch/poll/wait/rerun were run. No runtime RED/GREEN is claimed. Root's current candidate CI was left alone.

## Open gates and root action

Inspect/cherry-pick-x the pushed checkpoint into the sole integration candidate, then obtain hosted disposable-lane RED at the actual boundary. Only a separate root source assignment may implement reservation-aware admission, protected server-issued binding/bootstrap, journaling or disposal. Later hosted GREEN must establish every masked assertion, and protected-binding provenance/expiry/hash and FK-specific coverage still need direct evidence. Independent review, deployed acceptance/restoration and operational readiness remain open. Root selections authorize no source work from this test checkpoint.

## Preserved prior schema evidence

The prior writer reserved/pushed `agent/issue-901-diagnostics-bootstrap-tests-20261021` at the same base in `/Users/bagtyyar/.t3/worktrees/carberk/t3-a5758b55`, then wrote docs only. Its source trace remains valid: DiagnosticIntakeController parses DiagnosticCreateSchema before PrismaDiagnosticIntake compares idempotency keys, so the old plain request key produces DIAGNOSTIC_INVALID_INPUT before ordinary duplicate/conflict behavior. Its predicted template denial was never executed.

Offline reproduction, executed successfully with exit 0:

```sh
pnpm exec tsx -e 'import { DiagnosticCreateSchema } from "./packages/contracts/src/schemas/diagnostics.ts"; const result = DiagnosticCreateSchema.safeParse({ requestKey: "issue901-private-intake-v1", centerId: "11111111-1111-4111-a111-111111111111", templateVersionId: "22222222-2222-4222-a222-222222222222", audience: "buyer_private", synthetic: true }); if (result.success) throw new Error("Expected contract/source mismatch was absent"); const issues = result.error.issues.map(({path, code}) => ({path, code})); if (issues.length !== 1 || JSON.stringify(issues[0]?.path) !== JSON.stringify(["requestKey"])) throw new Error("Unexpected validation failure"); console.log(JSON.stringify({success: result.success, issues}));'
```

Sanitized output: `{"success":false,"issues":[{"path":["requestKey"],"code":"invalid_string"}]}`. This is schema validation evidence, not executed HTTP RED. pnpm materialized pinned dependencies from the local store, downloaded zero packages and made no tracked dependency/config changes.
