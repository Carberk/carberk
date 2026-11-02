# A-02 bounded correction contract, 2026-11-02

This is a separately pinned correction under the existing A-02 task and
worktree. It records the Parent's criterion disposition without creating a
second map or changing production behavior. A-02 remains FAIL/open until the
unchanged worker command runs all ten real cases and cleanup.

## Authority and exact identities

Parent authority is [release-parent-a02-disposition-20261102.md](https://github.com/Carberk/carberk/blob/c0eb1e282013070b1f0582a10515f240986de578/docs/evidence/issue-897/release-parent-a02-disposition-20261102.md)
at commit `c0eb1e282013070b1f0582a10515f240986de578`. It permits this bounded
test and producer correction only. It does not permit a production guard,
controller, migration, contract, configuration, or worker implementation
change.

The existing child returned a clean terminal handoff:

| Identity | Value |
|---|---|
| Source edit base | `5a0a2b1216b696bc9b2f6b89ef0764cc3f18cd1b` (tree `d0a28b674929ec5d898c6c31e65a5f6415d0be46`) |
| Evidence/worktree base | `57b44c0645a0197ecd237975e41d1909b03dd36b` (tree `4a616b5fd5efc88199e0b8b187a22057ae7be161`), parent `77458f5137c4b31b222438c30d98b86ae814e131` |
| Worktree | `/Users/bagtyyar/.t3/worktrees/carberk/t3-fac70050` |
| Branch | `t3/issue-897-a02-batch-fixture-producer` |
| Completed continuation task | `node:delegated-task:command%3Amcp%3Aadb39827-7411-40fa-8511-68a7f99397bd%3Athread-send%3Aissue897-a02-existing-recovery-resume-20261102-r1` |
| Original child thread | `thread:delegated-task:command%3Amcp%3A19e6e17f-fa2f-44ab-9065-2410f17a9389%3Adelegate-task%3Aissue897-a02-batch-producer-repair-20261030-r1` |
| Provider selection | `codex_work`, `gpt-6.1-sol`, xhigh/priority, full access |
| Original campaign source | `52d901c50af1dde97ea22bda8efb1fdf21f169b1` |
| Accepted assembled source | `4b2c8a6f6161f9c825945637f6f848c64adeb145` |

The child proved `git diff --exit-code 5a0a2b12..57b44c06 -- . ':!docs'`
with no output, and proved the pre-source interval from `077c4adedf9c6e776e0daca433c7855d968716ec`
to the final evidence HEAD changed no path outside the producer, boundary test,
and evidence allow-list. The six recovery hashes, 15 accepted input pins and
102 migration checksums remain unchanged. The child worktree was clean. The
source and evidence identities stay separate in every later receipt.

## Owner, allowed paths and dependencies

The same existing A-02 worker is the sole writer. The coordinator remains the
only assembler and owns runtime resources, resets, affected verification,
review, and final acceptance. No duplicate task, child, worktree, provider or
PR is allowed.

Writable paths for this correction are exactly:

- `apps/worker/src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts`
  for the two literal expiry status/code assertion pairs and the complete
  connected-union overlimit case, including the required dependency/cardinality
  and complete persisted-state evidence assertions.
- `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs`
  and its already allowed direct boundary test
  `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.test.mjs`.
- `docs/evidence/issue-897/a-02-worker-restricted-20261030/` and the private
  `/tmp/897-r6c-a02r2-20261030/producer-repair/` receipt directory.

Production API, controllers, worker implementation, contracts, migrations,
configuration, Compose files and the accepted ordinary producer/bootstrap are
read-only. If the connected union or oldest-capacity fixture cannot be produced
under unchanged ordinary routes and limits, return the exact dependency and
leave that selector OPEN. Do not add a protected-row or pre-guard fixture lane.

## Required bounded changes

1. Replace the old single-order raw-row prerequisite with complete ordinary
   roots whose retained registry/effect union exceeds 1,000 keys in **one**
   unchanged production worker command. Put the failing group first and use no
   more than ten roots in the first group. Record the roots, shared retained
   edges, registry/effect cardinalities and the actual restricted-worker
   `diagnostic_source_scope_limit` refusal. Several under-cap commands summed
   together do not qualify. Preserve the single-root refusal invariant without
   claiming a singleton runtime proof, and preserve all selection/workset,
   independent-component, foreign-control, width, iteration, cap, budget and
   rights assertions.
2. Repair the ordinary oldest-capacity plan so its 101st/newer grant has a
   later declared end while its independent component is due at the frozen E,
   without extending E or changing ordinary rights. Record the complete
   ordinary route sequence and the selected ranks.
3. In both early-refusal and final branches, retain the same classified
   worker-first capture request and assert literal HTTP `400` with
   `DIAGNOSTIC_INVALID_INPUT` at or after its actual expiry. Retain the same
   proof-use request and assert literal HTTP `403` with
   `DIAGNOSTIC_NO_ACCESS` for expired or disposed proof. Do not use a generic
   4xx set, a fixture-supplied expected status, stale-version input or unrelated
   validation failure. Reverse-before-E must remain HTTP `201` with the same
   request, real barriers, exact retries and complete row/receipt/privacy
   assertions.

Keep the historical `fresh-ordinary-fixtures/source-pins.json` unchanged.
The authorized batch spec edit necessarily changes its old byte pin. Add a
correction-specific evidence pin manifest and teach only the new producer to
validate that exact corrected spec hash. Prove all other 14 accepted hashes
unchanged, along with all 102 disk migrations and source/loaded-module hashes.
Do not bypass pin validation, trust arbitrary fixture-supplied hashes, or
silently rewrite the accepted historical receipt.

## Offline verification before assembly

Before editing, run the first comparison and confirm the clean HEAD/tree above.
Run subsequent checks serially in the child worktree, recording UTC start/end,
duration, argv, exit and output:

```text
git diff --exit-code 5a0a2b1216b696bc9b2f6b89ef0764cc3f18cd1b..HEAD -- . ':!docs'
node --check apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs
node --test apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.test.mjs
git diff --check
git diff --name-only 57b44c0645a0197ecd237975e41d1909b03dd36b..HEAD
```

The final allow-list audit must show only the three source/test paths above and
ticket evidence. No package command, service, database, HTTP, object storage,
Compose, migration/reset, native build, deployment or PR mutation is part of
this correction. The child must commit a new source checkpoint and an
evidence-inclusive HEAD, with the two identities and the exact diff proofs in
`correction-handoff-20261102.md` and `verification-correction-20261102.json`.
Read this coordinator-owned contract at its pinned commit; do not overwrite it
with the child report.

## Serialized runtime manifest and gate

Only after coordinator assembly, affected verification, and independent
Standards/Spec review may the coordinator reserve the exclusive host-heavy
slot. The fresh resources are fixed as follows:

| Resource | Planned identity, not started |
|---|---|
| Compose project | `auto_tm_ci_897_r6c_a02r2_20261030` |
| PostgreSQL | `127.0.0.1:61149` |
| Redis | `127.0.0.1:61148`, DB 0 |
| MinIO | `127.0.0.1:61150`, bucket `diagnostic-test-private` |
| Task databases | the ten distinct names already enumerated in the [existing dispatch ledger](../../a-coordinator-dispatch-20261030.md) |
| Private object/receipt root | `/tmp/897-r6c-a02r2-20261030/` |

Port `65379` is prohibited. The slot runs one Vitest worker, at most five
in-flight producer requests, a 120-second setup deadline, a five-second
per-request bound, and the existing fixed 45-second declared rights horizon.
No CPU-affinity claim is made. No A-04, build, deployment, native, or other
timing-sensitive run may overlap. The coordinator records the actual command,
case selector, resource names, start/end/duration, cleanup and restoration.

The correction is ready only when the child proves the bounded source change
and its offline guards. A-02 passes only after the coordinator runs every ten
unchanged-or-authorized case body against fresh private resources, proves the
restricted preparation, connected-union refusal, literal expiry outcomes,
rollback/race convergence, complete erasure/privacy, zero source/campaign
receipts, exact trigger/object/role restoration and cleanup. Any skipped,
ambiguous, singleton-only, under-cap aggregate, dirty, or timing-unproved case
keeps A-02 FAIL/open. The final assembled SHA must appear in the verification,
review and Parent acceptance packets.
