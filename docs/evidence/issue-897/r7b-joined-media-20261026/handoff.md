# R7b joined media and registration correction

The original26 caller suite now passes26/26 and the unchanged preparation suite passes9/9 on disposable PG17.11 with restricted nonowner callers, matched guards and native options. Parent decides source acceptance and B1/G1 or combined acceptance. Earlier25/25 publication evidence and all R7c failures remain history, not reset counters.

## Separate source and fixture pins

Supplied production base is `bff24377cb03819336abb0f9205e2b51a0a04673`, tree `2feb3fc08a512e876bb360afd1831296ce385f91`.

1. Media source and own direct tests: `80f606d6e9611143f3dd59016ec575a4265e898c`, tree `2d928a83bfd1deff518bbe0bbe12ab3b00f3a3eb`. Only `PrismaListingMediaRepository.ts` and its preparation spec change.
2. Registration transport alone: `b3cbf438cb702b0c29bd90ce554f7a60d656656b`, tree `816fc7a233a325780072a1a268be73f501edca00`, parent80f606d6. Only the existing `PrismaMediaUploadRepository.ts:57` advisory result gains `::text`.
3. Read-only fixture consumption: `6f33578598a28d0168e3aea6893f744225d0b22e`, tree `c85fc56c46ef9c5216fe1b793b07a3f920813f8d`. Its five paths are byte-exact to parent-inspected `8f4366a07e3304a37282ec929f3d8c5215a1148a`, with acceptance receipt SHA256 `26f4604e9b3db8315e4632a721612adf02ef982701abb01acde0f75a89c33f31`. This is separate from both production fixes; no fixture assertion was edited here.

All pins are pushed on `agent/issue-897-r7b-media-retry-20261026`. Earlier34ede and c33e refs remain unchanged. No unstable publication ancestry was imported. No claims, common fake, avatar, R8, kernel, schema/profile, worker/video or historical SQL source changed.

## Exact joined retry

`save` now supplies a finite changed-graph callback to its existing preparation. It requires the initial upload to be PREPARING under the supplied token and exact listing target. Fresh rediscovery must show exactly the same upload except ADOPTED with token/deadline cleared, plus exactly one committed media association whose fields match this save. The winner's generated ID and persisted creation instant are returned; callers legitimately supply different IDs/instants for the same joined reservation.

The callback removes only that new association from its comparison and reverses only those three adoption fields. Every remaining slot and mutation must match the initial complete graph. Changed owner, business, authority/PII, source manifest, poster, target, final state, extra adopter or media fields still refuses `media_caller_scope_changed`. Existing initial media or avatar adoption cannot qualify. Business ownership and editable-stock checks remain required against the unchanged prepared authority graph.

The return is read-only. It does not run supplied finalize or a second media insert, allocate another receipt, replay/retry a transaction, extend the graph, or acquire the newly observed media PK. The initial upload unique/adopter key protects the association, and all original locks remain held through campaign finish. The ordinary unchanged-graph path and strict refusal for other callers remain unchanged.

Own direct tests cover one exact committed retry and ten unrelated changes: token, owner, business, PII, poster, source manifest, final state, target, media bytes and extra adopter. They use the accepted shared SQL-boundary fake unchanged. The direct positive failed before source correction; all ten negative controls passed. Full media preparation now passes31/31. No duplicate fake was created.

## Red, green and native verification

[Manifest](manifest.json) contains every source hash, artifact hash, source/fixture pin, run count, historical record and cleanup result. Source SHA256 values are:

- Media repository `a139427db1544da5ebc00bf1ec90dbc81a3fb321da92ff5c5e691940b036bf61`.
- Own media tests `520fdd85dc1b005ea36a94a97ad74219a5601d66095813ec7ebc59aee47c5ebf`.
- Registration repository `f2417e1e69e59846ad2bff18a943745916263e47403a0bfacf1bb558ac317dfa`.

The actual unchanged joined-token case first failed `media_caller_scope_changed` at source302, one selected failure and25 deselected. After rebuilding, the same case passed with original assertions: both calls return the same committed media ID, persisted count1, and reserve retry equals `{alreadyAdopted:true}`. See [SQL red](sql-red.txt) and [SQL green](sql-green.txt).

Final [original26](full26.txt) passes26/26, zero failed/deselected; [preparation9](preparation9.txt) passes9/9, zero failed/deselected. Both suites ran sequentially through the exact8f fixture with the original `apps/api/vitest.config.mts`, no alias/config or timeout changes. The fixture asserts each caller transaction's actual role is nonsuperuser and not table owner and restores the complete sorted trigger snapshot. No handwritten opposing source command was introduced.

Native runtime commands used the task-owned `r7c_r7b_joined` database, `AUTO_TM_TEST_DATABASES=off`, and:

```sh
pnpm --filter @auto-tm/api exec vitest run src/modules/listings/infrastructure/PrismaUploadClaims.e2e.spec.ts -t 'joins the in-flight reservation' --reporter=verbose
pnpm --filter @auto-tm/api exec vitest run src/modules/listings/infrastructure/PrismaUploadClaims.e2e.spec.ts --reporter=verbose --reporter=json --outputFile=/tmp/897-r7b-joined-media-20261026/full26.json
pnpm --filter @auto-tm/api exec vitest run src/modules/listings/infrastructure/PrismaUploadClaims.preparation.e2e.spec.ts --reporter=verbose --reporter=json --outputFile=/tmp/897-r7b-joined-media-20261026/preparation9.json
```

Registration's original five tests first all failed `unsupported_void_result` at its existing advisory SELECT. After the sole cast all5 pass, with the common guard and original tests unchanged. [Registration red](registration-red.txt) and [green](registration-green.txt) are retained. No lock arguments, order, receipt, native bounds or public error changes accompany that cast.

The final [affected offline run](offline-combined60.txt) passes60/60 in five files, with explicit E2E exclusion and databases off: media preparation31, registration5, and AttachMedia/RemoveMedia/ReorderMedia24. Separate TS7/TS6 typechecks, source lint, DB build, API builds and diff checks pass. The earlier own direct red had1fail10pass/20deselected; first media-only green31/31 and affected55/55 also remain recorded. Registration red5fail is a separate cause and count.

`pnpm --filter @auto-tm/db build` rebuilt configured DB output before the red runtime, and API build ran before red, focused green and final full runs. [Loaded provenance](loaded-provenance.json) records resolved DB/contracts exports, loaded package modules, native TypeScript caller source and emitted API JavaScript hashes. Node successfully loaded configured packages and emitted callers. The original SQL failure stack confirms the native test imported the actual repository source. Final sources were unchanged during full26/preparation execution.

## Cleanup and remaining boundaries

[Database receipt](post-database.json) records PG17.11, UTC and91 exact applied migration checksums. After both suites, seeded users/uploads/listings, cleanup rows, transient roles, campaign preparations and source commands are all0. All284 guard modes are D. The task-owned `carberk897-r7b-joined-8c41` container was removed after the receipt, and the remaining-container check is empty. No shared service, staging, HTTP, CI, diagnostic run or B5 resource was touched.

The previously recorded R7c7pass19fail and8f25pass1fail logs remain unchanged. This follow-up adds evidence-supported corrections and green affected runs. It does not rerun or repair the21 avatar fake failures assigned to R7d, import R8f981 source, or claim parent acceptance. Exact original logs, scripts and JSON reports remain under `/tmp/897-r7b-joined-media-20261026`, hashed in the manifest. No owned source dependency remains for these two corrections. Slot released after the clean evidence checkpoint.
