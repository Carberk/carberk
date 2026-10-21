# Diagnostic reinspection concurrency tests

Test-only slice for #914 under #897 / PR #904, 2026-10-21. Base `eb60330a91d19faf84ce91a5b05e6e815449bac2` (`agent/spec-897-campaign`). Reservation `agent/issue-914-reinspection-concurrency-tests-20261021` was pushed at that base before edits. It closes the concurrency gap listed in the [source slice](diagnostic-reinspection-source-slice-20261021.md#unresolved-and-remaining) for the already selected equal-VIN, same-Listing, same-public-commissioner path. No production, schema, contract, config or dependency file changed. D2 and D3 remain unsettled and are not exercised.

## Cases added to the HTTP/PostgreSQL/storage suite

Both cases go through real HTTP into the composed Nest/Prisma module. Each one releases public predecessor A on its own order, then arrives a separate later public visit B on the same Listing, commissioner and VIN. Assertions read persisted PostgreSQL rows. No repository is mocked, and the cases add no signal table, production hook, fixed delay, timeout change or gate change.

| Case | Contenders | Asserted outcome |
|---|---|---|
| `links one reinspection when identical requests contend for the same visit and predecessor` | Two identical `POST orders/:B/reinspections` from B's technician | Both 201 with equal bodies (`reinspection`, draft, B's observation, `successorOf: A`). Exactly one row has `predecessorId = A`. B holds exactly that report, and A's order holds only A. There is exactly one new audit, `REPORT_REINSPECTION_CREATED` on B. A's snapshot, hash, state, version, status, `finalizedAt` and PDF artifacts are unchanged. A later matching retry returns the same body, with the same row bytes and no audit. |
| `admits exactly one successor when a correction and a reinspection race for the same released predecessor` | `POST reports/:A/corrections` by A's `technician` racing `POST orders/:B/reinspections` by B's distinct `revisitTechnician` | Statuses are exactly `{201, 409}`; the test does not fix which one wins. The loser code is `DIAGNOSTIC_REINSPECTION_CONFLICT` if the correction wins, or `DIAGNOSTIC_CORRECTION_CONFLICT` if the reinspection wins. The winner's id, order, kind, observation, findings, template, author and reason are checked. Exactly one successor of A exists, and the loser's id has no row. Reports on A and B match the winner's order, and there is exactly one new audit, for the winner. A's released bytes and artifacts are unchanged. A winner retry is read-only, a loser retry keeps its 409 code, and the audit count is unchanged. |

A 500 or raw Prisma error fails the status oracle. An unexpected interleaving fails it too: two 201s, two 409s, or a second successor.

## Barrier

`contend` opens a test-owned transaction. It locks orders A and B with `FOR UPDATE`, sorted by id, then dispatches the requests. It releases the locks only when PostgreSQL shows every request waiting, either on the holder or behind another contender that is itself blocked by the holder. Waiters are counted outside the holder transaction, because `pg_stat_activity` is snapshotted per transaction. The wait has a bound of 500 queries and no fixed delay. Product locks then decide the order: identity row, Listing `FOR SHARE`, order A, then report A, for both `correct` and `reinspect`.

The identical pair shares one actor, so the second request queues on the first request's `users` row lock. That is the product's real serialization, and the barrier counts it as waiting. The race pair uses two currently assigned, center-qualified technicians with separate sessions, so both transactions block on the order rows at the same time.

## Small helper extensions (existing cases untouched)

- `people` gains `revisitTechnician`, with `diagnostics.technician` in `capability`. `beforeEach` therefore creates its user, session and staff grant. Center qualification is created only inside the race case's setup. No existing case reads this person.
- `arrive` gains an optional trailing `technician` parameter, defaulting to `"technician"`. It selects who is assigned to the order and who records its observation. Existing calls are unchanged.
- New local helpers: `contestedPredecessor`, `audits` and `contend`. The diff against base is additive, apart from those three one-line widenings and the observation actor variable.

## Verification (offline only)

| Command | Result |
|---|---|
| `pnpm --filter @auto-tm/contracts build`; `DATABASE_URL=<dummy, unused> pnpm --filter @auto-tm/db build` | client generated, no connection |
| `pnpm typecheck` (TS7), `./node_modules/.bin/tsc6 --noEmit -p tsconfig.json` (TS6) in `apps/api` | pass |
| `npx eslint --max-warnings 0 <spec>` (apps/api) | pass |
| `AUTO_TM_TEST_DATABASES=off npx vitest list <spec>` | both new cases collected, along with all existing cases |
| `pnpm check:agent-docs`; `git diff --check` | pass; clean |

**Runtime: UNKNOWN.** No PostgreSQL, MinIO, Docker, staging or CI run was used. Root's hosted `pnpm test:api` on the assembled candidate is the only runtime evidence. These cases were not written to fail. The source lock plan predicts green, but that is a prediction, not an execution.

## Limits of the proof

- The barrier proves only that both requests were inside open transactions, waiting on the same rows, at release time. It does not force a particular winner, so each run exercises one winning branch. Both branches have assertions, but neither one is guaranteed to run in a given run.
- The identical pair is serialized by the shared actor's identity lock before it reaches the order locks. This proves the retry path under real contention. It does not prove a simultaneous unique-index `P2002` mapping; the product's lock order makes that path unreachable here.
- The barrier assumes the per-worker Prisma pool can open at least four connections (holder, observer and two requests). If a request is starved of a connection, the barrier fails with an explicit message. That result is a test-environment limit, not a product verdict.
- Not covered: private lineages, D2 identity variants, D3 commissioner transfer, erasure and PDF rendering under contention.
