# Milestone A dispatch — 2026-10-30

The Wayfinder map was recorded before any child launch. The reconciled
candidate branch and PR head are at `6cf5c311` (the map and fast-forward
reconciliation receipts are included). All children use GPT Sol 6.1,
`codex_work`, full access, `reasoningEffort=xhigh`, and `serviceTier=priority`
in isolated worktrees. Their candidate identity remains the exact handoff base
`52d901c50af1dde97ea22bda8efb1fdf21f169b1`.

| Ticket | Task ID | State | Worktree policy |
|---|---|---|---|
| A-01 | `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a01-standards-spec-20261030-r1` | returned FAIL, S1 accepted/open | isolated |
| A-02 | `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a02-worker-restricted-20261030-r1` | terminal FAIL; evidence imported | isolated |
| A-04 | `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a04-reset-runtime-20261030-r1` | terminal FAIL/open; evidence imported | isolated |
| A-11 | r1 `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a11-spec-review-20261030-r1`; r2 `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a11-spec-review-20261030-r2` | r1 usage-limit failure; r2 terminal FAIL/open, report recorded | isolated |

A-03 and A-05 wait for their declared receipts. A-06 through A-10 remain
blocked by the dependency order in the Wayfinder map. No child is authorized
to create another coordinator, publish/merge PR #904, mutate shared staging,
build native artifacts, or claim final acceptance.

The bounded A-09 fix round is now the only implementation child:

- Task ID: `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a09-s1-fix-20261030-r1`.
- Child thread: `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a09-s1-fix-20261030-r1`.
- Exact base: `6a902544f6135273b19c6bc46e37813034fe68fa`.
- Selection: `codex_work`, `gpt-6.1-sol`, xhigh/priority, full access,
  isolated worktree.
- Allowed source paths are exactly the three S1 modules named in the map;
  affected real component/network tests and the A-09 evidence directory are
  the only additional writable paths. No reset, deployment, device, native,
  artifact, B or analytics work is in this task.
- The worker must preserve frozen IDs across exact retries and current expiry
  semantics, use deterministic IDs/time in real rendered/network tests, and
  return a checkpoint and affected verification. Any path or architecture
  expansion stops the child and returns to coordinator review.

## Immutable worktree identity

All three initial workers started at
`6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`. The exact source base is
`52d901c50af1dde97ea22bda8efb1fdf21f169b1`.

| Ticket | Child thread ID | Worktree | Branch |
|---|---|---|---|
| A-01 | `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a01-standards-spec-20261030-r1` | `/Users/bagtyyar/.t3/worktrees/carberk/t3-b921c3a3` | `t3/b921c3a3` |
| A-02 | `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a02-worker-restricted-20261030-r1` | `/Users/bagtyyar/.t3/worktrees/carberk/t3-f6408755` | `t3/issue-897-a02-worker-evidence` |
| A-04 | `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a04-reset-runtime-20261030-r1` | `/Users/bagtyyar/.t3/worktrees/carberk/t3-c04d2138` | `t3/issue-897-a04-reset-evidence` |

Coordinator read-back used `git rev-parse` on all three branch refs. Each
returned the checkout SHA above. `git diff --name-status 52d901c50 6cf5c311d`
shows exactly two added receipts, `a-wayfinder-ticket-map-20261030.md` and
`a-10-pr-reconciliation-20261030.md`. The following comparison exited 0 with
no output:

```text
git diff --exit-code 52d901c50af1dde97ea22bda8efb1fdf21f169b1 6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e -- apps packages scripts .github infra pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json
```

No relevant source, migration, test, dependency or build configuration differs.
This does not transfer evidence to a later changed source SHA. Every final
review disposition, CI receipt and acceptance artifact must name the final
assembled SHA and explain any reused evidence.

## Active resource contract

A-02 and A-04 were clarified in their existing active turns, without interrupt
or duplicate dispatch. All source and tests are read-only. Only evidence paths
and `/tmp` are writable. Source/test repairs need a separate bounded fix
dispatch from the coordinator.

| Ticket | Commands/resources | CPU/timing reservation |
|---|---|---|
| A-01 | Static source/caller inspection; no runtime resources | none; returned |
| A-02 | Exact ten batch selectors are in the map. Receipt records Compose `auto_tm_ci_897_a02_f6408755`, PostgreSQL `127.0.0.1:61139/a02_worker`, Redis `127.0.0.1:61138` DB0, MinIO `127.0.0.1:61140`, bucket `diagnostic-test-private`, sequential `--maxWorkers=1`; no ordinary fixture manifest was available | slot released after teardown; capacity/rollback/races remain open |
| A-04 | Offline Node suites and captures completed; proposed resources were never reserved or created (`127.0.0.1:55404`, Redis `56404`, object `57404/57405`, prefix `carberk-a04-c04d2138-20261030`) | no hosted/DB/object run; slot released |

Pending resource metadata is not a passed gate or permission to use another
worker's resources. Shared resets/setup, contracts, deployed mutation, native
builds, artifact generation, assembly and final acceptance remain serialized
under this coordinator. Analytics in A is compatibility/safety only.

## A-11 initial identity

- Task ID: `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a11-spec-review-20261030-r1`.
- Child thread: `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a11-spec-review-20261030-r1`.
- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-6c55a0a5`.
- Branch: `t3/issue-897-milestone-a-spec-review`.
- Initial checkout: `a8b5aa0d08c2898eef5247e59b800fb196e1ccde`.
- Source base: `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- Main/base: `9fde309c3da17f2661fe9c266504e6e56a1b97c9`, also the
  current candidate/main merge base.
- Selection returned exactly `codex_work`, `gpt-6.1-sol`, xhigh/priority,
  full access and worktree isolation. No runtime/CPU/device resources.

The `52d901c50..a8b5aa0d` diff contains only five files under
`docs/evidence/issue-897`: the map, reconciliation, dispatch, Standards report
and updated execution record. The same source/test/config comparison used for
the first wave exited 0. Lightweight coordinator verification passed
`pnpm check:agent-docs`, `pnpm check:glossary` and `git diff --check`.

The r2 retry ran in `/Users/bagtyyar/.t3/worktrees/carberk/t3-a38766b5`,
branch `t3/issue-897-milestone-a-spec-review-1`, at immutable HEAD
`69948805f6f41f199634300ba2fbaf8c38630be1`. Its source/test/migration/config
comparison to `52d901c50af1dde97ea22bda8efb1fdf21f169b1` exited 0. It returned
FAIL/open with blockers A-02, A-04, A-03 and A-05–A-10, and no source-fix
finding. The coordinator recorded the report at
`a-11-spec-review-20261030.md`; A-09 therefore has no A-11 source paths.

## A-02 terminal receipt and resource release

Evidence was copied from the child worktree into
`a-02-worker-restricted-20261030/` without changing its bytes. The child
receipt and `SHA256SUMS` remain authoritative.

- Candidate/base: `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- Immutable child HEAD: `6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`; 1,619 relevant
  files byte-match the candidate. The 102-migration manifest is
  `6db6fbf01a14c9a04cf4aa161b83133294647a777d7a39b62932990b44a019e8`.
- Exact selectors and environment are in `execution-manifest.json` and the
  `.command.json` receipts. Resources were Compose project
  `auto_tm_ci_897_a02_f6408755`, PostgreSQL `127.0.0.1:61139/a02_worker`, Redis
  `127.0.0.1:61138` DB0, MinIO `127.0.0.1:61140` bucket
  `diagnostic-test-private`, UUID fixture keys, and sequential `--maxWorkers=1`.
- Restricted preparation passed 12/12. Batch setup failed because the required
  ordinary per-case fixture manifest was absent; all ten case bodies were
  skipped. Capacity, rollback and race gates remain FAIL/open. No source/test
  changes, ordinary full100 rerun, shared DB access or PR occurred.
- Cleanup passed: trigger readiness restored, receipts `0/0`, rows/roles/
  connections/objects/Redis keys removed, and the Compose project and volumes
  destroyed. The exclusive timing slot is released.

The missing fixture manifest is a prerequisite blocker, not permission to use
the retained foreign task on port 65379. A separate evidence-only dispatch is
required if the Parent supplies or authorizes production of the ten private
ordinary fixtures.

## A-04 terminal receipt and resource release

Evidence was copied from `/Users/bagtyyar/.t3/worktrees/carberk/t3-c04d2138/`
into `a-04-reset-runtime-20261030/` without changing its bytes. The receipt
records immutable HEAD `6cf5c311d43b5ae0bca0f2543564f65b5d2e2a9e`, source base
`52d901c50af1dde97ea22bda8efb1fdf21f169b1`, reset-migration SHA256
`a46a2ea29d04d0f5ad0d480aa3d2c92ef677388b3f6a808676ab8baa4ab79cdd`, and
source/config equality. Offline suites passed 181/181; controller/ledger was
51/52 and Railway-focused was 37/59. The retained-schema restoration mismatch
omits four candidate migrations. PostgreSQL, Redis, object storage, shared
staging and hosted restoration were not run. No task containers or processes
remain. A-04 is FAIL/open and this receipt does not authorize a source/profile
fix.

## A-11 failure

The child task ended before returning a report with the provider usage-limit
error. This is an environment blocker, not a Spec verdict. The Spec review is
open and A-09 cannot start until an independent Spec report is returned and
recorded. Retry r2 is a new independent review round carrying forward the r1
brief, failure and unresolved review requirement.

## A-11 retry identity

- Task ID: `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a11-spec-review-20261030-r2`.
- Child thread: `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a11-spec-review-20261030-r2`.
- Selection: `codex_work`, `gpt-6.1-sol`, xhigh/priority, full access,
  isolated worktree. The retry is read-only and has no runtime resource
  reservation.
