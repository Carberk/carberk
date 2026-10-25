# R7f bootstrap callers, bounded source handoff, 2026-10-25

Status: IMPLEMENTED_FOR_PARENT_SOURCE_GATE. The initial semantic stop below is resolved by the parent's explicit concurrent no-op disposition. This is the same bounded implementation continuation before its first source gate. No review, correction, execution or remedy cap has reset. No candidate, runtime or final acceptance is claimed.

## Authorized continuation and exact dependencies

Read `/tmp/897-r7f-concurrent-noop-parent-decision-20261025.md` completely and continued from exact checkpoint `86d7f21e63d8a1ad26d81cbac2c91c9dd1dc141d`, tree `68742d00d530ea950b988820b392a3e36de936b8`. Its original handoff/manifest are retained as `/tmp/897-r7f-bootstrap-callers-20261025-initial-checkpoint-handoff.md` and `...-initial-checkpoint-manifest.json`; the original source/evidence remains in that commit.

The center command now recognizes a completed no-op only after a precisely classified preparation-stage failure and complete transaction rollback. The allowlist is exactly PostgreSQL P0001 messages `diagnostic_source_graph_changed`, `diagnostic_intake_operator_center` and `diagnostic_intake_operator_qualification`, carried by Prisma P2010 and `meta.driverAdapterError.cause.originalCode/originalMessage`. This shape was inspected in installed Prisma/adapter-pg 7.8 source; actual runtime shape assertions are authored but unexecuted. No substring or generic-error recovery exists. The marker can be created only before the receipt work callback starts. Assertion, writes, finish and deferred commit errors cannot enter recognition.

Recognition opens at most one REPEATABLE READ transaction, executes real `SET TRANSACTION READ ONLY` before its first data query, then uses the same full User, exact active grant, center identity/code/names/plan/approval, bootstrap audit and qualification identity/provenance/revocation/fresh-clock expiry validation. A previously known center ID must remain identical. Only a complete current no-op returns `Already bootstrapped; no change`. Failure preserves the original preparation error. No command replay, source preparation, new receipt, advisory/row lock or write occurs in recognition. Staff behavior remains unchanged by this disposition. Original CLI argument/environment/allowlist/privacy/operator gates and messages are retained.

After the parent supplied the accepted revoke dependency, preserved partial source as `f33e97ea288705a1e26272df8ea6c7b5c4eefefa` and mechanically merged exact R2 `0efe627ce6be4c97679a1b888f5a5c003f3b4f10`, tree `395d32bdc02d7a926219e7c15f12291609b62629`. Merge `cc6c6f76c3ee17149f7df4f707495dc0c5b9ff01`, tree `7842e30c7a27271c613d4e29cfcd6bdd66d0f55e`, has parents that partial checkpoint and accepted R2. Merge base is `77492d6c6096d65460403128c25384053551a28f`. There were no conflicts or semantic resolutions. All nine incoming R2 paths are byte-exact; accepted f2338add physical mapping, profile and archive bytes remain exact. `/tmp/897-r7f-r2-merge-provenance-20261025.json` records each path/blob comparison. R2 implementation and suites were not edited. The parent's minimal assembler did not write this checkout.

## Verification and authored coverage

| Behavior | Executed evidence | PostgreSQL evidence |
|---|---|---|
| Exact staff absent/revoked slot, stable normalized OLD/NEW, audit, preparation before legacy locks | Focused offline pass | First/repeat/no-renewal authored |
| Center first/known/absent identity, assignment, exact two-hour deadline and audits | Focused offline pass | First/known/repeat authored |
| No-op and dry-run perform no write preparation, locks or mutation | Focused offline pass | Zero-write snapshots authored for both callers; CLI dry-run/second-capability behavior retained |
| User/grant/center/qualification/provenance refusals | Listed offline cases pass | Missing/unverified/suspended/deleting User, missing/revoked grant, approved/foreign/unaudited center, unaudited assignment/orphan audit, expired/null/revoked qualification authored |
| Narrow post-rollback recognition and original-error preservation | Continuation RED 11 failed/25 passed, GREEN 36 passed | Exact real preparation-error shape, winner recognition, invalid authority/provenance/deadline, snapshot consistency and SQLSTATE25006 enforcement authored |
| Write/assertion/finish/commit failures cannot reconcile | Offline refusal/rollback pass | Named staff/assignment write sentinels, actual staff/center SQL finish missing-audit effects, assertion-stage and deferred-commit lookalike errors authored |
| Concurrent absent slots, both owners first | Offline tests establish no write replay only | Staff stale waiter refuses; center waiter recognizes valid winner; actual PID blockers, both outcomes and lock/activity drain authored |
| Center vs revoke in both orders | No runtime execution | Actual accepted R2 `PrismaStaffAuthority.change`, real PID blockers/drain/outcomes authored, including snapshot vs revoke |
| Qualification/provenance invalidation during recognition | Offline refusal pass | Explicit declared source-boundary fixture transitions, not production writer coverage |
| Full production purge/User cascade opposition | None | External parent/worker integration gap; no hand-written purge opponent counted |

The new direct `bootstrap-command.e2e.spec.ts` uses a restricted non-superuser app role, complete current guards, preactivation fixture authority, a fresh migrated database per case and connection drain before dropping it. Missing-effect fault hooks suppress only the named required audit to exercise the actual SQL finish check. Other scheduling/fault hooks retain real SQL results. The production revoke source is loaded from the exact accepted dependency, not replaced by a hand-written opposing command. These are authored cases, not runtime proof. Retained-proof/campaign closure, migration reachability, real driver error shape and all PostgreSQL outcomes still require the parent-owned SQL gate.

The existing synthetic CLI E2E remains authored, unimported, uncollected and unexecuted. Only fixture lifecycle/guard activation changed. TypeScript AST inspection retained all 42 original assertion statements, including concurrent `[0, 0]`; one added assertion checks complete guard readiness. No assertion was weakened or timeout increased.

Final focused offline suite: 36 passed. TS7, TS6, six-file ESLint, configured contracts and DB builds, runtime-import boundary check, static parsing of all six owned TS files, original E2E assertion preservation and diff check passed. TypeScript/static parsing read authored E2E source without importing or collecting it. Builds/generation used only the dummy non-routable DB URL and made no connection. Detailed commands/results/log SHA-256 values and exact source pins are in the final external manifest.

Continuation logs use `/tmp/897-r7f-continuation-*` and `/tmp/897-r7f-source-final-*`. The initial continuation lint attempt found two unused imports and one forbidden non-null assertion in the new SQL spec; the focused correction passed. The first static assertion-inspection script failed with `ERR_INVALID_ARG_TYPE` because execFileSync received a string options argument; the retained attempt log precedes the corrected passing AST check. Earlier failed attempts listed in the historical checkpoint are preserved. Additional read-only setup misses were a nonexistent `packages/db/vitest.config.ts` and an unmatched `/tmp/897-r7f*checkpoint*` listing before archive creation; no bypass or mutation followed those misses.

SQL requests 0; HTTP requests 0; SQL/E2E imports, collections and executions 0; CLI main invocations 0; operational Users/grants/qualifications created 0; nested agents 0. No services, Docker, hosted CI, strict/automatic activation or deployment occurred. Branch push is permitted by the inspected workflow triggers and creates no PR. Parent checkout/ledger remains untouched. PR904 is the sole registered parent-owned PR.

Historical diagnostic40177598331 remains failed P3018/42703 before 0/22 cases, cleanup success, NO RETRY AUTHORIZED. B5 UNUSED, cause UNKNOWN, remedy cap exhausted. Source gate, PostgreSQL acceptance, candidate and final acceptance remain parent-owned and open.

## Preserved initial incomplete checkpoint

The text below records the original stop and verification at 86d7f21e. Its pending question and missing authored cases are historical, superseded by the authorized continuation above.

# R7f bootstrap caller checkpoint, 2026-10-25

Status: BLOCKED_SEMANTIC_DISPOSITION_REQUIRED. This is an incomplete implementation checkpoint for parent PR904, not a candidate, runtime acceptance or completed R7f delivery.

## Source and ownership

The isolated checkout started at parent `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`, tree `6dd9c3f2401d556a97ba7377a2a5dd96f2b56d6d`, on host scaffold `t3/6da5ff94`. Before any source edit it switched, detached, to exact prerequisite `f2338add6312496c8ab895f2a553351c89dd9b8d`, tree `ca8b8580b60a3bcd293877143462f1ad5226a8cc`. `git merge-base --is-ancestor f375cb4ae6c363e5a724d92ecc7c9f4af5cc5520 f2338add6312496c8ab895f2a553351c89dd9b8d` passed. The branch reservation `agent/issue-897-r7f-bootstrap-callers-20261025` was pushed before edits. Workflow inspection found only main push CI, tag bundle pushes and main-target pull-request checks. No PR was opened; PR904 was registered with this thread.

Read the exact physical-mapping source disposition, R3 source acceptance, R7f-only inventory row, prepared command contract and independent architecture audit supplied by the parent. These accept source dependencies only. The parent checkout and its unrelated ledger were not changed. No agents were spawned.

Production ownership is limited to the two bootstrap scripts and one adjacent `bootstrap-command.ts`. The adjacent module contains the real transaction bodies and allows offline tests without importing either CLI main. The focused offline spec is `bootstrap-command.spec.ts`. The existing synthetic E2E is unchanged, authored and unimported/uncollected/unexecuted.

## Concrete stop condition

The unchanged `bootstrap-synthetic-diagnostic-center.e2e.spec.ts:208` test requires two concurrent first invocations to both exit 0 at line 213 and leave exactly one center/qualification with two audits. The prior script serializes on the bigint center-code advisory lock before discovery, so the waiter sees the winner and returns the existing no-op message.

The accepted protocol requires source preparation before that advisory lock. Both absent callers can discover no center and propose distinct exact center and qualification IDs. SQL derives absent effects and unique-code/qualification locks before waiting. After the winner commits, the waiter's frozen scope/keys must remain identical. The effective `diagnostic_source_insert_receipt` in `20261024090000_diagnostic_message_enquiry_fences/migration.sql:261-265` refuses a changed graph and reparses current authority. The `center_bootstrap` parser in `20261024040000_diagnostic_intake_effects/migration.sql:179-182` also refuses a stored center with a different ID. Thus it cannot convert this stale first-write command into the prior successful no-op within the same receipt.

The current implementation intentionally does not retry or extend scope. It therefore does not satisfy that preserved concurrent-success assertion. This is a source-derived contradiction, not an executed PostgreSQL failure. The old E2E assertion is not weakened. No SQL/registry/shared helper change is made.

Parent requirement: either authorize a narrowly specified post-rollback read-only reconciliation that preserves the original successful concurrent no-op, including authority/provenance checks and exact failure boundaries, or supply an accepted prerequisite protocol that supports the same behavior. An automatic source retry, pre-prepare advisory lock, changed SQL or weakened E2E assertion is outside this checkpoint's authority. This requirement was sent as a pending parent question. Further dependent implementation and new PostgreSQL scenario authoring stopped.

## Implemented, incomplete source

Staff writes construct a SQL-normalized exact composite slot, complete OLD/NEW grant tuple, stable transaction timestamp and reason before preparation. StaffGrant has no separate ID. SQL derives its audit ID/time. The write path uses one real source prepare/assert/finish lifecycle, then User lock/current authority and exact create/update plus the receipt-derived actorless audit. Existing active and dry-run branches use reads with no write receipt or mutation.

Center writes discover existing authority/provenance, fix proposed center/qualification IDs, and prepare the existing `center_bootstrap` intent before the bigint/User/staff/center/assignment locks. SQL owns persisted campaign namespace discovery, full closure and post-wait validation. The caller rechecks authority/provenance and refuses changed identity after the legacy locks. It writes the actual receipt-derived center, assignment, two-hour deadline and audits through finite Prisma operations. No arbitrary-effect executor was added. Existing environment, allowlist, argument gates, privacy/error output and operator-only entrypoints remain in the scripts. No-op/repeat/dry-run bodies use reads only. These implementation facts do not establish production applicability while the prerequisite guards remain dormant.

## Verification and gaps

| Criterion | Evidence | Status |
|---|---|---|
| Preparation precedes old locks; exact staff composite insert/update, reason and audit | Real helper/wrappers against database-boundary fake | Offline pass |
| Exact center root/qualification intent, receipt-derived assignment deadline/audits | Same focused suite | Offline pass |
| Active/no-renewal and dry-run avoid locks, receipts and writes | Same focused suite | Offline pass |
| Invalid User, missing grant, approved/conflicting center, revoked/expired qualification | Same focused suite | Offline pass for listed cases |
| Finish `diagnostic_source_final_effect`, named assignment-write sentinel, stale preparation refusal | Fake transaction boundary leaves no committed writes | Offline pass only; no actual PostgreSQL rollback proof |
| TS7, TS6, focused ESLint, DB/contracts build, runtime imports, diff check | Local commands/logs listed below | Pass |
| Existing first/repeat/no-renewal/refusal/dry-run/concurrent E2E | Original spec retained byte-for-byte | Authored only; concurrent successful result conflicts with current source |
| New complete PostgreSQL first/known/absent/conflict/expired/revoked/missing/invalid authority matrix and real finish rollback | Not authored after semantic stop | Missing |
| Actual PID blockers, drain/outcomes, absent-slot and revoke opposition in both orders | Not authored/executed | Missing |
| Full purge opposition using actual purge production entrypoint | External worker/parent integration | Missing; no hand-written opponent counted as coverage |
| Deployed/strict-mode/automatic admission and final Standards/Spec review | Parent-owned assembled candidate | Not run, not accepted |

Baseline extraction plus tests was committed/pushed as `6eb1acc325c3652e6c0dec0e7c6bc8e765c98f7a`. The first focused run had 14 behavior failures, all before-preparation locks. The same suite then passed 14 tests. Boundary fakes cannot prove SQL locking, trigger invalidation, FK/unique closure or actual rollback. SQL and HTTP acceptance requests: zero. E2E imports/collection/execution: zero. CLI main invocations: zero. No service, Docker, activation, operational User/grant/qualification creation or automatic-201 fixture seeding occurred.

Commands and retained logs under `/tmp`:

- `pnpm install --frozen-lockfile --ignore-scripts`: passed using cached packages.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db generate`: passed, no connection.
- `pnpm --filter @auto-tm/db exec vitest run scripts/bootstrap-command.spec.ts`: `/tmp/897-r7f-red.log` then `/tmp/897-r7f-green.log`.
- `pnpm --filter @auto-tm/contracts build`: `/tmp/897-r7f-contracts-build.log`, passed.
- `pnpm --filter @auto-tm/db exec tsc --noEmit`: first failed on the new spec's index-signature access, corrected to bracket access; `/tmp/897-r7f-ts7.log` records the passing rerun.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit`: first attempt overlapped generated-client replacement during DB build and failed with generated model/type gaps. `/tmp/897-r7f-ts6-attempt1.log` retained; sequential rerun `/tmp/897-r7f-ts6.log` passed.
- Focused ESLint on the four owned TypeScript paths: first found four import-order warnings; `/tmp/897-r7f-lint-attempt1.log` retained. `eslint --fix --max-warnings 0` fixed grouping/order and passed; `/tmp/897-r7f-lint.log`.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: `/tmp/897-r7f-db-build.log`, passed.
- `pnpm check:runtime-imports`: initial attempt ran before DB build completed and failed on missing dist; `/tmp/897-r7f-runtime-attempt1.log` retained. Rerun after build passed; `/tmp/897-r7f-runtime.log`.
- `git diff --check`: passed.

Docs: not applicable, internal caller integration with existing dependency APIs and no dependency/configuration change. No broad repository unit gate was run because the task restricts verification to focused offline checks.

The historical diagnostic `40177598331` failed P3018/42703 before 0/22 cases. Cleanup succeeded. NO RETRY AUTHORIZED. B5 UNUSED, cause UNKNOWN, remedy cap exhausted. No historical attempt or gate is reset by this checkpoint.

The final exact source head/tree, per-path SHA-256 values, pushed/clean status and complete attempt log are recorded in `/tmp/897-r7f-bootstrap-callers-20261025-manifest.json` and `/tmp/897-r7f-bootstrap-callers-20261025-handoff.md`. Keep this branch/checkpoint for parent disposition; do not assemble it as accepted R7f.
