# A-04 reset lifecycle receipt

Result: **FAIL / OPEN** on source candidate `52d901c50af1dde97ea22bda8efb1fdf21f169b1`. This is isolated evidence, not hosted acceptance. Program Parent tightened this task to evidence-only while work was active. All source and test files remain unchanged. No PR, delegation, shared reservation, deployment, reset or service creation occurred.

## Identity and integrity

- Actual worktree HEAD: `6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`.
- Branch: `t3/issue-897-a04-reset-evidence`.
- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-c04d2138`.
- The only committed differences from the source base are `docs/evidence/issue-897/a-wayfinder-ticket-map-20261030.md` and `docs/evidence/issue-897/a-10-pr-reconciliation-20261030.md`.
- [Source comparison](source-comparison.json) records exact base/HEAD/worktree SHA-256 equality for the inspected reset source, tests, schema and reset migration. The committed application/package/script/config comparison is empty.
- Reset migration: `20261029190000_operational_reset_row_admission`, SHA-256 `a46a2ea29d04d0f5ad0d480aa3d2c92ef677388b3f6a808676ab8baa4ab79cdd`.
- [Source manifest](source-manifest.json) records all 102 migration hashes. SHA-256 of its compact JSON migration array is `15692533d634e7f946bc391afa8834ef5703e3fce06139b84479ce1169e0655e`.
- Runtime: Node `v24.13.0`, pnpm `12.11.2`. Docker was already running at version `29.1.3`; this task did not start it or create a container.

Comparison commands:

```sh
git rev-parse HEAD
git diff --name-only 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD
git diff --quiet 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD -- packages apps scripts package.json pnpm-lock.yaml pnpm-workspace.yaml
```

## Commands and results

The evidence runner records literal executable/argument arrays, timestamps, child exit codes and raw-log hashes in adjacent JSON files. The runner itself may exit zero after recording a failed child. Child exit codes establish suite results.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS, setup only; completed before tightening; lockfile unchanged | [metadata](setup-1.json), [log](setup-1.log) |
| `node --test scripts/staging-clean-reset.test.mjs scripts/staging-clean-reset-remote.test.mjs scripts/staging-clean-reset-storage.test.mjs scripts/staging-quiescence.test.mjs scripts/staging-campaign.test.mjs` | PASS, 181/181, no skips | [metadata](offline-1.json), [log](offline-1.log) |
| `node --test scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs` | FAIL, 51/52; controller cases pass, assembled retained-schema restoration fails | [metadata](offline-2.json), [log](offline-2.log) |
| `node --test --test-name-pattern='business.*(reset\|restor\|recover\|disposal\|recovery)\|post-main campaign restoration\|queue disposal\|actual remote probe' scripts/staging-railway.test.mjs` | FAIL, 37/59; 22 failures, no skips; restoration planning obstructs the later assertions | [metadata](offline-3.json), [log](offline-3.log) |
| `TMPDIR=/tmp node --test --test-name-pattern='the assembled application schema can restore baseline code while retaining its exact campaign migrations' scripts/staging-ledger.test.mjs` | FAIL reproduced, 0/1 | [metadata](red-1.json), [log](red-1.log) |
| `TMPDIR=/tmp node docs/evidence/issue-897/a-04-reset-runtime-20261030/capture-state.mjs` | PASS for offline state captures; records the existing restoration failure separately | [log](capture-state.log), state snapshots below |

The backslashes in the table's regex protect Markdown table separators only. The literal argument has ordinary `|` characters; `offline-3.json` is authoritative. The first three commands were launched by `node docs/evidence/issue-897/a-04-reset-runtime-20261030/run-evidence.mjs offline`. Setup used the same runner with `setup`; focused reproduction used `TMPDIR=/tmp` and `red`.

Existing tests use synthetic candidates or derive their Git fixture candidate from actual HEAD. In particular, the Railway lifecycle fixture fetched `6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`, not an invented deployment of the source candidate. Source equivalence is recorded separately. The new offline state capture binds candidate `52d901c50af1dde97ea22bda8efb1fdf21f169b1`. None of these results certifies a deployed candidate.

## Criterion disposition

| Criterion | Observed evidence and boundary | Result |
| --- | --- | --- |
| Obsolete campaign `cf` | `scripts/staging-clean-reset-remote.mjs:285` refuses an existing namespace. `packages/db/scripts/staging-clean-reset.e2e.spec.ts:263` asserts inventory and blind-row refusal plus complete snapshot equality and drops its fixture schema in `finally`. That real-PG test was not run here. No reviewed namespace retirement/disposition was executed. | FAIL/open; safe refusal mapped, required transition absent |
| Executor negative identity/admission | Offline remote tests refuse malformed/caller state and missing closure admission before SQL. The focused real-PG executor has wrong-target, unknown graph, other-backend and stale-inventory cases at lines 223, 280, 308 and 322. | Offline PASS; real-PG proof NOT RUN |
| Executor failure/rollback | Real executor spec line 354 injects a database refusal and checks sanitized failure and full snapshot equality. Its admitted disposal case checks full state on any refusal. | FAIL/open; source mapped, no fresh real-PG result |
| Executor expiry | Migration line 210 refuses a held admission older than 240 seconds. Preparation also installs 240-second statement and PostgreSQL 17 transaction timeouts. The row spec has no real elapsed admission-expiry test. Controller grant-expiry equality is a different boundary. | FAIL; required real executor expiry/rollback proof missing |
| Commit without finish | Row spec line 109 checks `operational_reset_unfinished`, no persisted admission and exact User preservation. It does not replace an independent test of disposal followed by unfinished commit. | FAIL/open; existing test NOT RUN here; stronger negative remains missing |
| Provider exclusion | Offline current-closure tests require desired zero in all supplied regions, crash/cron/rollout/wake exclusion and exactly the admitted maintenance executor. They refuse late execution, changed authority and CAS uncertainty. The real Railway adapter has no qualified `cleanResetBaseline` implementation. | Offline PASS; actual provider proof open |
| Storage drain | Current-closure tests refuse a surviving old epoch/accepted request and changed issuance at the drain boundary. Lost drain replies resume the same intent. Snapshot replay performs no second drain. | Offline PASS; actual accepted-request/socket drain open |
| Authoritative grant/clock horizon | Tests refuse unknown horizon, epoch discontinuity, strict expiry equality and changed horizon. Source-pinned 900-second signer tests pass but do not establish outstanding historical grants, SigV2 expiry, future-dated V4 or actual clock authority. | Offline PASS; authoritative live proof open |
| Controller handoff | Existing tests and fresh local Git-ledger capture resume the same operation after a lost drain reply. The return value is `inventory-ready`, `rowExecution: blocked-parent-lawful-reset-contract`, `reopened: false`. | Offline PASS; controller execution/restoration acceptance coordinator-owned |
| Restoration | `scripts/staging-ledger.test.mjs:92` fails on exact candidate migration inventory. Four candidate migrations are omitted from the retained-schema profile for the current schema. | FAIL, reproduced without source changes |
| Clean reset and lawful disposal scope | Offline campaign tests validate exact recorded object identities, provenance refusals, partial failure and read-only terminal replay. Storage capture deletes only its fixed configured fake inventory and preserves its outside bucket and exact catalog bytes. This is not proof that a real shared bucket is reservation-prefix bounded. Real-PG fixed-plan disposal/retained equality and same-operation replay are at executor spec line 377, not run here. | Offline PASS within fake scope; required integrated isolated proof open |
| Cleanup/restoration of task fixtures | No actual DB/Redis/object namespace was created. Captured fake state reached completion. The capture's private Git remote and both controller object stores were removed in `finally`. Existing offline tests own their temporary-Git cleanup. | Capture cleanup PASS; final test cleanup recorded below |

## Preserved RED and restoration failure

No production behavior was changed, so no new RED/GREEN implementation claim is made. Existing guard and cycle RED receipts remain untouched in [reset-row-guards-admission-20261029.md](../../issue-901/reset-row-guards-admission-20261029.md) and [reset-row-self-reference-cycles-20261030.md](../../issue-901/reset-row-self-reference-cycles-20261030.md). Their dated results are not fresh A-04 acceptance.

The new, unmodified-source RED is `Schema snapshot and migration inventory mismatch` from `evaluateSchemaPlan` at `scripts/staging-schema.mjs:216`. [Profile diagnosis](restoration-profile-red.json) records current schema hash `21cdc52efb2fb1a9cabdfe0955cfe8d75e60147f9e6dd14f83f9e45bf3df4c45` and the four unlisted migrations:

- `20261026016200_diagnostic_maintenance_compatibility`
- `20261026016300_diagnostic_registry_metadata_lookup`
- `20261026016400_diagnostic_source_key_predicate`
- `20261029190000_operational_reset_row_admission`

There are no missing expected migration names and no checksum drift among migrations that already have a profile pin. This diagnosis does not authorize adding those migrations or checksums to the profile. A-01/coordinator owns fix disposition and compatibility evidence. No test, profile, migration, guard or timeout was changed to turn this RED green.

The selected Railway run also fails 22 of 59 tests. Direct restoration attempts raise the same mismatch. Negative restoration tests that expect disposal or blocked-state refusals instead encounter this earlier schema refusal. Two provider-preflight restoration cases at line 744 pass their no-stale-reset/fixture/deployment assertions, then fail `durable intent retained` at line 782 because planning stopped before creating an operation. Those later injected faults are not proved and these failures must not be counted as successful negative coverage. They do not establish an observed destructive mutation. No additional repair or broad rerun was performed.

## State snapshots

- [Controller snapshots](controller-state-snapshots.json) include local Git revision/state, fake desired counts/executions, clock and grant horizon, storage epochs and effects before closure, unknown-horizon refusal, strict-equality refusal, lost reply and fresh-controller handoff. The strict equality case records no drain. The handoff has one stop and one drain for the same operation.
- [Storage snapshots](storage-state-snapshots.json) include exact version/upload identities and byte hashes before, during interrupted intent and after completion. Initially five versions, one delete marker and two multipart uploads belong to configured families. Four disposable versions, the marker and uploads are removed. The approved catalog version and the outside bucket version remain byte-identical. Replay adds no effect.
- [Capture cleanup](snapshot-cleanup.json) identifies the removed `/tmp/carberk-a04-c04d2138-*` ledger. No service was involved.
- There is deliberately no fabricated database state snapshot. Real-PG state-preservation proof is deferred to the serialized slot.

## Deferred commands and resource proposal

The following command was planned but **never launched**, before or after contract tightening:

```sh
pnpm --filter @auto-tm/db exec vitest run tests/operational-reset-rows.e2e.spec.ts scripts/staging-clean-reset.e2e.spec.ts
```

Run only after coordinator scheduling. Prefer separate file invocations or `--fileParallelism=false` to avoid overlapping migrations/containers. These are the existing suites, not a new executor-expiry test. The 240-second expiry and post-disposal unfinished-commit gaps still require coordinator-owned evidence planning.

Proposed allocation, not reserved and not created:

- Compose project/container prefix `carberk-a04-c04d2138-20261030`.
- Dedicated PostgreSQL `127.0.0.1:55404`, DB `a04_c04d2138_reset_20261030`.
- Optional dedicated Redis `127.0.0.1:56404`, DB 0, prefix `a04:c04d2138:reset:20261030:`. A dedicated instance is required for whole-inventory clean-reset suites; a prefix alone is insufficient.
- Optional dedicated object service `127.0.0.1:57404`, console `57405`, exclusive volume and `a04-c04d2138-*` buckets. Existing fake storage tests use fixed family names; no real storage test was launched.

Compatibility constraint: the unmodified row suite creates a random `postgres:17-alpine` Testcontainers container/host port and fixes the contained DB name to `issue901_reset_a_recovery_20261029`. The executor suite creates a random `postgres:16-alpine` container/port with the Testcontainers default DB. Neither accepts the proposed external DB or named compose allocation as written. Their per-container isolation can be serialized by the coordinator; do not point them at shared staging or rewrite their target behind a guard. Redis/object services are unnecessary for these two PostgreSQL files.

The already-active offline run used only Node processes, fake boundary state and local temporary Git repositories. It inherited macOS `os.tmpdir()` under `/var/folders/.../T`; those existing tests remove their own fixtures. Subsequent capture and focused RED commands use `/tmp` explicitly. Setup installed ignored workspace dependencies before tightening. No tracked file outside this evidence directory changed.

Final run status: all three offline child commands and both state captures terminated; no service run is in flight. The raw logs report no cancellation, and no temporary-fixture cleanup-hook failure. Existing per-test scratch paths were not individually recorded, so their cleanup evidence is the completed hooks rather than a fabricated path inventory. The final capture's exact scratch path is checked in [final verification](final-verification.json). Ignored installed dependencies remain available in this owned worktree. Evidence remains local and uncommitted for coordinator collection; HEAD is unchanged.

Hosted provider qualification, exact reservation/candidate deployment, old grants and accepted-request drain, lawful obsolete-campaign disposition, real controller-to-executor handoff, clean-reset/reseed/reopen, latest-main restoration and release remain coordinator-owned and open. A-04 must not be reported PASS from these offline results.
