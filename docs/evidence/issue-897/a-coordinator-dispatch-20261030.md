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
| A-02 | `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a02-worker-restricted-20261030-r1` | running | isolated |
| A-04 | `node:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a04-reset-runtime-20261030-r1` | running | isolated |

A-03 and A-05 wait for their declared receipts. A-06 through A-10 remain
blocked by the dependency order in the Wayfinder map. No child is authorized
to create another coordinator, publish/merge PR #904, mutate shared staging,
build native artifacts, or claim final acceptance.

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
| A-02 | Exact ten batch selectors are in the map. Concrete fixture manifest, container, DB/Redis/object namespaces and ports awaited before host-heavy execution | exclusive next slot; no second heavy run |
| A-04 | Offline Node suites from the map may run; exact remaining DB selectors and unique resource manifest awaited | PostgreSQL/timing execution queued behind A-02 |

Pending resource metadata is not a passed gate or permission to use another
worker's resources. Shared resets/setup, contracts, deployed mutation, native
builds, artifact generation, assembly and final acceptance remain serialized
under this coordinator. Analytics in A is compatibility/safety only.
