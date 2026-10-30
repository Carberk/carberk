# R7b real caller matrix continuation

The full production-caller fixture passes 25/25 on source `e0d56a491e6e54121bc491508ae674676fc947c5`, tree `8abe3e03b2503264edbfe65d678cb98b4b723a80`. This continues `12ab1c0249bdbbb497bf7a364e79ca67d0f40460` and preserves publication `daac99234eeb781433e02ce417be45a6f874c9eb`, core30f, effects175/018 and claims5b history. Parent decides acceptance. This is scoped PostgreSQL superuser evidence, with no B1 or combined candidate verdict.

The [manifest](r7b-runtime-matrix-20261025/manifest.json) records the exact command, source/tree, every changed path and SHA256, offline checks, historical run counts, log hashes and remaining limits. The [full log](r7b-runtime-matrix-20261025/full25.txt), [database receipt](r7b-runtime-matrix-20261025/post-database.json) and [dependency hashes](r7b-runtime-matrix-20261025/pinned-source-hashes.json) are retained here. Earlier logs remain under `/tmp/897-r7b-round1-evidence`; earlier evidence files are unchanged.

## Ownership and dependency consumption

Only the publication fixture was authored in this continuation. Eight dependency paths were copied byte-exact from inspected source pins, without importing their branch ancestry:

- R7a repository and preparation spec from `466297461712a4f3759d1cf2699590fd933fa9a9`.
- API video ledger from accepted `994e2cb59115349a3f6c186269f5e00fc693d467` and its API preparation helper from inspected `b7ac70a2caca6bee462cb2da3facc8e4236191d9`.
- Worker purge and its three erasure helpers from `0aa1a18de7010039baf3f8b78a5abf500a6a2a62`, preserving accepted5737 production bytes. The fixture loads the actual CommonJS worker build through Node's module loader. It does not execute worker source through Node.

`PrismaMeasurementStore.ts` and `measurement-capture.ts` remain byte-exact to daac. No kernel, migration, retained mirror, profile, schema snapshot or measurement implementation changed. No identity correction or diagnostic rerun was made. Parent owns the separate identity40001 disposition.

## Reachability and assertions

All 25 tests were selected, passed, and reached their assertions; zero were deselected. Counts below are disjoint. Every race observes a real `pg_blocking_pids` holder/waiter edge. Promise rejection is observed outside the production transaction, and all started callers drain in `finally` after barriers release.

| Group | Count | Real callers and observed outcomes |
| --- | ---: | --- |
| Draft | 2 | `PrismaListingDraftRepository.update` versus `PublishListing.execute`, both orders. Publication-first commits, draft refuses `draft_dependencies_changed`; draft-first commits edit, stale publication refuses `diagnostic_source_graph_changed`. Exact draft/media/audit/outbox/upload states and foreign graph are asserted. |
| Video | 2 | `PrismaOwnedVideoSessionLedger.change(...,"cancel")` versus publication, both orders. Publication-first commits pending binding and revision1, cancellation refuses `VIDEO_SESSION_UNAVAILABLE`. Cancellation-first commits retirement, processing cancellation and exact cleanup; stale publication refuses PostgreSQL P0001 `listing_publication_video_binding`. No Listing/media/audit/outbox from the refused publication survives. |
| Collector | 4 | Actual `PrismaMeasurementStore.bootstrap` in both orders proves mandatory publication with optional0 or exact2 outbox rows. Identity/generation/epoch come from persisted principals created by bootstrap. Actual `rotateRestoreEpoch` in both orders proves publication-first exact2 before rotation erases them, or rotation-first exact P0001 `listing_publication_measurement_identity` with publication rollback. Operator epochs use fresh `randomUUID()` through the production rotation API. |
| Deletion | 4 | Actual configured account scheduling unit of work and actual `PurgeExpiredAccounts.execute`, each in both orders. Stale scheduling/purge refuses exact PostgreSQL P0001 `diagnostic_source_graph_changed`; stale publication refuses `upload_claim_scope_changed`. A new explicit source attempt after the refusal rediscovers and completes deletion. Scheduling archives the committed listing and erases measurement. Due purge is isolated to one target and must return `purgedCount:1`, erase PII/session/principal/draft, preserve media without orphaning it, and preserve foreign rows. |
| Original controls | 13 | Five absent/READY/pending/expired/cancelled video publication controls; disabled purpose; activation disabled after receipt; actual capture savepoint rollback; ordinary create/change; audit/media completion attacks; both-order competing real publication adopters. |

The cancellation-first fixture first reserves photos through the real publication caller, then holds external variant generation. The real video writer can win before the outer publication receipt. Releasing generation makes the outer publication discover the still-uncommitted OLD video and wait, so the test proves fresh post-wait refusal. Blocking the earlier reservation transaction instead would lawfully discover fresh committed cancellation later; that earlier observation is retained as fifteenth history, not mislabeled as stale-graph proof. The selected video writer is cancellation. Separate completion/revision writer permutations are not claimed.

New matrix principals are issued by actual bootstrap before guard activation. No test supplies an opposing source command, fabricated principal/generation, source receipt, or optional outbox write. The existing generator and object-inspection boundaries remain local fakes; they do not replace database callers. Optional row absence is asserted as zero rows, never described as a source write.

## Effect and assertion inventory

The complete production inventory and nine finding dispositions remain in [the prior handoff](r7b-round1-fix-handoff-20261025.md). This continuation adds runtime proof without changing that closed source union.

| Effect/dependency | Proof in this fixture |
| --- | --- |
| Actor/User, supplied Session, Business/member authority | Production source preparation and actual configured Identity providers remain active. Video uses persisted User/Session and real authority. Scheduling and purge mutate their declared User only. No business race coverage is newly claimed. |
| Exact OLD draft and owned payload | Draft-first preserves the committed edit; publication-first deletes the draft; stale source refusal rolls back publication. Video-first and purge-first target changes cannot extend the prepared source graph. |
| Listing, three photos and media-floor behavior | Successful source creates one Listing, three media rows, one audit; refused source creates none. Original photo-floor, invalid payload and generator behavior are unchanged. |
| Upload adoption and reverse-adopter keys | Successful image claims are ADOPTED with cleared token/deadline. Failed source releases reservations to AVAILABLE. Original two-publisher races still permit only one adopter. Registry-derived unique/adopter guards remain active. |
| Video OLD/NEW pointers and revision | Publication-first pending generation/session rebinds to the new Listing with revision1, preserving PROCESSING work and PREPARING video claim. Cancellation-first retains draft target/revision, retires generation/upload, cancels work and records exact video/media cleanup provenance. Foreign graph stays unchanged. |
| Cleanup, poster/provenance, release/settle | Original guarded graph and helpers are unchanged. Cancellation asserts exact cleanup upload/session/generation/protocol/object list and LEGACY_PENDING media cleanup. All source-failure callers settle before test completion; final image claim count is zero. No storage deletion is simulated as database proof. |
| Audit and optional measurement | Mandatory audit completion controls remain. Bootstrap proof checks the two literal event names, persisted principal/generation/epoch, environment and exact expiry. Disabled/fault controls assert zero outbox. Rotation proves exact2 at the commit boundary before policy erasure. |
| Campaign, FK/unique effects and finish | All90 exact migrations and both matched guard families are active during tests. Source/campaign finish must complete before each production caller resolves. Omitted-audit/corrupt-photo attacks roll back. No nested receipt or test-authored command is introduced. |
| Fresh graph after waits | Draft, cancellation, epoch, schedule and purge races assert the specific existing refusal, core rollback and foreign preservation. New source attempts after refusal allocate fresh preparation; no late extension or aborted transaction reuse occurs. |

## Verification and retained failures

The final full run uses PG17.11 on task-owned loopback50486, UTC, database `r7b_seventeenth`, role `postgres`. Ninety migration names/checksums match repository bytes. After teardown, all284 matched guards are D, the capture fault trigger is absent, outstanding image claims and orphan media are zero, and no other client backend remains. The task-owned container was stopped after the receipt, retaining all disposable databases for inspection. Services belonging to retention, retired uploads, parent diagnostics and staging were untouched.

The transaction instrument now forwards each caller's original timeout/maxWait/isolation options. Earlier instrumentation omitted explicit options; ninth through twelfth remain history and are superseded for native-bound proof. The 3-second barrier and wait limits are unchanged. The thirteenth draft barrier timeout amid concurrent compilers is retained. Final runtime ran without overlapping local compilers. No timeout padding or assertion relaxation was used.

Focused R7a preparation tests pass22/22 with explicit E2E exclusion. API TS7/TS6 and fixture lint pass; the actual worker build passes. Earlier typecheck mistakes were fixture issues: a missing local foreign snapshot variable and importing worker source across API rootDir. The variable was declared and the worker import replaced by its built CommonJS entry. These were not production corrections. Final verification logs and hashes are in the manifest.

Historical runtime counts remain explicit in the manifest: eighth2fail/13deselected; ninth2pass/13deselected; tenth1pass5fail/15deselected; eleventh4pass/17deselected; twelfth8pass/15deselected; thirteenth7pass3fail/15deselected; fourteenth10pass/15deselected; fifteenth and sixteenth each1pass1fail/23deselected; final25pass/0deselected. The reused seventh database setup failure reached no actual test behavior. No failure counter or history was reset.

There is no remaining source-pin dependency for these selected rows. Parent inspection, restricted-role verification and combined B1-B5/G0-G4 integration remain outside this scoped owner evidence. Guards and public admission remain closed outside the disposable test transaction environment.
