# Classified capture/disposal race investigation, 2026-10-23

Status: STOPPED at the requested source-writer prerequisite. No race tests or test helpers were added. Both winner orderings and the expiry/proof-cleanup collision remain NOT PROVEN. This is a source inspection receipt, not SQL execution, service acceptance, or a behavioral RED/GREEN result.

## Ownership and verified input

Parent: #914/#897, sole [draft PR904](https://github.com/Carberk/carberk/pull/904). Test writer owns branch `agent/issue-914-classified-capture-races-20261023` in `/Users/bagtyyar/.t3/worktrees/carberk/t3-bd1f53cf`. The host scaffold was `t3/bd1f53cf`, initially clean. Supplied base `01a3c5f887708441d2b26cfa1ab4045385e685fe` and tree `157372f1436e69818cd9389a24a40ef79334f95a` matched exactly. The issue branch was reserved and pushed at that base before editing. No integration branch push or issue PR was made. Final checkpoint SHA/tree are returned separately to avoid self-reference.

The published integration checkpoint is `be2f5b39e989b49ab65d66712ea7d568db68fa06`; it is background, not this writer's base or verification result. The supplied [capture receipt](classified-forward-capture-receipt-20261023.md) and [combined assembly receipt](../issue-897/capture-admin-combined-assembly-20261023.md) retain their existing evidence and limitations.

Real-source collection basis and end remain UNESTABLISHED. Any future fixture declaration must say SYNTHETIC explicitly. Automatic admission remains CLOSED. This investigation grants no authorization, TTL, hold, historical backfill, ownership witness, or admission capability.

## Existing real boundaries inspected

- `apps/api/src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts` uses authorized HTTP observations, the injected disposable worker database, and a fenced child Node process loading the actual worker through `tsx/cjs`. The child asserts GitHub Actions, the exact injected database URL/name and loopback host before executing `PurgeExpiredAccounts.execute` or `DiagnosticArtifactWorker.cleanup`. Its existing child timeout is 60 seconds. It has no IPC barrier or cancellation handle exposed to a test.
- `DiagnosticReports.e2e.spec.ts:504` supplies the existing transaction-holder pattern: row locks, `pg_blocking_pids` observations outside the holder transaction, bounded polling, release on unwind, and draining dispatched HTTP promises. Related continuity/public-transfer suites use the same pattern. This is PostgreSQL lock evidence; simultaneous dispatch or elapsed sleep is insufficient.
- `apps/api/vitest.config.mts` provides the disposable SQL/Redis setup, worker isolation, 120-second test timeout and 60-second hook timeout. No setting was changed. No new local service, SQL connection or e2e execution was attempted.

The requested guidance, diagnostics and worker overviews, ADR-0108, glossary and both supplied receipts were read. No nested agents or quota probes were used.

## Concrete source prerequisite

The expiry collision has a source-level interleaving that the current successful-disposal contract does not handle. It does not require an automatic ownership witness or a new source-mutating trigger.

Relevant source:

- `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts:214`: the observation transaction acquires `DiagnosticPublicBindings.lock`, creates its raw identity record, appends the ownership component, then writes `VEHICLE_OBSERVED` audit before returning/committing.
- `apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.ts:17`: capture checks declaration end and earlier anchors, then inserts a new available component. It does not perform a commit-time rights check.
- `packages/db/prisma/migrations/20261023090000_diagnostic_ownership_components/migration.sql:108`: the INSERT guard checks rights against `clock_timestamp()` at INSERT. An INSERT can precede the declared end while its transaction commits after that end.
- The same migration at line 116 selects available expired components into the disposal discovery JSON. Its `c` array contains individual raw/component IDs, independently of the upstream lock graph.
- The same migration at lines 188–195 discovers once, acquires sorted User → Business → Listing → orders → reports → proofs, then rejects **any** target JSON change with `diagnostic_ownership_disposal_targets_changed`, before redaction.
- `apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts:215` invokes that operation in a transaction before proof-payload/evidence expiry. `cleanup` awaits it; there is no recovery of changed discovery inside this invocation.

Required hosted reproduction, not executed here:

1. Through authorized HTTP, create an available original component with explicit SYNTHETIC rights ending at E. Keep its original raw/hash/report pin. Personal and Business fixtures must distinguish their real subject sets.
2. Start a second authorized HTTP observation before E, using the same declared end. Let its real transaction insert the new raw and available component, retaining the User/Business/Listing/order locks, but hold its later audit INSERT before commit. A disposable-database table-lock barrier on `diagnostic_audits` can target this existing post-append write without replacing a product method or inserting a fake component. This barrier itself has not been implemented or validated.
3. Once PostgreSQL time reaches E, start the actual cleanup worker with a consistent cutoff at/after E. Do not fake expiry by sending a future worker cutoff while the database clock is before E. Disposal discovery sees the committed original component, cannot see the new uncommitted component, and waits on capture's User prefix. Observe that actual wait through the database, rather than assuming it from request dispatch.
4. Release the audit barrier. Capture commits. Disposal then locks and rediscovers both expired component IDs. Even when every upstream lock target is unchanged, `targets.c` differs. The current function raises before component or proof-payload cleanup; the worker invocation rejects.

The transaction/clock interleaving is inferred from source. PostgreSQL isolation, exact lock waits, worker startup timing and the proposed barrier require hosted confirmation. This receipt does not claim a reproduced failure. In particular, simply adding a component belonging to a replacement seller does **not** necessarily change a historical seller purge's selected set. Scheduled-deletion checks also prevent treating an already scheduled current seller's new capture as available. Those are not substitutes for the reachable expiry interleaving above.

Minimal next source-writer brief: define and implement successful disposal when capture commits another affected component inside an already locked graph. Re-select affected components under the held complete prefix and distinguish safe additions within that graph from additions requiring new upstream locks. Never extend User/Business/Listing locks behind an order. If the graph expands, retain fail-closed behavior and define recovery outside the abandoned transaction under an approved bounded policy. Cover the real worker invocation as well as the SQL operation. Preserve original raw anchors, hash v1, report pins, dates/mileage and consumed B's minimal retry binding. This is a proposed fix brief, not permission to change retries, budgets, product source or migrations in this test branch.

No knowingly incomplete concurrency test, tautological SQL copy, fake database, inserted proof row, artificial failing test or expected-refusal assertion was added to present this missing successful-disposal behavior as acceptance. The explicit dispatch instruction says to STOP when the full race requires a source-writer prerequisite. That stop condition applies here; this writer did not change the product.

## Hosted assertions still required after the prerequisite

For each reachable personal/Business ordering, force and observe the actual blocking transaction, identify the winner, and drain/cancel every dispatched operation before namespace cleanup. Any worker helper must preserve the existing database fence and child timeout, expose bounded diagnostics/cancellation, and release database locks on all failure paths. It must not alter global e2e budgets, retries or concurrency.

Disposal first must prevent a stale available tuple, late historical-subject capture and resurrection. An erased/unavailable original anchor must remain unusable after a later declaration; no repair/backfill is permitted. Capture first must allow subsequent disposal to find all newly retained affected subjects and clear affected component/proof payloads. Historical seller/member subjects must be distinguished from the current Listing seller and current membership. Personal seller/commissioner overlap cannot be represented as an unrelated surviving commissioner C; use a separate genuinely unrelated C fixture where necessary. Business fixtures must exercise the additional Business/member lock prefix.

Use HTTP-issued and consumed comparative proofs, ordinary authorized B retries/writes/release/read, and the actual purge/cleanup worker. Assert affected payload deletion, changed-proof retry conflict and exact consumed-B retry survival. Preserve unrelated C's retained evidence, raw anchors/hash v1, original report pins, dates and mileage; assert those saved records rather than reconstructing expected hashes with production code. Do not broaden into automatic admission or claim SQL-adversarial coverage proves concurrency.

The expiry/proof-payload collision above needs the same original-record preservation assertions and cleanup idempotence once successful disposal is implemented. All these hosted assertions remain UNKNOWN/NOT PROVEN. Parent owns normal-push CI, independent review, deployed acceptance and later joint manual native/signed-artifact gates.

## Verification and preservation

This checkpoint changes only this receipt. Every tracked base file, including all existing tests, product source, API/contracts, schema/migrations, worker renderer/scheduler, configuration and lockfile, is byte-identical. No TypeScript/helper code changed, so compilation, lint and unit reruns would not establish the missing behavior and were not run. Documentation/static checks and a base-blob preservation audit are the applicable checks; exact commands and log SHA-256 manifest follow below.

No local Docker/listening services/e2e, CI polling/rerun/dispatch, Railway/deployment/reset/credential search, device/emulator/screenshots/signing/store operation occurred. The three Railway refusals remain terminal; no new attempt was made. Worker scheduler render-budget work remains STOPPED and unchanged. No behavioral RED/GREEN, collection or service acceptance is claimed.


Exact offline checks:

| Command | Result |
| --- | --- |
| `pnpm test:agent-docs` | Exit 0; route/link checks and 8 documentation tests pass |
| `git diff --check` | Exit 0; working tracked diff at check time was empty |
| `python3 /tmp/914-classified-capture-disposal-races-20261023/audit-preservation.py` | Exit 0; all 4,256 tracked base files unchanged, including 926 tests |

The first inline preservation audit failed with `TypeError: zip() takes no keyword arguments` on the host Python before producing its report. The corrected `/tmp` helper uses a separate length assertion and ordinary `zip`; its successful run is recorded above. This was tooling preparation, not a product test failure. The pnpm documentation command automatically materialized dependencies from the existing cache (2,034 reused, zero downloaded); the subsequent audit confirms the tracked lockfile and all other base files are unchanged.

Logs and audit artifacts are in `/tmp/914-classified-capture-disposal-races-20261023`. `commands.json` records the exact successful check commands, exits and log hashes. `preservation.json` records the base, count and empty changed-base-file list; `existing-tests.sha256` hashes each retained test. Hashes identify local bytes only. The final staged/committed diff check is reported with the checkpoint handoff.

```text
058adad45e930402550c2a00e14dc9b07a0163e66a11cfc303ccd649fce3630d  agent-docs.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  diff-check.log
78ad8723f2f9b80cee73094cfa175023f609bc1fb24342eb41b0a9c4df7d6544  preservation.log
78ad8723f2f9b80cee73094cfa175023f609bc1fb24342eb41b0a9c4df7d6544  preservation.json
2fb4ac98bde7f8a6388ab871960f97255b8f66a0f7c3aceb0dabdbdab7846d64  existing-tests.sha256
62e26c81edaa143603065728fdc395554490d981f1a73b74b4848fd9acd51ab5  audit-preservation.py
d19975e1e41f836e05b7af1990dfaa2e7afd1927fc6d849a0d8e8b66de757cf7  commands.json
```
