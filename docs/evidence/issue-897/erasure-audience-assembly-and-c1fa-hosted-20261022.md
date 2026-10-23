# Erasure audience assembly and exact c1fa hosted result

Root inspected completed TEST writer `db59fd0f572303efab183bdeb3419194398b9448` (tree `41f06e69507ddb718a6c959f3e664bd64aac45ba`) from supplied base `9ca4026d8a071f3523f6522630dfe5b5eee92ed9`. Its clean owned checkout is `/Users/bagtyyar/.t3/worktrees/carberk/t3-596cfcca`. No pending child work or questions remain. Root verified all 33 retained artifact hashes, inspected the complete two-file diff and incorporated it as `3635ae13be3fbc76448d0aff116d512e5f0afe5f` onto `2e355715b19f704a9c24653cfb11900e41258bea`. Only the owned test and its [writer receipt](../issue-914/consumed-erasure-audience-oracle-20261022.md) changed in that assembly.

The test now captures each actor's complete HTTP response before expiry, asserts buyer attribution redaction and retained staff attribution, then compares each actor to their own baseline after cleanup. All four reads require private/no-store. Production disclosure did not change. Reconstructing the original test by removing only these additions succeeds byte for byte; global `expect` calls increase from 93 to 98. The original downstream assertion tail remains exact, SHA256 `f4c637cf15bd65c915fcd60fffadfe9e7e5a90bec940e20d5deb35665c653ced`. Root's assembled tree differs from the writer only in the three expected held documentation paths: staff foundation audit, staff foundation disposition and clean-acceptance reconciliation. Every other tracked entry/mode matches.

## Root verification

Artifacts are `/tmp/carberk-resume-20261021/erasure-audience-root-*`.

| Executed check | Result |
|---|---|
| `pnpm test:unit` | PASS, Turbo 10/10, all cached |
| `pnpm typecheck` | PASS, Turbo 11/11, all cached |
| Direct API `tsc --noEmit`, `tsc6 --noEmit`, full API lint | PASS, fresh, no compiler diagnostics |
| Agent docs, glossary, runtime imports, whitespace | PASS, fresh |
| Actual import-only Vitest collection | PASS, all 112 prior declarations and name/file multiplicities retained, empty stderr |
| Full diff, writer artifact hashes, original test reconstruction and downstream bytes | PASS |

Collection uses the retained `c2-collection.config.mts` with no global setup/setup files and `--staticParse=false --json`. No test hooks, HTTP bodies, worker or storage services executed locally. This is assembly verification, not the independent fixed-SHA Standards/Spec review. The original executed RED remains the exact070 hosted result; the same faulty comparison also failed on c1fa below. Full repaired erasure HTTP acceptance and its formerly unreached downstream assertions remain UNKNOWN until normal hosted execution.

## Terminal published c1fa evidence

Published head `c1fa984dd984ba59bc7b53669515296b455bd104`, [PR Checks 39848453485](https://github.com/Carberk/carberk/actions/runs/39848453485), completed with aggregate FAILURE. [API job 120068048893](https://github.com/Carberk/carberk/actions/runs/39848453485/job/120068048893) completed normally: API 332 passing/3 failing files, **3,284 passing/5 failing tests**; worker **373/373** in 57 files passed. [DB job 120068048707](https://github.com/Carberk/carberk/actions/runs/39848453485/job/120068048707) passed **392/392** in 41 files. Lane/static/frontend and the separately reported runtime check passed; docs skipped under unchanged lane policy. No run cancellation or timeout is attributed to these results.

Raw API log `/tmp/carberk-resume-20261021/c1fa-api.log` SHA256 `03fe8ea3e83ca637ddccb847b04b0029d10cba45f1942efa55e2a531be4b54c2`; raw DB log `c1fa-db.log` SHA256 `fd258456acb4b07d1fa49adf43156cd4ee9a540cf31befd335747994c885daf6`. Normalized copies and `c1fa-terminal-status.json` retain the source details.

The supported VIN correction HTTP journey now passed **1/1**, including its original downstream assertions. Both VIN conflict negatives passed **2/2**; manual correction conflict **2/2**, uncorrected mixed **2/2**, mixed conflict **2/2**, unchanged automatic VIN **1/1** and existing private proof suite **99/99** also passed. These are runtime results on c1fa, not merely collection evidence.

Five failures remain on c1fa:

1. Consumed private-link erasure, line 563: buyer report expected staff `authorId`/`reviewerId` instead of null. The new assembled oracle addresses that mismatch; it was absent from c1fa. Later assertions remain unreached there.
2. Public-transfer proof, line 497: genuine reached issuance returned 403 instead of 201. Public-transfer implementation remains selected work.
3. Support reset-worker barrier, CampaignFullV3 line 2299: existing lock budget ended without ordering evidence.
4. Publish reset-generator and 5. attach reset-generator, line 3288: suspended PUT had already settled before release.

The three reset tails remain required until the same-candidate operator replacement is proven. No assertion, timeout, concurrency setting or test was weakened or retired. Product security and worker correctness remain required despite disposable prelaunch data. The [clean-acceptance reconciliation](../issue-901/prelaunch-clean-acceptance-contract-20261021.md) separates passing product coverage from missing enforceable reset exclusion.

## Remaining sequence

Publish only after this terminal run, retain sole draft PR #904 with auto-merge off, and await the normal next CI result. One next isolated Codex assignment addresses supported corrected mixed comparisons with genuine domain RED/GREEN and new ordinary HTTP journeys, preserving all previous policy cases. Public transfer and complete retained-evidence coverage remain implementation obligations. The new staff handoff prerequisite awaits the already-submitted founder disclosure decision; dependent UI remains gated. Final independent review, native/browser/deployed/operations acceptance, staging restoration and exact signed Android artifact remain required. Play version/signing metadata is still pending.

Docs: no external dependency or service interface changed; repository source/tests and installed tools supplied the facts. These receipt-only changes use diff/link inspection instead of artificial RED tests. No Railway retry, local service, reset, deployment, merge, promotion, store submission or launch occurred. Three scoped Railway refusals remain terminal; prelaunch reset authorization does not authorize infrastructure destruction or public launch.
