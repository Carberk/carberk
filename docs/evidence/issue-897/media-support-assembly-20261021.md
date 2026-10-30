# Media race tests and Support source assembly, 2026-10-21

This batch follows the exact `bd7b74a35605cfa823caa45f6ce26ed1250a0b52` hosted failures recorded in [the checkpoint receipt](checkpoint-bd7b74a3-20261021.md). Root inspected the checkpoint diffs and evidence, then assembled serially with `cherry-pick -x`. Implementers stopped at handoff; no reviewer or duplicate writer was dispatched.

| Writer checkpoint | Assembled commit | Scope |
| --- | --- | --- |
| `24709a53ea7134beb54fcb94f0280c0613dbf1a7` | `3a48902d` | Two prepared publish/attach generator/reset race cases. |
| `fa5c2167b67176151cf35170bfa370714fbcdedd` | `d45a4b70` | Older coordinator cleaning fixture: prove no protected objects or journaled media, then supply the literal empty-object intent hash. |
| `46522c4e4c57e92eb767d9fe3b34137778ed871a` | `c89d372d` | Exact pending owned Listing INSERT at the bound business phone; subsequent inventory requires a live journal key and matching row hash. |
| `306de760bb39c9ab37c90c8ca146dc1bc3fb4bf2` | `da510720` | Reservation-aware resolved closure/reopen and ordinary early-awaiting validation, with bounded closed-state and audit journaling. |

Root's earlier `08688f17` preserves the hosted failure receipt. The final evidence commit identifies the assembled candidate; GitHub execution records identify its published SHA after the single batch push. The assembly had no conflicts. The complete e2e file remains byte-identical to the inspected `fa5c2167` checkpoint after both source picks. No existing acceptance assertion was weakened.

## Verification

Combined checks run on the assembled source/test tree, without local services:

- Support boundary/domain tests: 7 files, 39 tests passed with `AUTO_TM_TEST_DATABASES=off`.
- API TypeScript 7 and TypeScript 6 both passed.
- Focused ESLint for the full-v3 e2e file and Service Messaging passed.
- Agent documentation, JavaScript syntax and diff checks passed.
- Fresh fixture, fixture retry and reset SQL/receipts for identities-v1 and business-v2 are byte-identical to the published base in all six captures. V3 reset receipts remain identical. Generated fixture/reset SQL has balanced parentheses with SQL strings, identifiers and comments excluded; this is not PostgreSQL compilation or runtime proof.
- Combined staging/controller/ledger/Railway/campaign boundary suite passed 166/166, with no cancellations or skips (262.6 seconds). This is the five-file offline suite, including the 11 campaign tests; it did not contact Railway or run services.

Logs and generated SQL are under `/tmp/carberk-next-release-20261021/combined-*` and `assembled-*`. The source writers' [media receipt](../issue-901/full-v3-media-phone-source-20261021.md), [Support receipt](../issue-901/full-v3-support-command-source-20261021.md) and [race test handoff](../issue-901/full-v3-media-runtime-races-test-20261021.md) retain their isolated verification and limits. No CI rerun or docs-only push is requested.

Fresh GitHub ref reads before publication still identify main as `9fde309c3da17f2661fe9c266504e6e56a1b97c9` and the integration branch as the published bd7 base. The first integration-ref read failed; the same read succeeded on one bounded retry. No new external PR comment changed the governing instructions. The writer's earlier quote-only parenthesis heuristic failed; root's string/identifier/comment-aware capture scan passed. Neither heuristic compiles or executes SQL. Hosted PostgreSQL remains the required syntax and behavior gate.

## Unproved behavior and release gates

The existing hosted media and Support tests are unchanged behavioral gates for these source changes. Publication/attachment/removal, exact journals, rollback, foreign preservation, retained audit reset and lost-response retry remain UNKNOWN on the resulting candidate until hosted execution. The Support primary `110/148` to `110/258` and foreign `25/27` to `25/52` counts remain literal assertions, not observed receipts.

The two new race cases are prepared tests, not race GREEN. Their body-stream barrier proves SDK consumption, not provider-side If-Match evaluation before reset. Full admitted-write ordering remains UNKNOWN. Production AVAILABLE/RETIRED recovery, exact disposal, late-write refusal, cleanup retry, terminal digest/object-ledger stability and foreign graph/bytes must each execute. No protocol/schema/ADR change, expiry shortcut or orphan sweeping is approved.

Successful 14-day awaiting closure, investigation/category commands, staffed clock, 90-day retention/purge/reopen, account deletion/restoration and worker/outbox fencing remain unfinished. History capacity/provider partitioning and diagnostics bootstrap/reinspection policy decisions remain unresolved; complete graph/roster/capacity and personal/video coverage are required. Existing caps, authority, hashes, collision guards, timeouts and concurrency remain intact. Operational v3 entry points remain closed.

Exact-SHA hosted CI, fresh independent Standards/Spec review and fixes, native/browser/deployed/ops acceptance and latest-main restoration, signed Android artifact and matching disclosures remain release requirements. Scoped Railway authority was previously refused and was not retried or bypassed. No staging, provider, production, store, signing or spending action occurred. The PR remains draft with auto-merge off; protected merge and other founder-controlled actions still require explicit approval.
