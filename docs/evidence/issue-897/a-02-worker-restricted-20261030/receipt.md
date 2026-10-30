# A-02 restricted worker evidence, 2026-10-30

**Result: FAIL.** The unchanged restricted preparation suite passed 12/12. The ownership batch suite failed its fixture prerequisite, and Vitest skipped all ten case bodies. Capacity refusal, later-group rollback, complete ownership erasure and both ownership race orderings are therefore unproven. This is a setup failure, not a demonstrated production defect.

## Candidate and execution identity

- Candidate: `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- Actual immutable worktree HEAD: `6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`. Its two later commits change only the Wayfinder map and PR reconciliation documentation.
- All 1,619 compared worker/API/DB/contracts/configuration files match the candidate byte for byte. The relevant candidate-to-HEAD source diff is empty. The final comparison also verifies the runtime snapshot. See [source-pins.json](source-pins.json) and [source-postcheck.json](source-postcheck.json).
- All 102 migrations were applied through `pnpm --filter @auto-tm/db run migrate:deploy`. Every migration finished, none was rolled back, and the exact name/checksum list matches [migration-manifest.json](migration-manifest.json). Manifest SHA-256: `6db6fbf01a14c9a04cf4aa161b83133294647a777d7a39b62932990b44a019e8`. Applied readback is in [before-tests.json](before-tests.json).
- The pre-run [execution-manifest.json](execution-manifest.json) was reported before provisioning, builds or tests. Runtime source came from `git archive` of the candidate into `/tmp/carberk-a02-worker-restricted-f6408755/source`. No second Git worktree was created.
- Node `24.13.0`, pnpm `12.11.2`, Vitest `5.0.4`. Commands ran sequentially in the assigned exclusive slot.

Source and tests remained read-only. All writes are ticket evidence or under `/tmp`. No API/DB contract, width or timeout changed. No ordinary full100 run, shared database access/reset, PR, delegation, deployment or production SLO claim occurred.

## Resources and actors

The dedicated Compose project was `auto_tm_ci_897_a02_f6408755`, with containers ending in `-postgres-1`, `-redis-1` and `-minio-1`. PostgreSQL used `127.0.0.1:61139`, database `a02_worker`; Redis used `127.0.0.1:61138`, DB 0; MinIO used `127.0.0.1:61140`, bucket `diagnostic-test-private`, with UUID fixture keys under `diagnostic-evidence/` and `diagnostic-pdf/`.

`auto_tm_ci` migrated and prepared/restored the disposable fixtures. Actual worker calls in the preparation suite used the harness-created `r6c_diagnostic_worker_<random eight-hex suffix>` role. The passing hooks assert that current and session user agree, all elevated role flags are false, and the role owns no public table, function or schema. The unchanged harness does not persist the random suffix. No capacity/race worker or API opponent was admitted because the ordinary per-case manifest was absent.

## Commands and outcomes

Both commands ran from the candidate runtime snapshot with `AUTO_TM_TEST_DATABASES=off`, `GITHUB_ACTIONS=false`, the dedicated service URLs, one Vitest worker, and JSON/default reporters. Exact argv, environment variable names, UTC start/end, exit status and output hashes are in the corresponding `.command.json` files and [receipt.json](receipt.json).

```sh
pnpm --filter @auto-tm/worker test src/jobs/diagnostics/DiagnosticWorkerPreparation.e2e.spec.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=/Users/bagtyyar/.t3/worktrees/carberk/t3-f6408755/docs/evidence/issue-897/a-02-worker-restricted-20261030/restricted-preparation.vitest.json
pnpm --filter @auto-tm/worker test src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=/Users/bagtyyar/.t3/worktrees/carberk/t3-f6408755/docs/evidence/issue-897/a-02-worker-restricted-20261030/ownership-batch.vitest.json
```

The first command enabled `DIAGNOSTIC_WORKER_PREPARATION_ACCEPTANCE=1` and passed all twelve cases with no skips. It covers due bound/unbound provenance, not-due retention, active write lease, old staged/verified material, real storage-authentication refusal and retry, structured evidence-rights erasure, attached retention, and actual TK/RU/EN PDF rendering. Each locale case runs two concurrent generation calls and asserts exactly one success, one attempt, immutable report preservation and a refused subsequent duplicate. These assertions establish the selected provenance/evidence and rendering behavior only. They do not replace ownership expiry or the six ownership races. See [restricted-preparation.log](restricted-preparation.log) and [restricted-preparation.vitest.json](restricted-preparation.vitest.json).

The second command enabled `DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_ACCEPTANCE=1` and exited 1. Every case failed `beforeAll` at `DiagnosticWorkerOwnershipBatch.e2e.spec.ts:117` with `Separate ordinary fixture manifest required`. Vitest reports ten skipped bodies. See [ownership-batch.log](ownership-batch.log) and [ownership-batch.vitest.json](ownership-batch.vitest.json).

| Required case | Requested ordering or property | Observed result |
|---|---|---|
| `later-failure` | Later-group fault, no partial ownership | Setup failure; rollback not reached |
| `shared-multiple` | Shared closure across groups | Setup failure |
| `oldest-capacity` | Frozen oldest selection plus new arrival | Setup failure |
| `overlimit` | Bounded complete refusal | Setup failure; refusal not reached |
| `worker-first-second-worker` | Worker, then second worker | Setup failure; no barrier reached |
| `second-worker-first-worker` | Second worker, then worker | Setup failure; no barrier reached |
| `worker-first-capture` | Worker, then capture | Setup failure; no barrier reached |
| `capture-first-worker` | Capture, then worker | Setup failure; no barrier reached |
| `worker-first-proof-use` | Worker, then proof consumption | Setup failure; no barrier reached |
| `proof-use-first-worker` | Proof consumption, then worker | Setup failure; no barrier reached |

No convergence, ownership rollback or absence of ownership-race leaks/duplicate delivery is inferred from these skipped cases. The unchanged empty database after the failed setup proves cleanup, not rollback.

## Cleanup and next dispatch

All twelve scenario restoration receipts exist. [fixture-cleanup.json](fixture-cleanup.json) verifies exact trigger restoration, dormant guard readiness restored, source/campaign receipts `0/0`, no fixture rows, no restricted roles, no other database connections, no objects and no Redis keys. [after-preparation.json](after-preparation.json) and [after-batch.json](after-batch.json) preserve the state. The 102 applied migration records remain unchanged.

The exact project was removed with `docker compose ... down -v`. [services-down.log](services-down.log) records removal. Project-filtered container and volume listings are both empty. The `/tmp` source/dependency snapshot remains for reproduction; it has no running services. The exclusive CPU/timing slot is released.

Program Parent must supply or separately authorize production of ten distinct ordinary case fixtures on this exact chain, with a private manifest, actor/request bindings, declared-rights horizon and cleanup ownership. The existing batch harness additionally pins port `65379` and `r6c_batch_*` database names at line 124. That port belongs to a retained foreign task. A separate bounded test dispatch must bind the harness to a fresh exact resource identity before another isolated run. No source or test fix was attempted here.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Restricted ownership erasure is private and complete | Preparation passed; ownership matrix not admitted | FAIL, not established |
| Capacity refusal is bounded | Capacity case bodies skipped after setup failure | FAIL, not established |
| Rollback leaves no partial ownership | Later-failure body skipped | FAIL, not established |
| Both race orders converge without duplicate delivery or leaks | All six ownership race bodies skipped | FAIL, not established |
| Fixture cleanup is complete | Exact restoration, empty state and removed project | PASS |

Evidence-only collector setup corrections are recorded in [collection-notes.json](collection-notes.json). No test was rerun. External documentation lookup was not applicable; existing repository commands and configuration were used without dependency or API changes.
