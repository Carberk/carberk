# Public automatic acceptance assembly and erasure frontier

Root assembled the completed Codex test slice into PR #904 on 2026-10-22. The release goal remains active and incomplete.

## Provenance and scope

The writer reserved `agent/issue-914-public-auto-red-20261022-181545` from `fea9350155c20533a15dbcd2d4c9ac331b23d619`, and handed back `2dfa149f8a4ce7b04d6a466b86f42d0191d78656`. Root applied the test checkpoints in order:

| Writer checkpoint | Root assembly |
| --- | --- |
| `729454f3` | `49c91ccc` |
| `9274088d` | `b986d5e5` |
| `8729f71c` | `0b957ebf` |
| `e4e03f05` | `008cacf1` |
| `2dfa149f` final receipt | `6ffc3262` |

These cherry-picks did not include `-x`; this table records provenance explicitly. The final receipt had a mechanical conflict because Root omitted intermediate receipt-only checkpoint `57cc4c45`. Root restored the writer's exact final receipt bytes. The assembled test source and receipt match the writer's final SHA256 values, respectively `fe8b5aeeddd1f857f4d935dbca26632dcd760bccec93214d1a24d46f81ab6d43` and `736f409ce12d93b14578e7c40e377aed25b801bdd2ed6d475a87b24c766be095`.

At source checkpoint `6ffc3262fb77ce76a23852c0529fc874297b985d`, tree `fdd320a67eb2b8a565479a469949a20951807050`, the two added cases cover unchanged-owner public automatic continuity and seller mutation/restoration followed by reobservation. All 16 existing public declarations and their bodies/assertions remain byte-identical. The imported public count is 20, with 135 total continuity cases. Import collection used `--staticParse=false` with no global setup, setup files, hooks or bodies. Collection does not establish behavior.

Production, schema, reset, CI and policy remain unchanged by this slice. Current public domain and SQL admission still refuse automatic comparison; the new positive journey requires hosted execution to establish its actual frontier. The negative's present blanket refusal cannot prove a future historical-ownership discriminator. Missing at-visit ownership facts must not be fabricated or backfilled. See the [writer handoff](../issue-914/public-automatic-red-20261022-181545.md).

## Exact previous hosted result

PR Checks run `39863960597` on `64f96fdcdc90a86402c6a31e1cb34b4e75717e55` is terminal failure. Lane, static, frontend and DB passed; docs skipped. The separate runtime run `39863960635` passed. DB passed 392 tests in 41 files. Worker passed 373 tests in 57 files. API passed 3349 tests and failed seven in two files.

| API failure | Reached evidence and disposition |
| --- | --- |
| B Listing identity/seller/status restoration | Replacement proof issuance returns `DIAGNOSTIC_STALE_VERSION`; later replacement consumption is unreached. Investigate fixture version/association refresh without weakening invalidation. |
| Missing public proof | HTTP 403, while the test expects 400. Refusal occurs, but later unknown/wrong-pair and valid-proof assertions are unreached. Reconcile the owning contract before correcting the oracle. |
| Changed commissioner automatic comparison | Comparative replacement setup returns `DIAGNOSTIC_STALE_VERSION` after Listing restoration. Do not claim this whole test passed. |
| Surviving public B after A-only product/worker purge | Reached public B JSON contains A's erased report ID in `successorOf`; the test expects null. B's retry, own writes and finalization reached this assertion. Product erasure defect confirmed. |
| Support reset barrier | Existing barrier not observed within its existing lock budget. Required ordering proof remains missing. |
| Publish and attach reset generators | Both existing assertions find PUT no longer suspended after exact reset. Required ordering proof remains missing. |

Raw API log `/tmp/carberk-resume-20261021/64f96-api-direct.log`, SHA256 `739c73fe6c0a427fc9846c18898f44d4815134044d99511665b1c1c365701ceb`. None of these failures justifies relaxing reset budgets, assertions, guards or CI. Earlier cancelled runs supply no completed behavioral verdict.

## Local assembly verification

Root ran fresh API TS7, TS6, lint and build successfully. Repository unit gates passed 10/10 with all 10 cached; repository typecheck passed 11/11 with all 11 cached. Cache results are inherited verification, not fresh body execution. Root tests freshly passed 597 with one skip and no failures. Glossary, runtime imports, existing-case preservation, actual import-only collection and `git diff --check` passed. Logs are under `/tmp/carberk-resume-20261021/public-auto-root-*`.

Two initial direct TS6 invocations used a nonexistent `typescript/bin/tsc`; both were command-path failures, with no source execution. The corrected configured TypeScript 6 entry point `typescript/bin/tsc6` passed. No production result is inferred from those failed invocations.

## Next bounded work

One isolated Codex writer, `release897-public-lineage-json-pdf-fix-codex-20261022-r1`, starts from `6ffc3262`. It owns product-erasure acceptance and the smallest proven correction across public JSON and PDF generation/read paths. Source inspection shows the renderer embeds `successorOf` from B's immutable snapshot, while document access validates B and its artifact without checking erased A. PDF disclosure is a source finding until actual byte/download evidence reaches it.

The assignment preserves B's usability, stored snapshot, issued-byte immutability, exact cleanup and current authority gates. New PDF criteria need genuine RED before their production fix; if non-container tests cannot establish it, the writer returns a test-only checkpoint for Root's hosted execution. A JSON-only patch is insufficient. No generic history ledger, new retention rights or guessed legacy ownership facts are authorized.

The selected #897 through #920 scope, public automatic ownership proof, remaining reset ordering, staff foundation/design, independent fixed-SHA reviews, native/deployed/operations acceptance, reproducible live reference edits, quiescent clean reset/reseed, latest-main staging restoration and signed Android artifact remain open gates. Three Railway refusals remain terminal. No reset, deployment, merge, promotion, store submission or launch occurred. Store submission and public launch remain separate decisions.

Docs: internal source/test/evidence assembly; no external dependency or service changed.
