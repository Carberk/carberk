# PostgreSQL backend refusal diagnostic handoff, 2026-10-21

Bounded diagnostic writer under #897/#901. Root alone assembles into PR #904; this writer opens no PR. Reserved and pushed `agent/issue-901-pg-backend-lifetime-20261021` before edits from commit `96c0c844cdfed5a0e5f1ce658e6788ea65d14f90`, tree `1884ce1a76650555a4b0cef55d981b27d6c92af7`. This checkpoint changes only this report. No fixture or reset repair is justified by the available evidence.

## Runtime evidence and limits

Hosted run `39686572675`, DB job `119522309782`, is RED on the supplied base. The private raw log's SHA-256 was independently checked with `shasum -a 256 /tmp/carberk-resume-20261021/96c0-db-119522309782.raw.log`: `ef07e9dbe9eed654230ecd58f0bad251cf9feb29437b19aa29eaf618f9298723`. No raw log is committed.

The log reports 40/41 DB files and 390/391 tests passing. The failing case is `recovers pending PG once after a real Redis restart reloads the actual completed marker`. Its stack is `receiptOf:146 -> prepare:288 -> lostReplyForRestart:399 -> case:551`. `prepare:288` is the ordinary PostgreSQL rows request, following a successful inventoried request. Result: code 1, `Clean reset refused: other database backends present`, empty SQL diagnostics. No restart or recovery assertion was reached. The predecessor's six passing Redis cases and the seed reconstruction success are dispatch evidence, not new executions by this writer.

No local PostgreSQL, Redis, Docker/container runtime, Railway, inventory, reset, deployment, credential or quota operation was run. The hosted symptom was not reproduced locally. Diagnosis therefore stops before selecting or repairing a cause, following the diagnosing-bugs discipline's requirement for a reproduction at the actual seam. A fake that merely delays backend disappearance would assume the disputed cause.

## What the source establishes at the exact base

- The interrupted spec's `query()` creates one target `Client`, awaits its query and awaits `client.end()` in `finally`. `connect()` precedes the `try`; a failed connection is a cleanup risk in principle, but the supplied log contains no such setup failure. That is not evidence for this symptom.
- `settle()` uses an autocommit `Pool` with `max: 1` against `/postgres`, while the test target is the disposable database. It counts target client backends and must observe zero before each `run()`. Its existing 100 observations and 100 ms interval were not changed.
- `run()` awaits `settle()` once, then evaluates the real serialized reset program. Each remapped synchronous SQL child runs `scripts/testing/query-disposable-postgres.cjs`, which awaits `client.end()` in `finally`. A single rows request can run both observation and mutation children. There is no additional fixture `settle()` between those children.
- The remote program has two distinct refusal sites with the identical message. The read-only observation checks `inventory.backends` before any reset transaction. The subsequent locked reset transaction clears the activity snapshot and polls up to 50 times at 100 ms before checking again. The received failure does not identify which site refused. Empty SQL diagnostics do not identify it either: a policy refusal need not raise SQLSTATE.
- Installed `pg` source resolves `Client.end()` from the connection's `end` event; the connection forwards its stream's `close` event. This proves that the helper waits for its local connection lifecycle. It does not prove when the server removes the backend from `pg_stat_activity`. No early `process.exit()` was found in the helper.

These observations rule out the claim that the fixture simply omits awaiting close. They do not rule out a lingering server backend, a fixture leak, or a snapshot-related observation. The current raw log contains no conflicting backend count, PID, child ordinal or refusal-stage evidence.

## Ranked predictions, all untested

1. Prior SQL child backend remains visible after local close. Prediction: the refusing inventory names the PID recorded by the immediately preceding child, despite that child's completed close/exit. If the initial rows observation refuses, the relevant predecessor is the inventoried request's child; if the reset transaction refuses, it may be the same rows request's observation child. A different PID falsifies that specific attribution.
2. A fixture or migration connection survives. Prediction: the conflicting PID belongs to an independently recorded fixture/migration connection, rather than the preceding SQL child, and remains visible across child boundaries. Every successfully connected fixture client reaching close, with only a prior child PID conflicting, falsifies the fixture-client version of this lead.
3. Activity snapshot timing changes the view. Prediction: fresh maintenance observations and the refusing transaction's activity observation disagree about the same PID at the relevant boundary. Mere absence in a later maintenance observation is insufficient: the backend may have exited between observations. A persistent, independently observed backend makes a stale-only explanation insufficient.

## Minimal next hosted gate owned by root

First inspect this checkpoint. If further diagnosis is needed, instrument only the disposable fixture/transport in a separate reviewable checkpoint; preserve production SQL and refusal semantics, all three original DB reset suites, all six interrupted test bodies and both CampaignFullV3 assertions. Do not add a wait, retry, timeout increase or success authority.

The instrumented run needs these bounded observations at the actual synchronous child seam:

1. Give each fixture connection and SQL child a fixed role plus monotonically increasing ordinal. Record its PostgreSQL backend PID after connect, and local close completion/child exit with monotonic times. Do not emit SQL, URLs, application-supplied strings or rows.
2. In the existing subprocess remap, inspect only the actual `clean-reset:` JSON envelope already returned by the program. Record phase, child ordinal, `inventory.backends` when present, or `verdict` when present. This distinguishes initial observation refusal from locked-reset refusal without changing either query or its output passed to the program. A subprocess error remains a subprocess error.
3. Correlate conflicting backend PIDs with connection/disconnection timing. Use disposable PostgreSQL server connection/disconnection logs kept private, or a separate maintenance observer connected to `/postgres` that records only target client backend PIDs and fixed state categories. Never sample through the target database, which would itself introduce a backend. To prove the identity seen by the refusing inventory, collect same-observation PID evidence in test-only instrumentation; a later sample alone cannot supply it. Any SQL instrumentation that changes snapshot acquisition must be explicitly identified as a perturbation.

Start with the unchanged focused hosted suite command `pnpm --filter @auto-tm/db exec vitest run scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`, keeping all six cases. A pass is inconclusive for this intermittent refusal. A failure must preserve the stage, conflicting count/PID attribution and predecessor lifecycle evidence. If focused runs remain green, root must run the normal full hosted DB gate to retain the original scheduling/load context. No attempt count or timeout budget is expanded by this report. After a supported repair, root still needs the full hosted DB suites and applicable assembled-candidate gates.

## Offline checks and preservation

`node --test scripts/testing/query-disposable-postgres.test.cjs scripts/staging-clean-reset-remote.test.mjs scripts/staging-clean-reset.test.mjs`: exit 0, 27/27 pass. These validate existing contracts and bounded SQL diagnostics; they do not reproduce the backend refusal. No failing regression or GREEN claim is made. Docs: not applicable, no dependency or external API change; installed dependency source was inspected only to establish the close boundary.

The sole changed file is this report. All source, manifests, protected reset specs, interrupted test bodies and CampaignFullV3 assertions remain byte-for-byte unchanged from the supplied base. No overview ownership or behavior changed. A docs-only checkpoint is exempt from an artificial RED test; runtime diagnosis and repair remain blocked on hosted evidence. Root owns the next instrumented hosted observation and final assembly decision.
