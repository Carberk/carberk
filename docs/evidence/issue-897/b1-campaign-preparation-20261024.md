# B1 campaign preparation checkpoint

Scoped implementation and executable-scenario authoring are complete for parent inspection. PostgreSQL behavior is UNEXECUTED. This is not complete kernel readiness, an independent review, permission to integrate callers, or a green release candidate. Automatic admission remains CLOSED and the original automatic HTTP201 remains required. Parent owns acceptance, integration, hosted proof and release.

## Ownership and base

Sole writer in `/Users/bagtyyar/.t3/worktrees/carberk/t3-3194556c`, new branch `agent/897-b1-campaign-preparation-20261024`. Initial clean HEAD was accepted `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408` on host scaffold `t3/3194556c`. That scaffold is preserved. The owned branch was created directly from held `38ec27961fc827491c0374c079bb7d613dfc6e2c`, tree `143b1fe73d21f78f51c930506403c266de545ea7`, retaining all `66aaa39c` prerequisites. Final SHA/tree are in `/tmp/897-b1-campaign-preparation-20261024-handoff.md` after commit.

Read the supplied authority/recovery artifacts, overriding architecture audit, parent inspection and read-only parent ledger. Verified contract SHA256 `c15455516d773fe55d5151035b4afceef9348099c60d51578826c38b5eac3725`.

No nested agents, additional worktrees, parent/historical checkout writes, PR creation or PR904 updates. Historical attempts and caps retain their dispositions. This is the specifically assigned dependent campaign-preparation checkpoint, not a renamed failed acceptance attempt or a cap reset. No focused SQL/hosted/parent acceptance failure was executed here.

## Substantive implementation

`20261024020000_campaign_preparation` is a forward migration with a byte-identical retained mirror. All 116 historical migration/mirror files at the held base remain byte-identical. The new SQL SHA256 is `cceb9c0d75c8d1f3a9302548d7791ac752635c3775e7b5ca3ec3c516b7db9429`. Current Prisma schema SHA256 is `6e059c956df99e8e7feeb8dca70b7a27051a8851fde8edf2c5296a5eb6e5819b`. The new profile inventory is additive; previous schema inventories/checksums remain unchanged. The older guard-repair schema test now explicitly tests its held snapshot, while the new test owns the current snapshot.

`withCampaignPreparation` is exported by the existing built DB package. It takes finite mutation intents, not namespace lists, table lock plans, hashes, actor emails or authorization declarations. SQL reads stored OLD rows and overlays proposed NEW fields, validates table/key/field shape, resolves actual attached campaign trackers, their stored roster/records/manifest, the existing per-family reference maps, deterministic root/center bindings and the v3 foreign-media reference fence. Deleted v3 ownership and upload-ledger directory references retain their existing fence. The resolver independently considers both OLD and NEW references and checks business tracking-function hashes. It never creates seller/OWNER grants or campaign-private admission.

The prelude uses only affected namespaces' actual existing tracked table sets, sorted, followed by their actual incoming FK relations, sorted, before the complete sorted single-bigint namespace set. It no longer locks every source-registry table merely because any campaign was found. Namespaces use the original `pg_advisory_xact_lock(hashtextextended(namespace,0))`; source ranks retain their physically disjoint two-int keys. A separate fresh READ COMMITTED scope query after waits refuses changed namespace/table scope without extending locks. Limits are 1000 finite intents, matching the existing source-scope bound, and 16 affected namespaces; larger commands refuse before source writes.

The v1 auth program's historical prelude uses declaration order, unlike the sorted v2/v3 business reset. To preserve the operational script and avoid introducing a table-order cycle, any preparation touching v1 uses `NOWAIT` for its sorted table/FK prelude. Contention refuses with `campaign_preparation_legacy_reset_busy` before namespace acquisition; there is no retry. V2/v3 wait normally in their existing sorted prelude. No operational script, reset timing, timeout, allowlist or hash was changed.

`campaign_preparations` is transient and unique per backend/full transaction ID. INSERT always executes real preparation and replaces supplied identity/scope fields; UPDATE and TRUNCATE refuse. Foreign deletion/finish refuses. A deferred constraint re-reads live state and rejects commit with an unfinished row. Successful finish deletes the payload; rollback also leaves none. The detector rejects preheld source, center/template, Session/TOTP, upload/video/service/collector, campaign metadata and incoming-FK relation locks, reserved source advisory namespaces, and actual campaign single-bigint keys. Unlocked reads remain permitted. This is a conservative detector, not transaction-history tracking.

Dormant final BEFORE ROW guards cover the finite 37 existing campaign-tracked tables. They acquire no locks. They refuse an affected namespace/table outside the prepared set before mutation and before AFTER trackers can acquire a missed namespace. Dormant TRUNCATE guards refuse journal bypass. Existing campaign AFTER functions are unchanged and retain their full candidate/hash/journal/deadline/lifecycle/allowed-row checks. Existing source guards separately retain their selective ownership-command requirements. Ordinary non-campaign scalar behavior remains ordinary.

The source receipt INSERT now enters the same preparation protocol before source rank/row locks, using its server-discovered graph plus proposed rows. It does not nest ordinary preparation or run a late fallback. Source completion still performs its existing effect checks, then an AFTER DELETE hook removes the associated campaign preparation. Ordinary excluded operations use their own entry and require no ownership receipt. Source readiness now requires campaign readiness and permits only the exact non-mutating campaign guard after its final source check; arbitrary later BEFORE mutators still refuse. No source or campaign guard was enabled by this migration.

## Criterion coverage and authored scenarios

All behavioral evidence below is authored real PostgreSQL SQL, not an executed PASS. `packages/db/tests/campaign-preparation.e2e.spec.ts` has 17 definitions expanding to 31 cases. It uses real Prisma transactions through the exported TypeScript APIs plus direct SQL attacks. No query interception, in-memory permission result, seeded ownership grant or synthetic consent substitutes for SQL behavior.

1. Ordinary scalar and Session-create versus source, both orderings: four cases. A test-only AFTER ROW barrier pauses ordinary writes after row/FK effects and before existing campaign tracking. `pg_blocking_pids` proves both the test gate and opposing namespace wait. Source-first holds the prepared namespace/source rows. Ordinary-first Session insertion deliberately causes the stale source graph to refuse after rediscovery; no retry is expected. Scalar/no-op source and other orderings complete serially.
2. Exact campaign prelude opposition: two cases execute the existing generated v3 table/FK/namespace prefix in both orderings. Only its explicitly setup-only measurement-table lock is removed to obtain the reset prefix. No reset/disposal body runs. One case separately proves fail-closed v1 declaration-order contention.
3. Complete deterministic namespace sets: reversed two-namespace inputs return the literal sorted namespace/table set and block on the same first namespace. OLD/NEW Session reference movement discovers both stored namespaces, then the unchanged campaign transfer rule refuses the move atomically. Supplying a Session NEW owner from an unprepared namespace refuses before insertion.
4. Ordinary exclusion and existing authority: v3 root settings and a sales invitation run with only campaign preparation; ordinary non-campaign User scalar writes run with neither receipt. A fence receipt cannot authorize protected User suspension. The actual diagnostic admission function rejects a missing Session. Unsupported root media upload still refuses through the existing campaign policy and leaves no upload.
5. Preheld/late entry: eleven parameterized managed-dependency relation cases plus campaign metadata, actual campaign bigint and reserved source two-int locks. No fallback preparation or earlier-class lock acquisition occurs in the guard.
6. Forgery/bypass/lifecycle: forged GUC and copied backend receipt, direct INSERT with forged identity/scope, forbidden UPDATE/TRUNCATE, missing preparation, nested source entry, wrong receipt finish, unfinished commit and explicit rollback. Rollback checks both User and campaign journal preservation; every case checks that no transient preparation rows remain.

`scripts/testing` SQL generation uses the existing `campaignMain` and `businessMain` setup, with the same reservation-derived UUID algorithm as the remote wrapper. Generation stops immediately when the setup SQL is captured. It never fabricates a readback or permission result. The suite later executes that setup's real embedded guards and hashes in its disposable database. No operational bootstrap/reset command is invoked. Existing kernel scenarios only receive the mechanical dormant-trigger activation update needed by the new preparation prerequisite; their assertions remain unchanged.

The implemented v3 foreign-media ledger/directory lookup has grammar/source inspection here. The new suite exercises unsupported media admission, not a complete successful admitted-business upload/foreign-ledger lifecycle journey. That broader media/caller/retention acceptance remains in the later dependency matrix. No PostgreSQL lock, hash, trigger order, planner, direct-role or rollback behavior is certified by static checks.

## Commands and results

PASS, offline only:

- `pnpm install --offline --frozen-lockfile --ignore-scripts`.
- Dummy-URL `pnpm --filter @auto-tm/db generate`, `pnpm --filter @auto-tm/contracts build`, and `pnpm --filter @auto-tm/db build`. These are permitted DB/contracts JavaScript/codegen outputs, not Android/native/signing artifacts.
- `pnpm --filter @auto-tm/db typecheck`, `pnpm --filter @auto-tm/db exec tsc6 --noEmit`, `pnpm --filter @auto-tm/db lint` including the new SQL suite.
- `pnpm --filter @auto-tm/db test:offline`: 5 existing offline lifetime tests.
- `node --test` for campaign-preparation, diagnostic-source-guard-repair, diagnostic-source-kernel, diagnostic-ownership-grants and diagnostic-ownership-disposal schema scripts: 7 metadata/profile tests. These establish inventory consistency, not SQL behavior.
- Dummy-URL `pnpm --filter @auto-tm/db exec prisma validate`.
- `pnpm check:runtime-imports` and a Node check that the compiled DB package exports `withCampaignPreparation`. Contracts JavaScript now exists; the prior unbuilt-contracts lint/runtime setup gap is resolved here.
- Offline pglast grammar: 25 migration statements, 19 PL/pgSQL functions/blocks, all SQL-language bodies, 74 rendered guard trigger definitions. Existing generated v1 setup: 35 statements/5 PL/pgSQL bodies; v3: 84/9.
- Node syntax checks, `git diff --check`, 116 historical SQL byte comparisons, and unchanged app/CI/config/lockfile/operational-script boundary checks.

Setup corrections before final checks: initial Prisma generation lacked the required dummy DATABASE_URL; initial new suite typing/non-null assertions were corrected; the first fixture generator let the original program print its diagnostic receipt or reach a readback. The final generator captures setup immediately and emits SQL only. `python` was unavailable, so offline helper scripts use `python3`. These were setup/authoring corrections, not SQL or parent acceptance outcomes.

NO SQL was executed, including no red/green behavioral run. The explicit local-SQL prohibition supersedes the repository test-first execution/push sequence for these SQL-only criteria; no behavioral PASS or test-first completion is claimed. Hosted disposable execution remains parent-owned. Docs: not applicable, internal-only protocol change using existing dependencies and pinned versions.

## Preserved boundaries and next dependencies

No app/API/worker/mobile runtime, B2-B4 coverage, B5 observer, timeout/assertion, dependency version, CI configuration, operational tooling or pinned runtime module changed. B5 held `35109636` remains unchanged and its one measurement unused; no hashes were repinned. The DB export/profile changes are disclosed for parent inspection before any later pinned-candidate assembly.

No Docker, local live SQL, DB/service creation, HTTP environment, full/standalone CI, deployment, reset/reseed, Railway retry/bypass, native/device/emulator/screenshot/check, signing, store, merge or operational bootstrap execution. The tests describe a future hosted disposable service; they were not run here.

Next finite dependencies remain the server-derived purge/effect union and its bootstrap/audit/request/proof/FK closure; remaining complete-kernel graph/effect/retention/race proof; parent complete-kernel acceptance; all six production caller/fixture/bootstrap groups; matched application/domain/SQL admission and the unchanged ordinary automatic HTTP201; hosted SQL/HTTP execution and independent exact-candidate review. Actual authenticated seller/current-business OWNER grants remain mandatory. Their absence is not replaced by founder consent. This checkpoint neither implements those dependencies nor counts their intentional absence as failure of campaign preparation.
