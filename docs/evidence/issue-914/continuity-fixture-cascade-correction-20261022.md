# Continuity fixture cascade correction, 2026-10-22

Codex implementation writer for #897/#914, from Root's supplied local base `d0b3302e48ba3d7b3865992f38fe3496631c890d`, which includes C2 `a2fb1994`. The host-owned isolated worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-603537c0`. Its clean scaffold branch was `t3/603537c0` at that base. The unique branch `agent/issue-914-fixture-cascade-20261022-codex` was reserved and pushed before editing. The final checkpoint SHA and tree are in the writer's handoff because a commit cannot contain its own SHA. Root owns assembly and sole integration PR #904. This writer creates no PR and performs no integration push, service operation, deployment, reset or Railway call. No children were used.

## Scope and preservation

Only these acceptance specs change, plus this new note:

- `apps/api/src/modules/diagnostics/presentation/DiagnosticComparativeIdentityModes.e2e.spec.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticSupportedManualCorrection.e2e.spec.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticSupportedVinCorrection.e2e.spec.ts`

All three `beforeAll` statements and every complete `it`/`it.each` statement are byte-identical to base. C1/C2 have no changes outside teardown. Mixed has only necessary request-boundary registry additions outside teardown: retain the generated intake request key before POST, retain the finding ID before its POST, and register exact PDF keys from the existing documents response. The registry gains request-key and finding arrays. No HTTP payload value, response expectation, setup flow or substantive assertion changes. The proof expected-201 assertions, snapshot/identity pins, rights, actual bytes, denials, consumption and retry assertions remain intact. Automatic, consumed-erasure and all 99 comparative cases remain byte-identical, as do every other previously tracked file.

The preservation script parses TypeScript and compares SHA-256 of complete setup/test statements. It also strips only teardown and reverses the explicitly listed mixed registry additions, then requires exact full-file equality. Git's complete tracked diff is restricted to the allowed paths. This is inspection evidence, not a behavior test.

SHA-256 before and after:

- Mixed: `887c04da348683819c49598b1b2bd4b67ebe3bb56addcf78f948dcb1534bdb5a` → `57b225985c5bc73c113fa5df2eb175e34ef42b84b6ee528fe5fe993628de3df3`.
- C1: `58fcd5153e560f385a02e2a774eabd9e2b9915459c15b5b48fe7162cc6a7465e` → `3447f46d8e7410554872903fcf3319910f24f6f44dd2b0493ef8e9100cb389b1`.
- C2: `064160aee2a09a98defdd17ce46a2880395583ca844dcb3eeadb62938916debf` → `65f14e61995327edb084dcb8a80a0857a6810be9271f50ac45f9aba1245baed3`.

This note is absent at base. Its final hash and the complete four-file manifest are saved with the handoff artifacts.

## Relations and cleanup

The schema and complete incoming FK declarations were inspected, including the intake/report migrations `20261015070000` and `20261015190000`, identity migrations `20261021110000`, `20261021120000`, `20261021130000`, and proof migrations `20261021140000` and effective replacement function in `20261021150000`. The identity DELETE guards have no later replacement that permits direct deletion while their order exists.

Order deletion cascades to raw identity records, structured evidence, provenance and order assignments. Raw identity deletion also cascades to its structured evidence; evidence correction edges cascade to their successors. Each identity guard permits DELETE only once its owning order is absent. Reports restrict deletion of order, template, pinned raw identity and pinned evidence; report predecessor edges, report evidence, PDFs and proof predecessor-report/candidate-order FKs also restrict deletion. Proof predecessor order, issuer, Session and linking-technician references additionally affect source-change triggers even where they are scalar references without FKs. The effective source-change trigger invalidates unused proofs on relevant source changes and can delete proofs when identity material is erased or cleanup-requested. Report/PDF pin guards remain enabled and unchanged.

Every teardown now follows this order:

1. Before any object or row mutation, validate registered order IDs against the registered request keys, exact center, template and buyer. Inspect descendant IDs against the existing registry, including correction successors and raw/evidence/report/proof pins. Inspect proofs tied to registered users and Sessions too, so later assignment/grant/Session changes cannot mutate an unknown proof. Verify report state finding IDs, absence of unregistered report evidence, exact order-assignment tuples, center orders/templates/qualifications and external uses of the registered template. Validate provenance/PDF object descriptors against the registered exact keys. Audit checks require the exact registered actor/order/center bindings; a center-only template audit additionally requires `TEMPLATE_PUBLISHED` and the registered template ID. A report ID in audit details must be registered.
2. Preflight Session descendants, including VideoGrant and ServicePushSubscription, and require their counts to be zero. Preflight every User collection relation count against only registered children in the known diagnostic/Session/grant relations. All other relation counts must be zero; singular notification preferences and TOTP enrollment must be absent. Both CASCADE and SET NULL side effects are covered. Unknown descendants refuse cleanup before object deletion. No IDs discovered by teardown are added to the registry or used as deletion authority.
3. Delete only registered exact object keys and HEAD each key, requiring 404. Collect failures and refuse all database cleanup if any object deletion or absence verification fails.
4. Delete exact registered proofs and PDFs, then registered reports in reverse creation order to release predecessor and identity pins. Delete only audits matching the preflighted registry bindings and exact registered order-assignment tuples.
5. Delete orders by registered ID, with additional exact center, commissioner and registered request-key fences. Raw identity, structured evidence and provenance leave through the order cascade. There are no direct identity DELETE calls.
6. Remove the exact registered template, qualification IDs and center. Remove registered Sessions and grant tuples. Recheck that each registered User has no remaining collection relations before deleting that exact User.

Unknown rows are preserved by refusing cleanup. Center codes and namespace prefixes never grant deletion authority. No schema, trigger, source behavior, acceptance criterion or generic cleanup framework changes.

## Verification

The task's fixture-only correction exemption applies. There is no production source change and no artificial mirrored fixture test was added. Required HTTP runtime acceptance remains UNKNOWN. Local DB/Redis/MinIO are unavailable; no runtime setup, hooks or test bodies were executed for these acceptance specs. Root must run hosted verification on the assembled candidate and inspect both assertions and cleanup.

Commands and results, with logs under `/tmp/carberk-914-fixture-cascade-20261022-codex/`:

- Initial `pnpm --filter @auto-tm/db build` failed because Prisma generation requires `DATABASE_URL`. The initial API typecheck consequently failed on the missing generated DB package. `db-build.log` and `api-typecheck.log` preserve those preparation failures.
- `DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture pnpm --filter @auto-tm/db build`: PASS, generation/build only, no connection. `pnpm --filter @auto-tm/contracts build`: PASS. Logs `db-build-prepared.log` and `contracts-build.log`. No dependency version/configuration changed.
- `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticComparativeIdentityModes.e2e.spec.ts src/modules/diagnostics/presentation/DiagnosticSupportedManualCorrection.e2e.spec.ts src/modules/diagnostics/presentation/DiagnosticSupportedVinCorrection.e2e.spec.ts --max-warnings 0`: PASS, executed directly, `eslint-final.log`.
- `pnpm --filter @auto-tm/api lint`: PASS, executed directly, `api-lint.log`.
- `pnpm --filter @auto-tm/api typecheck`: PASS with configured `tsc --noEmit`, executed directly, `api-typecheck-final.log`.
- `pnpm typecheck`: PASS, 11 successful tasks, 10 cache hits and the API task executed. `typecheck-final.log`.
- `pnpm test:unit`: PASS, 10 successful tasks, 9 cache hits and API unit tests executed. API has 261 passed files, 2,437 passed tests and 2 skipped. Existing agent-GitHub and native-session root checks also passed. `unit.log`. The final additional PDF descriptor predicate was subsequently covered by focused/full API ESLint and direct/configured typechecks; no unit behavior changed.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/carberk-914-fixture-cascade-20261022-codex/collection.config.mts --staticParse=false --json`: PASS, 105 import-collected cases, exactly 99 comparative + mixed 2 + automatic 1 + consumed 1 + C1 1 + C2 1. The temporary config names only these six files and sets `globalSetup: []` and `setupFiles: []`. JSON is `collection-expanded.json`; stderr is empty. This proves imports and expanded registration only. The earlier default static list returned 52 declarations, including hooks, and is not acceptance evidence.
- `node /tmp/carberk-914-fixture-cascade-20261022-codex/preservation.cjs`: PASS, `preservation.json` and `preservation.log` hold file/setup/body hashes and scope proof.
- `git diff --check`: PASS. Final diff, four-file hashes and artifact checksums are saved alongside the logs.

Docs: no external dependency or service API changed. Existing repository source, Prisma schema/migrations and installed tooling were inspected. Diagnostics ownership, runtime limitations, vocabulary and overview facts are unchanged; no overview update is needed.

Remaining limits: the preflight uses ordinary reads in these serial fixture suites, not a new concurrent-cleanup locking protocol. A concurrent foreign writer or PDF worker after preflight is outside this bounded correction's demonstrated evidence. Unexpected descendants or partial request failures that leave an unregistered row intentionally preserve database rows and fail teardown for Root to inspect. Object failures likewise preserve database rows. PostgreSQL cascade/trigger execution and storage absence checks require hosted runtime proof. Existing mixed/corrected continuity business admission remains outside this fixture correction, and expected-201 acceptance must not be weakened to match it.
