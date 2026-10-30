# Improvement fact acceptance diagnosis, 2026-10-23

Diagnostic-only handoff for #897/#917/#918 through draft PR904. Root cause and real runtime acceptance remain **UNKNOWN**. No production defect or fixture-lifecycle repair is claimed.

## Ownership and checkpoints

- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-4e77d369`.
- Branch: `agent/issue-917-improvement-fact-unavailable-20261023`, reserved and pushed before edits. Host scaffold `t3/4e77d369` remains at the supplied base.
- Base: `4538ae99bfdfa2504f81a2e090eec2b6af496384`, tree `72c26ddac1a754d4367b1d8f1c18b3b029623013`.
- Pushed diagnostic-test RED: `3bedec19`.
- Pushed diagnostic source GREEN: `473457eda453bd5624c5692bddc79e6e0cbd25c1`, tree `f1b81fcce54f9d97f0fc4be083cfc841e969e723`.
- This receipt is the final documentation checkpoint on the same branch. Parent owns incorporation, PR execution records, independent Standards/Spec review and hosted CI observation. No child, additional worktree, issue PR or integration push was used.

## Established evidence

[Hosted run 39902267267](https://github.com/Carberk/carberk/actions/runs/39902267267), API job 120246339103 on `b7411ba51ae4a5a77f3b5d1fb87cb388bf08499d`, failed in `Improvement.e2e.spec.ts`. The helper assertion at line 73 received `unavailable` instead of `accepted`; caller 83 is the first loop of server `listing_visibility_changed` facts for buyer principals. The index within that loop is not identified. Worker recomputation and the HTTP 16/12 assertions had not been reached. The entire test took 1631 ms, which does not isolate the append duration.

Raw `/tmp/carberk-resume-20261021/b741-api.log` SHA256 was independently verified as `0faa2b760e5824a145ecfa290a1d07ad7eaf0759bc4def6159e1b174aafb40fb`. The stripped log and `b741-hosted-summary.json` agree. The failure vicinity and measurement/Prisma-error searches expose no underlying database exception or append timing. Overall API 3388 PASS/7 FAIL, worker 373 PASS and DB 392 PASS do not establish this append's cause. The other six failures and prior backend attribution remain outside this handoff.

Source inspection establishes:

- `AcceptMeasurement.afterCommit` returns `unavailable` for either a rejected append or its existing 250 ms race deadline. A deadline does not cancel the pending database transaction.
- Activation, purpose, schema, origin, population and event-time refusals return other receipts. Principal/bootstrap/resolve succeeded sufficiently to reach the assertion, but this does not prove append-time transaction health.
- `PrismaMeasurementStore` checks admission, locks the collector state for epoch validation, locks the principal for generation/kind/expiry validation, checks the existing visit, invokes the owning conversion port, and inserts with durable event-ID dedupe. Its transaction uses maxWait 250 ms and timeout 1000 ms. None of those budgets changed.
- Listing's conversion adapter returns immediately for visibility facts. Its Listing owner/member database lookup applies to Call intent and detail-open facts. This visibility failure does not establish a conversion-authenticity defect.
- `PrismaMeasurementCommit` isolates owning-fact outbox capture with a savepoint and restores transaction-local statement/lock settings. This helper calls `afterCommit` directly, so that savepoint path is not traversed here. No savepoint or ownership logic changed.
- Identity deletion locks the collector and removes principals/raw linked history. Restore epoch rotation and principal/visit fences remain intact. The fixture has suite-derived IDs and per-test cleanup/bootstrap; configured e2e infrastructure assigns databases per worker and runs files sequentially within each worker. No fixture-isolation failure was established.
- A base comparison found no changes from failed b741 to supplied 4538 in measurement, Listing conversion composition, measurement capture, or the inspected fixture/global setup files. No mechanical interaction with the prior privacy fix was found.

The logs cannot distinguish ledger rejection from the race deadline. No timeout, clock, collision or flaky-root-cause label is supported. The explicit dispatch prohibits local services/e2e and permits instrumentation when evidence is insufficient, so the original hosted repro was neither rerun nor replaced by an asserted unit-level root cause.

## Exact change

Added fixed `[measurement-unavailable]` warnings for `ledger_deadline` and `ledger_rejected`. Store rejection also reports the last transaction phase: start, epoch lock, principal lock, visit read, conversion check, record insert or commit. The phase identifies the last initiated operation, not a proven failing SQL statement. Rejection after the response deadline is still observed.

The shared reporter emits only the fixed phase and a `P` plus four-digit Prisma-shaped code, otherwise `unknown`. It emits no raw exception/message/stack/metadata, SQL, payload, principal, visit, event, epoch or capability identifier. Diagnostic-output errors cannot replace a database error or change the receipt. Unknown codes remain unknown; these diagnostics do not guarantee a database root cause on the next run. No new collector storage or authority is introduced.

Only `AcceptMeasurement.ts`, `PrismaMeasurementStore.ts`, the small shared reporter, a new offline diagnostic spec and this receipt changed. No fixture setup or original e2e body changed. All 916 existing tracked test files matching `.test`/`.spec` JS/TS variants was compared by blob against the supplied base and remained unchanged. This broader scan includes the original 913-file preservation requirement.

## RED, GREEN and verification

Command for the same diagnostic tests before/after source:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/measurement/infrastructure/MeasurementUnavailableDiagnostics.spec.ts
```

RED was 9 failed/2 passed, specifically missing warning outcomes, before production edits; it was committed and pushed. GREEN was 11/11. These tests exercise real ingress/store/visit policy with a fake database boundary, all seven rejected phases, strict sanitized output, the unchanged 250 ms deadline, later rejection, successful receipt/deadline cleanup and preservation of the original error when logging fails. This is diagnostic-behavior RED/GREEN, not a reproduction or resolution of hosted acceptance.

Logs under `/tmp/carberk-917-unavailable-20261023/`:

- `red.log`: SHA256 `5fb07dee8c324b373e0b45f19696d7d30c1293552695c8b043401bf0dd0e8926`.
- `green.log`: SHA256 `8bf87254d5021c7f82f7e1e16a9a781bd242d1ed9d31998b3c7380d0456f834b`.
- `repo-unit.log`: SHA256 `7d5b9cc2492d1aac2e6913e897543f1c0c33d2183c45a1e857d0decaa9d0b4c0`.
- `repo-typecheck.log`: SHA256 `6c57b1baffebea2aca5820cc87985883b925f92e5b59597d27952cb1a135a325`.

Passed: configured DB build/Prisma generation with safe localhost placeholder, contracts build, API lint, API TypeScript 7 and TypeScript 6, API Nest build, `pnpm test:unit` and `pnpm typecheck`, runtime-import gate, agent-docs gate and diff whitespace check. Repository unit tasks 10/10 and typecheck tasks 11/11 passed, with unchanged workspace results served from configured Turbo cache. API unit results were 271 files/2601 passed/2 skipped and include the new suite. No database connection was needed for these tests. `pnpm install --frozen-lockfile` changed no tracked dependency/configuration files. Docs: not applicable, internal diagnostics only; no external dependency or service contract changed.

## Preserved criteria and next milestone

The original accepted/deduped owning facts, HTTP 16/12 scorecard, fixed-week immutable releases, cohort suppression, late-event behavior, current authority/audit, source rights and default-closed collection assertions remain unchanged. No policy bypass, fabricated acceptance, retry, expectation/timeout/budget adjustment, consent/TTL authority, collection activation or new erased-predecessor change was made.

Next milestone belongs to the parent: incorporate the checkpoint into the sole candidate and inspect the next normal hosted disposable DB/worker/HTTP acceptance run for the unchanged failing test and these warnings. A ledger deadline establishes which branch produced the receipt, not why the transaction was slow. A rejected phase/code narrows the next investigation. A green hosted run alone would not retroactively identify the previous failure's cause.

Runtime acceptance remains UNKNOWN. Independent review is pending. Automatic ownership remains partial/default-closed, Support/media reset blockers remain, and release readiness is not claimed. No Docker/local live services/e2e, CI poll/rerun/dispatch, Railway/staging/production operations, credential search, device/native verification, mobile build/signing or store operation was performed. Signed AAB and distinct staging-companion/joint testing remain pending under parent ownership.
