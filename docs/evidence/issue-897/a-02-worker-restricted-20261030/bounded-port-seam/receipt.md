# A-02 bounded PostgreSQL port seam receipt

The single expected-port expression is implemented. A-02 remains **FAIL/open**. No ownership, capacity, rollback or race acceptance body ran in this dispatch.

The source checkpoint and actual immutable verification HEAD is `57193573412c67da99f28f87d2fe9d0cd20503c1`. The owned worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-8400e79c`, branch `t3/a-02-diagnostic-port-seam`. This receipt is committed afterward in a documentation-only checkpoint. The final handoff reports that later HEAD.

The coordinator base is `41e9a07a1d20b60369839b1190410f708937784b`. Source base remains `52d901c50af1dde97ea22bda8efb1fdf21f169b1`; prior evidence ran at `6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`. All 73 changed paths between the source and coordinator bases are under `docs/`. All 3,118 non-documentation tracked entries match between those bases. At the source checkpoint, only the allowed test differs from the candidate. Reversing the one expected-port substitution restores the exact candidate bytes. Every non-documentation worktree file matches the immutable checkpoint.

At `DiagnosticWorkerOwnershipBatch.e2e.spec.ts:125`, the comparison changed from `app.port !== "65379"` to `app.port !== (process.env["DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_PORT"] ?? "65379")`. `app` parses `fixture.workerUrl`, the PostgreSQL URL. The static verification used `DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_PORT=61149`; the default remains `65379`. No other byte in the test changed. This preserves the separate host/database/caller checks, fixture manifest, assertions, bounds, ten selectors and race barriers.

The allowed changed paths are:

- `apps/worker/src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts`
- `docs/evidence/issue-897/a-02-worker-restricted-20261030/bounded-port-seam/receipt.md`
- `docs/evidence/issue-897/a-02-worker-restricted-20261030/bounded-port-seam/verification.json`

[verification.json](verification.json) contains exact argv, environment override, UTC timestamps, exit codes, stdout and stderr, plus the complete temporary scripts for reproduction. Node was `v24.13.0`. The RED-first and GREEN commands were identical:

```sh
DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_PORT=61149 node /tmp/carberk-a02-port-seam-8400e79c/verify-port-guard.cjs
```

The Node script reads and evaluates only the test's URL guard. Before the edit, it exited `1` with `7/9 static fixture URL guard checks passed`. The configured `61149` URL was rejected and the old `65379` URL was accepted despite the explicit override. After the edit, it exited `0` with `9/9 static fixture URL guard checks passed`. It confirms the `65379` fallback, rejection of mismatched ports, exact loopback hostname, `r6c_batch_*` database name, matching privileged host/path and distinct caller usernames. This is static guard evidence, with no application imports or service connections.

The source-equality and diff commands were:

```sh
DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_PORT=61149 python3 /tmp/carberk-a02-port-seam-8400e79c/audit-source.py
git diff --check 41e9a07a1d20b60369839b1190410f708937784b HEAD
git diff --name-status 41e9a07a1d20b60369839b1190410f708937784b HEAD
git diff 41e9a07a1d20b60369839b1190410f708937784b HEAD -- apps/worker/src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts
```

All exited `0`. The equality audit reports 3,118 compared non-documentation paths, documentation-only intervening commits, the sole authorized test change and no worktree source mismatch. `git diff --check` produced no output. The path audit reported only the test before this receipt was added, and its diff is one insertion and one deletion. The JSON records the full output and source hashes.

| Criterion | Evidence | Result |
|---|---|---|
| Current hard-coded port blocks the requested PostgreSQL port | RED-first actual guard evaluation, exit 1 | Reproduced |
| Explicit port works and default remains 65379 | Same guard evaluation after the edit, exit 0, 9/9 | Static check passed |
| All other invariants remain exact | Whole-file byte comparison after reversing the sole substitution | Passed |
| Source identity and bounded paths | Immutable checkpoint, 3,118-entry comparison and diff audit | Passed |
| Workspace typecheck/lint/test/build | Deferred under coordinator verification timing | Not run |
| A-02 ownership/capacity/rollback/race acceptance | Zero Vitest bodies executed here | FAIL/open |

These commands were **not run**:

```sh
pnpm --filter @auto-tm/worker typecheck
pnpm --filter @auto-tm/worker lint
pnpm --filter @auto-tm/worker test src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts --maxWorkers=1
pnpm --filter @auto-tm/worker build
```

A-09 owns the active verification slot. The coordinator will run affected checks after A-09 and use all ten already-authorized ordinary fixtures after assembly on fresh resources. No manifest-missing Vitest fast-fail was run. This checkout has no `node_modules`; no dependency installation was attempted.

No Docker command, service startup, database connection, API request, retained-resource access, fixture creation, migration, config change, deployment or native action occurred. Existing A-02 evidence and its FAIL receipt remain unchanged. No push or PR was performed. Documentation lookup was not applicable because the seam changes no dependency or external API.
