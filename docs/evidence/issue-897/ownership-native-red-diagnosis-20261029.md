# Ownership native RED diagnosis

29 October 2026. #897 / PR904 Milestone A. Read-only diagnosis at parent `25f80afc`. It reads the saved batched native artifacts, the registry163 attribution and full-chain receipts, and the worker and test source at `aa5eed1d`. It runs no SQL, test, build, service, producer or measurement, and it opens neither retained ownership7 nor staging. It changes no source, cap, partition, guard, budget or assertion. It does not accept anything.

## Verdict

The saved RED shows a budget mismatch on the measured 98-migration candidate. It does not identify a fixture or ownership-composition defect, and it does not establish full worker correctness. The timings warn against another native attempt without a finite cost decision. They do not prove that the assembled candidate with 162, 163 and 164 cannot meet the budget. The authority for five seconds also needs a short source/criterion trace because the test has no explicit timeout or elapsed-time assertion.

## State transitions reconstructed from the saved artifacts

Inputs are `phases.json`, `statement-observations.json` (98 samples at 50 ms, one worker PID), `before.json` and `failure-state.json`.

| Time (ms from test start) | Event | Evidence |
|---|---|---|
| 0 | Start state is pristine for this oracle: 102 grants, 102 components and 102 anchors `available`/`unchanged`, 100 grants due, 2 non-due, receipts 0/0, `UPDATE` privilege held, guards ready. | `before.json`, `beforeAll` assertions passed |
| 6–14 | `UPDATE` on `diagnostic_ownership_grants` revoked, refused cleanup starts. | phases |
| about 80 to about 1630 | Group 1 (ten oldest-by-id roots) prepare, one `diagnostic_prepare_source` statement, no wait event. Statement age peaks at 1549 ms. | observations |
| 1683 | Permission refusal at the first disposer, `ROLLBACK`. The `rejects.toThrow` message check and the eight-class equality and 0/0 receipt checks then passed, because the next phase mark was written. | phases, source |
| 1705 | Accepted cleanup starts. | phases |
| about 1752 to about 4700 | Group 1 prepare again, same ten roots, same backend, no wait event. Statement age peaks at 2931.6 ms. | observations |
| about 4735 to 4835 | Ten `diagnostic_dispose_ownership_scope` calls (14.6 ms and 4.9 ms samples) and commit. Ten grants, ten derived components and ten anchors are erased at the cutoff. | observations, `failure-state.json` |
| about 4861 | Group 2 starts and its prepare is 126 ms old when the test fails. | observations |
| 5004 | Vitest times out at the unchanged 5000 ms. | phases |

`failure-state.json` against `before.json`: grants, components and anchors each show 92 available and 10 erased. Orders, raw records, the report, the proof and the request are equal to baseline. Receipts are 0/0. The drain reconciliation shows no later group committed.

Two timing facts that earlier receipts did not state:

1. Everything except `diagnostic_prepare_source` is small. Discovery is about 0.3 ms per call, disposal is about 100 ms per group, and the pre-prepare reads are about 45 ms. One group costs about 3.1 s in the accepted call and about 1.7 s in the refused call.
2. The refused and accepted prepares are the same ten roots, the same PID (10029) and the same source bytes. The accepted one is 1.9 times slower (2.93 s against 1.55 s). That ratio equals the clone's pre-163 against post-163 prepare10 ratio (2982 ms against 1562 ms), yet this native run had no 163. Run-to-run variance on one backend is therefore as large as the effect attributed to 163 in a single shot. Call counts and registry self-time in the attribution are deterministic, but no wall-clock claim from a single pair of runs is safe.

## Budget warning from the saved candidate

The test body contains the refused cleanup, which has to prepare group 1 before it reaches the first denied `UPDATE`. That used 1.68 s. About 3.3 s remain for the accepted call. It must then prepare 10 grant groups plus the residual-component group, which is 11 prepared commands. The proof-expiry phase adds a twelfth only if proofs remain after the pair is disposed. That allows about 300 ms per prepared command, including about 150 ms of non-prepare work per group. A whole group costs 1.7 s (refused) to 3.1 s (accepted), so the shortfall is about 6 to 10 times. Eleven prepares at the best observed 1.55 s sum to at least about 17 s.

The older post-163 ten-root attribution reports these row-read and lock costs inside a 1560 ms prepare:

- `diagnostic_source_read`: 260 ms
- `campaign_preparation_scope` self time: 528.6 ms
- `diagnostic_source_insert_receipt` self time: 136 ms

Their reported times sum to about 925 ms. Subtracting that sum from the prepare time suggests a remaining cost, but nested function timings, variance and the missing 162 wrappers prevent treating this arithmetic as a lower bound on the new candidate. The accepted 164 candidate must be measured before deciding feasibility. Removing either fresh READ COMMITTED revalidation remains outside the authorized repair.

## Correctness status

No defect was observed in the first-refusal rollback or group 1 closure. That evidence covers ten independent visits and does not prove the batched source correct overall.

The real fixture is not ten independent visits. The comparative pair straddles groups: the candidate grant `1742ffa5` is in group 2, the predecessor grant `9f31c4c0` is in group 7, and the report, proof and request hang off that pair. Group 2 is therefore the first group with the shared-proof closure, with larger shared-staff closure and later-group replanning. Its graph size, cap fit and effect counts have never been measured. The 10-root measurement says nothing about it.

## Acceptance assertions still unproved

Proved at this source and fixture: the deliberate pre-start global refusal, its message, and eight-class rollback with receipts 0/0.

Unproved:

- `cleanup()` returning 0.
- All 100 grants erased with exact field values at the cutoff.
- All 100 derived components plus the independent component erased.
- Two non-due grants and the non-due component unchanged after cleanup. Their equality in `failure-state.json` only reflects that cleanup never reached them.
- Anchor mapping for the other 90 orders and for the independent component.
- Proof and request removal, and orders, raw and report preservation after a full invocation.
- Zero receipts after success.
- Completion within the 5000 ms budget, and the whole accepted path.
- The cross-group shared-proof, later-group-failure, capacity and race cases (ten extended cases authored but not provisioned).
- Closure of every group under the unchanged 100/1000 limits.

## Measurement gaps

1. Width scaling. Only width 10 (1.56 s) and width 100 (cap refusal at 1.39 s) were measured. Whether prepare cost is mostly per-root or per-prepare is unknown. If it scales with roots, no partition can fit. If it has a fixed part, the smallest group count under the cap (not yet known) decides. The attribution plan's rule "never alternative partition sizes" blocked this, so measuring it needs an explicit coordinator lift. It is a rolled-back measurement, not a partition change.
2. The refused-against-accepted 1.9 times variance on one backend has no explanation. Candidates include dead tuples from the rolled-back receipt, statistics or autovacuum, and host load. None is tested.
3. Nothing has been timed on the assembled chain. Native ran on 98 migrations. The attribution clone had 98 plus 163 and lacked 162, whose parse, scope and lock-key wrappers sit on the hot path. HEAD has all 100 migrations but not the batched worker (`aeb8cdc`, `aa5eed1d` live only on `agent/issue-897-r6c-recovery-20261029`).

## Smallest lawful next step

Not another native run, not a source edit, not a cap, partition, guard or oracle change.

1. Trace five seconds to its governing source. Distinguish a product SLO, accepted verification budget and coordinator-imposed runner default. A harness correction needs evidence and review; it must preserve every behavioral assertion, finite execution and any genuine SLO.
2. The founder has authorized one rolled-back comparison on a disposable clone of the actual assembled chain including 164, with the byte-pinned batched worker. Measure the original shared-proof group 2 and only diagnostic widths that fit the unchanged cap, three repeats per selected width, with the existing statement/client/lock limits and host-load/fingerprint evidence. This does not change production partition width or supply acceptance.
3. Choose the smallest evidence-backed repair, then prove the complete ordinary full100 path and races on a fresh fixture. No repeated native attempts or speculative worker rounds precede that decision.

## Fresh disposable fixture recipe (proposal; not run)

The retained ownership7 database has ten grants, components and anchors erased and must not be reused for a full-100 pass.

1. Build the candidate: HEAD plus the batched worker commits, with the fixture pins (98 migrations, dependency `023e6a5d`, loaded-bytes provenance) supplemented, not overwritten, for the 100-migration chain.
2. Create a new database name on the owned task PostgreSQL (for example `r6c_own100_fresh`), never ownership7 and never ports 5432, 6379 or 9000. Apply all 100 migrations with `migrate deploy`.
3. In one exclusive quiet-host window, run the existing bootstrap and the unchanged ordinary producer once (five API cohorts, concurrency 5, original 120 s, 5 s request and 45 s declared-rights horizon; the prior run took 97.4 s). Verify 100 due grants, 100 derived components, one independent component, two non-due grants, one non-due component, one comparative proof and request, and receipts 0/0.
4. Before any attempt, drain connections and take a byte-exact `CREATE DATABASE ... TEMPLATE` copy plus the saved `before.json` hash. Run each attempt on a fresh clone with its own restricted-role connection URL. A clone is a copy of ordinary-producer output, not a backfill. Every clone restores a pristine state, so a RED costs one clone instead of a 97 s producer run.
5. Before the first run, snapshot function and guard fingerprints. Keep `maxWorkers=1`, the default 5000 ms, and the unchanged spec and its `onTestFailed` evidence writers. Drain, fingerprint and release afterwards.

This recipe only fixes the non-pristine problem. With the current design it will reproduce the same RED.
