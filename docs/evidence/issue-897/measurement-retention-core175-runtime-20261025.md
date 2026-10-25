# Retention and purge affected runtime checkpoint, 2026-10-25

All 34 authored retention/purge PostgreSQL cases pass at source `ba1e48e2958c541fa4e44f079c93098113b267a7`, tree `72b27f010f54a9d304e605d462e4d25e2a467149`, under the original `TZ=America/New_York`. No production source changed after parent-inspected `5737f27eedcecd5eeb7d8e96396cfb1f005c6b71`. Two fixture paths changed after observed lock assertions failed. Parent inspection of those changes and combined integration acceptance remain pending. This checkpoint claims no source, runtime or G1 acceptance.

The [supplemental JSON receipt](measurement-retention-core175-runtime-20261025.json) pins source, dependency bytes, commands and log hashes, all 34 executed test names, specific outcomes, cumulative counts and cleanup. The [previous receipt](measurement-retention-ordering-20261025.json), [complete source/effects trace](measurement-retention-ordering-20261025.md), and [direct/trigger/FK inventory](measurement-retention-effects-20261025.json) remain unchanged historical evidence, including the nine earlier purge failures before completed preparation.

| Input | Exact identity |
| --- | --- |
| Original base | `de80c7b572a8e2b5df832774bef751a6e299fc4f`, tree `8190e99411eadb4904c9187b2fc31555f4cdc9e5` |
| Parent-inspected owned checkpoint | `5737f27eedcecd5eeb7d8e96396cfb1f005c6b71`, tree `c2f8115be7b0e366e635f3701a88803bd5614806` |
| Exact consumed standalone dependency | `0184929480c8b63a218480a88a0ae7730a881a52`, tree `7cccc15b8848344996392881ed55ee5b7e5ced40`, parent `30f93f05ebc672a99038d70cf2b2955613262667` |
| Dependency merge | `17778f740e3e62134020060cabd2b11645ad2d54`, tree `e9493bc3a1054478749719e9fad8c167066ffd3b` |
| Executed fixture checkpoint | `ba1e48e2958c541fa4e44f079c93098113b267a7`, tree `72b27f010f54a9d304e605d462e4d25e2a467149` |

The additive175 migration and retained mirror both hash to `1fd74d6824c2e7ba47cf311d455c38ce51cbab074a7b16c53cc5b4fb3fbf328f`. Core150 remains `520c94deedd51c039f82b396b6bf08acd551838bc37698ca0a345aa92a165424`. All 14 accepted dependency paths match exact018 bytes. No publication ancestry, claims transport or uncommitted SQL fragment was consumed. The original purge dependency `311637ca601780fdcffb74def6e88ce473aba339`, tree `322437213c9e3db5fe379d04ff65994d2e291f39`, and all earlier refs remain in history.

The initial unchanged full34 run on exact018 produced 32 passes and two fixture observation failures. A focused diagnostic preserved the failures and recorded `pg_stat_activity`: purge was actively computing `diagnostic_prepare_source`, with no lock wait yet, when the fixture's assumed 300 ms preparation window ended. The held retention/collector transactions had their intended actual locks. No new kernel defect was demonstrated.

The observer now waits for the actual caller to block or settle under its existing Prisma transaction bound. Settling without the expected lock fails with the actual outcome and database activity. Other short observations retain their 300 ms bound. Production statement, transaction, lock and test timeouts are unchanged. This correction exposed a second fixture error: in the three-way race PostgreSQL queues retention's tuple lock behind purge, while purge waits on collector. The test now asserts both actual edges, retention → purge and purge → collector, before releasing collector. It keeps every specific completion and stored-data assertion.

Only these additional owned paths changed:

- `apps/worker/src/jobs/MeasurementRetentionOrdering.e2e.spec.ts`
- `apps/worker/src/jobs/application/testing/MeasurementRetentionPostgresFixture.ts`
- This supplemental evidence pair.

The accepted seven-line retention prefix, SQL UTC rediscovery/projection, consumed command shape, measurement erasure and cast-only helpers remain byte-identical to5737. ExpireMeasurement, ListingView expiry, API measurement/store/capture and shared DB contracts remain unchanged. The complete inventory still contains 45 physical FK entries and 300 trigger definitions. Additive175 replaces functions without adding tables, FKs or triggers. The fresh source audit verifies those invariants and exact dependency inheritance.

| Actual scenario group | Cases | Final observed outcome |
| --- | ---: | --- |
| Existing exact raw/outbox boundary | 1 | Pass |
| Independent limits/counts/cascades/backlog | 1 | Pass, six direct deletions at limit1 |
| Absent/current/older epoch, locked due row, busy collector | 4 | Pass, refusal/preservation/lag/drain |
| Rollback after each real retention DELETE | 6 | Pass, whole sweep restored |
| Collector, guest erasure, restore, bootstrap versus retention, both orders | 8 | Pass, exact results and foreign protection |
| Overlapping real retention sweeps | 1 | Pass, 1+1 without double counting |
| Four stale scheduler snapshots | 4 | Pass, purge0 before preparation and facts preserved |
| Real purge/retention, both orders, and three-way overlap | 3 | Pass, actual blocker edges and exact results |
| Already-erased account and exact-boundary linked guest/global exports | 2 | Pass, prepared completion and foreign protection |
| Rollback after actual purge export/principal/User/finish | 4 | Pass, exact injected errors and complete checked restoration |

Purge-first commits `{purgedCount:1}`, then retention returns0. Retention-first returns3; actual purge refuses `diagnostic_source_graph_changed`, preserving the account principal while the due raw/outbox/visit are gone. The three-way race commits collector `accepted`, purge1 and retention0, preserves the foreign collector event, and leaves no expired backlog. Every started race task has rejection handling, every gate releases in `finally`, and all tasks drain unconditionally.

The exact-boundary positive uses actual store bootstrap and authenticated guest linking. It deletes the account principal, own raw/outbox and linked current guest visit/facts. It preserves independent guest and foreign principals/visits/records/outboxes, foreign session, rollup and current epoch. Both own and foreign restricted exports are deleted under the existing global invalidation policy. User PII/due cutoff clear and the prepared receipt finishes. The formerly static, masked missing-erasure counterexample now has actual execution evidence for these assertions.

All four rollback injections run after the actual operation named by the case, including successful `diagnostic_finish_source`. The exact injected error reaches the caller. The transaction restores the own principal, visit, raw, outbox, export, User display name and exact due cutoff, preserves the foreign fact and leaves no receipt. These checks do not assert execution of every populated diagnostic/service/video branch.

The original offline RED/GREEN and all earlier runtime logs remain. This continuation adds four suite invocations: 32/2, 0/2, 1/1, then 34/0 passes/failures. Cumulative history is 13 runtime invocations, 193 case attempts, 143 passes and 50 failures. The 189 unselected cases across focused diagnostic runs are separate from executed attempts. The final full matrix has 34 executed, 34 passed, zero failed and zero skipped. No counter or repair history was reset.

Offline worker verification passes 311 tests across43 files. Both TypeScript compilers, full lint and build pass; the final two fixture files also pass focused lint. The dependency's affected static test passes. Unit/types/full lint ran before the final queue comment and string correction; final34 runtime, build, focused lint and source audit used exactba1 source. Command/log hashes and that distinction are recorded in the receipt.

Verification used only the exclusive container `carberk897-retention-core175-t3433c86f9`, ID `7f7c4d40dcb439e927fd0b42648495c61854de145126ca918a52fb39a52ece83`, on `127.0.0.1:53830`, PostgreSQL17.11. The process timezone was America/New_York; PostgreSQL remained UTC. Repository global setup applied real migrations and cloned four worker databases. The role was disposable PostgreSQL superuser, so this does not establish app-role, HTTP, hosted or operational admission behavior. Before cleanup there were zero worker databases and only the ordinary `postgres` non-template database. Docker stop succeeded and `--rm` removed the container. No shared resource, parent diagnostic or parent checkout was touched.

No reached production defect remains in this affected34-case matrix. Parent source inspection of the fixture correction, assembled independent review, role/HTTP/hosted verification and combined B1–B5/G0–G4 gates remain with the parent. Final pushed checkpoint identity is pinned in `/tmp/897-retention-core175-handoff-20261025.md` and its final receipt.
