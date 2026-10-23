# Worker renderer and parser cost diagnosis, 2026-10-23

This is a source and receipt investigation for selected issues #897/#914. It starts at integration `0a995b55f541675141f6a99704678f3466076a75` (`tree 825656b3aa36735b7118775b79f45884331ba3cb`) and uses the exact d9cc hosted receipt from run `39951828758`. It makes no production, test, helper, configuration, or dependency change. The only tracked write in this checkpoint is this document.

## What the source does

`DiagnosticArtifactWorker.generate` claims one artifact under a report lock, validates the immutable snapshot and current projection, reads verified evidence when needed, calls `renderDiagnosticPdf`, hashes and sizes the bytes, records the durable descriptor, writes the exact object, reads it back, and adopts it as ready (`apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts:55-135`). A missing predecessor changes the projection renderer to `v1-erased-lineage`; it creates a distinct replacement intent rather than rewriting the original artifact (`packages/db/src/diagnostic-reader-projection.ts:5-20`, worker `requestSafeReplacement` and `replaceErasedLineage`). The existing five-slot rotation reserves one slot for a replacement and leaves four FIFO slots (`DiagnosticArtifactWorker.ts:165-183`). This is the scheduling correction with the known baseline RED. It remains unchanged.

`renderDiagnosticPdf` creates a new `PDFDocument` for every call, registers fontkit, embeds both Noto Sans fonts with subsetting, lays out every text string, draws five diagrams, and calls `pdf.save()` (`apps/worker/src/jobs/diagnostics/DiagnosticPdfRenderer.ts:39-50`, `69-72`, `100-128`). The line wrapper repeatedly calls `font.widthOfTextAtSize`; pdf-lib lays out the candidate text through fontkit each time. At save, pdf-lib flushes pending fonts and serializes the whole document. The source has no renderer cache or cross-call PDF reuse. This makes font parsing/subsetting, repeated text shaping and final serialization plausible repeated work. It is source inference, not a measured attribution.

Each successful generation calls `current` at claim, durable descriptor planning and final adoption. That repeats canonical snapshot hashing, schema parsing, projection reads and memory-DB cloning. These are product safety checks, not redundant checks to remove. Each `execute` also scans replacement candidates by locale and runs cleanup, including expiration and identity retirement. Their cost is unmeasured. The fixture has no photos, so Sharp is imported but no image transform executes.

The test-only reader loads each generated PDF, walks every page, rebuilds each page's font `ToUnicode` map, decodes each content stream, and checks every glyph mapping (`apps/worker/src/jobs/diagnostics/testing/readDiagnosticPdfText.ts:5-52`). That parser is deliberately stronger than a plain text check because it validates embedded font mappings. It is source inference that parser work is proportional to pages, font maps, and content streams; no per-function timing receipt exists. A shared font resource referenced by multiple pages will have its CMap decoded again for each page, because the map is page-local. A future parser-local cache keyed by resolved font identity might avoid that, but source does not establish a useful gain or its correctness for arbitrary PDF resources. No parser change is proposed before measurement.

The `DiagnosticMemoryObjects` fake copies bytes on put and read and hashes on read, but it does not perform network or filesystem I/O (`packages/db/src/testing/DiagnosticMemoryObjects.ts:1-15`). The memory database implements in-process CRUD/filter/clone behavior and explicitly does not implement SQL projection, authorization, generation, cleanup, erasure, or lock semantics (`packages/db/src/testing/DiagnosticMemoryDatabase.ts:20-27`). This spec uses those same in-memory boundaries on hosted CI. It does not call Postgres or MinIO through them. Other tests and services may contend for the runner, but there is no direct network-storage latency in this spec.

The CI worker lane runs `pnpm test:api`, which runs API and worker suites against disposable Postgres, Redis, and MinIO (`package.json:18`, `.github/workflows/ci.yml:98-143`). Worker Vitest allows up to four workers (`apps/worker/vitest.config.mts:6-10`); hosted setup creates one disposable database per worker (`apps/worker/test/globalSetup.ts:16-35`). The d9cc log reports `58 passed / 1 failed test files`, `375 passed / 3 failed tests`, and total suite duration `50.27s`, with tests at 66% and import at 29%. The safe-replacement cases are therefore sharing a runner with other worker/API work. Contention is a live hypothesis, not a renderer diagnosis.

## What the receipts establish

The exact hosted API log `/tmp/carberk-resume-20261021/d9cc-api.log` has SHA-256 `ad3debc11aeb213e3ba4df1e26234ca59ede8536645533d077734221ecfb3894`. Run `39951828758` reported worker `375 passed / 3 failed`; all three failures were the unchanged `SafeReplacementScheduling.spec.ts` 5-second cases. Its bounded phase records were:

```text
TK elapsed 5148.5 ms: fixture-fonts 28.4, issued-generation 1190.1, issued-read-parse 58.7, backlog-erasure 1.5, pending-locales 1486.9, maintenance 2382.9 (unfinished)
RU elapsed 5227.5 ms: fixture-fonts 1.2, issued-generation 899.4, issued-read-parse 409.6, backlog-erasure 2.5, pending-locales 2407.0, maintenance 1507.6 (unfinished)
EN elapsed 5780.1 ms: fixture-fonts 5.0, issued-generation 490.1, issued-read-parse 535.4, backlog-erasure 0.8, pending-locales 1868.0, maintenance 2880.8 (unfinished)
```

These records locate the timeout at `maintenance` after substantial earlier work. They do not distinguish renderer calls, parser calls, database queries, object operations, or concurrent runner load inside those phases. They also do not show whether the worker was CPU-starved. No hosted timing rerun is authorized by this handoff.

The accepted local unchanged timing receipt `/tmp/914-worker-render-budget/original-fixed-timing.log`, SHA-256 `3790d77871e9300042cef8616454351f259f2123989e7bede9f774ba773376ac`, reports TK/RU/EN totals 421.3/369.7/416.2 ms. Its phase values include pending locales 80.5/64.3/67.3 ms, maintenance 180.4/170.4/187.8 ms, replacement preservation 20.8/24.1/44.8 ms, and ordinary drain 74.3/71.3/79.6 ms. The local result proves the unchanged test completes with the memory database and object fake. It does not simulate hosted services or prove hosted cost.

The exact earlier scheduler RED receipt `/tmp/914-worker-render-budget/original-exact-red.log`, SHA-256 `bc02677f23d508d4970471994ac552024178f1510d19264ae87037404ff057b4`, failed TK/RU/EN with replacement state `pending` instead of `ready`. That RED is behavioral evidence for preserving the scheduling correction. It is not evidence for changing a timeout or renderer.

The [prior worker render-budget receipt](worker-render-budget-correction-20261023.md) records a rejected probe that reused one locale's immutable bytes for other locale intents. It was rejected because locale-correct fresh generation was not exercised. No byte reuse is a valid cost correction. The existing report's final unchanged focused slice was 24 passed, and its source-preservation manifest says all tracked application/package files were byte-identical to the prior checkpoint. The source-preservation analysis for this checkpoint confirms the renderer, worker, spec, parser, fixture, fonts, package metadata, and lockfile are byte-identical to the supplied base. The inspected installed pdf-lib is `1.17.1`; no dependency lookup or upgrade was made (`Docs: not applicable, internal source/receipt investigation only`).

## Cost classification

| Candidate work | Evidence class | Current conclusion |
|---|---|---|
| Fontkit parsing/subsetting and pdf-lib font flush | Renderer source: two `embedFont(..., { subset: true })` calls per render; save flushes fonts | Repeated per PDF is source-inferred. No receipt isolates it. |
| Text shaping and wrapping | Renderer source: repeated `widthOfTextAtSize` in wrapping and `drawText` calls | Repeated per line/candidate is source-inferred. It is a plausible CPU cost, not measured hosted attribution. |
| PDF serialization | Renderer source: every render calls `pdf.save()` | Repeated per output is source-inferred. No byte-size or save-time receipt exists. |
| PDF text parsing | Reader source: `PDFDocument.load`, page walk, CMap rebuild and stream decode on each assertion | Repeated after issued and replacement reads is source-inferred. Local phase `issued-read-parse` includes it; no subphase measurement exists. |
| Photo decode/resize | Renderer source only runs Sharp when `evidenceIds` are present; this fixture's findings have `evidenceIds: []` | Not a cost in this specific scheduling fixture. Do not generalize to photo-bearing reports. |
| Memory DB/object fake | Fixture source implements in-process clone/hash/copy; local receipt is sub-0.5s per case | Not a hosted-service explanation. It cannot establish Postgres/MinIO cost. |
| Runner contention from other suites/services | CI configuration plus hosted 50.27s mixed suite; d9cc phase totals | Possible indirect contributors. This spec has no direct DB/object network calls. Current phases cannot separate runner waits from renderer/parser CPU. |

The strongest current conclusion is that the test performs fresh locale-specific rendering for every artifact and fresh embedded-font parsing for every text assertion, while the hosted evidence only identifies a broad phase boundary. There is no evidence that product scheduling, retention, locks, assertions, or renderer correctness caused the failure.

## Smallest next instrumented experiment

Do one bounded experiment only after the parent chooses to authorize it. Keep production and assertions unchanged. Use a temporary, untracked harness or an isolated test transform. Do not repeat timing runs or rerun CI as part of this receipt.

Keep the existing eight outer test phases. Add only these inner phase names, with numeric call counts, completed milliseconds and the active phase's elapsed milliseconds measured with `performance.now()`:

- `render-create`: `PDFDocument.create`, metadata, and fontkit registration.
- `render-fonts`: both awaited `embedFont` calls. This measures font construction, not all deferred subset work.
- `render-layout`: all remaining layout/drawing before `pdf.save`.
- `render-save`: the awaited `pdf.save`, including deferred font subsetting/embedding and serialization. Do not claim this isolates subsetting from serialization.
- `parse-load`: the awaited `PDFDocument.load` in `readDiagnosticPdfText`.
- `parse-font-maps`: each page's resource lookup, CMap decode and mapping construction.
- `parse-content`: content stream decode and glyph lookup through final result construction.
- `worker-current`: each whole `current` validation call, including canonical hash, schema parse, projection and memory DB reads.
- `worker-cleanup`: the entire cleanup call after the generation loop.

Use a `/tmp` Vite pre-transform that matches these exact existing source module identities and fails closed if the expected source hashes or transform anchors differ. Preserve imports, arguments, return values, exceptions, timestamps and all awaited operations. Keep per-case state in a scoped context carried through async calls, never a global "current locale" variable. A timed-out case can continue while the next one starts. Accumulate bounded counts/totals, use the existing `onTestFailed` hook for failures and a single end-of-case write for success, and freeze the case record after emission. No per-glyph or per-word timing is needed. `worker-current` and outer totals overlap render phases and must not be summed as disjoint totals.

Successful source-inferred counts are 10 renders per case: one issued original, two pending-locale safe replacements, five renders in the first maintenance pass, and two in the final drain. The first pass renders one remaining safe replacement plus four ordinary artifacts. The parser runs four times per case, once for the issued bytes and once for each replacement. Across three completed cases that is 30 renders and 12 PDF parses. Failure counts may be partial. Compare these counts before interpreting any duration.

The proposed exact invocation, not executed in this task, is:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run --config /tmp/914-worker-renderer-parser-probe/config.mts src/jobs/diagnostics/SafeReplacementScheduling.spec.ts
```

The named test remains `recovers an issued %s PDF in one ordinary maintenance pass despite older generation work`, TK/RU/EN, with the unchanged 5,000 ms bound. The temporary config must retain the current worker count and all assertions, disable database global setup through the existing off switch, and add no application bootstrap or listener. Inspect the complete transform/config and their import chain before authorizing that one invocation. No config or instrumenter is implemented here. A local invocation would locate local cost only; parent must choose the environment and a separate permitted way to obtain hosted subphase evidence. No packagewide run, CI dispatch or rerun is part of this proposal.

The named checks in that one experiment are: each generated descriptor's SHA-256 and size match the object readback; each replacement has renderer `v1-erased-lineage`, state `ready`, a new id, and text containing B's id, finding, template, mileage, and observation date; no replacement text contains A's id; the original issued descriptor and bytes remain unchanged; all six ordinary artifacts become ready after the second drain; the unrelated object remains; and the existing three-locale scheduling assertions remain untouched. The emitted record must contain no report ids, object keys, PDF bytes, snapshot text, evidence ids, credentials, or environment values. The harness must not open a socket, register a listener, write outside `/tmp`, or start a service. The exact preflight checks are `git diff --check`, SHA-256 comparison against the inspected source manifest, and `rg -n 'listen|createServer|process\.env|DATABASE_URL|REDIS_URL|MINIO|TOKEN|SECRET|fetch\(|https?://' /tmp/914-worker-renderer-parser-probe/config.mts /tmp/914-worker-renderer-parser-probe/instrument.mjs`. Any hit requires source inspection before running. The static scan is a guard, not proof by itself. Read the harness and all added imports to confirm no network, child process, environment dump, telemetry endpoint, watcher, timer, or application startup. Emit only enum locale, enum outer/inner phase, finite durations, and bounded counts. Do not emit exceptions, CPU profiles, ids, paths, PDF content, environment values or input hashes. No new event listeners or socket listeners are allowed; use only the existing Vitest failure hook.

The result would classify cost only if call counts and renderer/parser milliseconds account for the phase. If they do not, the remaining question is runner contention or untimed in-process fixture/worker work. No result from that experiment would authorize a timeout change or a product workaround by itself.

## Safe fixture-input reduction map

All successful calls currently render fresh bytes. Only font byte reads are already shared by the module-level promise. Each case has its own memory database, storage map and worker. No case uses `it.concurrent`. Font byte sharing does not share fontkit objects or parsed PDFs across calls. The regular font SHA-256 is `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`; bold is `c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a`. Both are preserved in the source manifest; their byte lengths are 569,208 regular and 575,740 bold. The scheduling fixture has one finding, one check, no panels and no evidence photos. Both ordinary reports derive from B but have their own report/order ids and `successorOf`/`correctionReason` null.

A narrower future fixture design could precompute these exact full renderer inputs to locale-correct bytes, without sharing any mutable row, descriptor, storage map, `PDFDocument` or `PDFFont`. This is a design possibility, not a delivered patch or a proved timing gain:

| Current call | Possible precomputation | What must remain real |
|---|---|---|
| Initial `worker.generate(issuedId)` before erasure, spec line 43 | Three original B PDFs, one per locale. Input is the unchanged B snapshot including A lineage and `Independent visit`, `generatedAt = 2026-10-23T00:00:00.000Z`, reference `/diagnostics/reports/<B id>`, empty photos, exact font bytes. Only one selected locale is used in each case. | Keep the actual `generate` claim, current projection validation, descriptor planning, put/readback/adoption and initial parse asserting A. A test-only renderer-boundary selector could return a defensive copy of the exact fixture output. Do not seed a ready row or bypass the worker. |
| Two post-erasure `worker.generate(id(40 + index))` calls, spec line 72 | Three safe B PDFs, one per locale. Input is the independently derived B projection with only `successorOf` and `correctionReason` nulled, same generated date/reference/fonts/empty photos. Use only the two non-issued locales for this setup path. | Keep both original calls, old-intent rejection, replacement discovery and recursive replacement generation, real attempts/descriptors/storage and all three replacement parses/assertions. Do not remove these calls. |
| First `worker.execute()`, spec line 74 | None | The selected issued-locale replacement renders fresh through the real renderer, together with four real ordinary backlog renders. No descriptor/bytes may be injected here. |
| Second `worker.execute()`, spec line 98 | None | The last two ordinary artifacts render fresh. Both ordinary RU due-retry rows retain their original failed state, attempts and retry time before their real claims. |
| Four `readDiagnosticPdfText` calls and all exact object reads | None | Continue parsing the actual stored output and comparing historical bytes and descriptors. No cached text or skipped Unicode checks. |

A complete fixture key must cover canonical full projected snapshot, locale, generatedAt, verificationReference, renderer/source version, ordered photo ids and byte digests, and both font digests. Use this only in private synthetic fixture provenance, never emitted diagnostic records. Existing fake `createdAt` is fixed at 2026-10-23 for B and replacements. Ordinary backlog dates are 2026-10-22 and its ids differ, so they must fail closed out of this selector. Dynamic replacement ids are absent from renderer input and cannot justify sharing mutable artifact rows. Any input mismatch must fail the fixture selector rather than silently select different bytes. Verify locale by decoding the correct localized title and page locale label, plus B facts and the appropriate presence/absence of A. Include source/font/input/output digest provenance and a separate renderer parity check when initially constructing the fixtures.

This could remove three setup renders per case, while retaining seven fresh renders per case and all four parses. It moves renderer correctness coverage for those three setup calls into fixture provenance and the dedicated renderer spec. That tradeoff requires a narrowly owned test seam; the current worker has no injected renderer port. A temporary module transform or a future explicitly test-only selector would need review to prove it cannot match ordinary backlog or maintenance rendering. **Unresolved decision:** whether parent accepts that coverage tradeoff and owns the selector design. No such seam, fixture generation, or new verification is authorized in this research checkpoint. Do not replace it with cached original-ready PDFs for ordinary pending work.

Precomputing only template/hash/row payloads avoids that tradeoff but is unlikely to recover seconds: d9cc `backlog-erasure` was just 0.8–2.5 ms. Font files are already read once. Therefore instrument renderer/font/save/parser cost before choosing fixture-output precomputation. The prior rejected cross-locale byte reuse and removal of the two discovery calls remain prohibited.

## Commands and artifact provenance

The writer ran only source/receipt reads, branch reservation, docs checks, diff inspection, commit and the authorized checkpoint push. No timing test was executed. This host runs Codex `gpt-6.1-sol`, medium effort. Its pre-existing scaffold branch `t3/674e5c28` started at the supplied base and was preserved. The host-created owned worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-674e5c28`. Parent PR [#904](https://github.com/Carberk/carberk/pull/904) is linked to this thread; no new PR, issue, or external message was created.

The exact reservation commands were `git switch -c agent/issue-914-worker-renderer-cost-diagnosis-20261023` and `git push -u origin agent/issue-914-worker-renderer-cost-diagnosis-20261023`. Before reservation, `git rev-parse HEAD HEAD^{tree}` matched the supplied pair and `git status --short --branch` was clean. Existing local/remote task refs and worktrees were inspected; no branch with the reserved name existed. No fetch or checkout of another worktree was needed.

Reproducible read-only receipt and preservation commands:

```sh
python3 /tmp/914-worker-renderer-cost-diagnosis/inspect.py
shasum -a 256 /tmp/carberk-resume-20261021/d9cc-api.log
rg -n 'safe-replacement-phase|Test Files|Tests |SafeReplacementScheduling|Duration' /tmp/carberk-resume-20261021/d9cc-api.log
node scripts/check-agent-docs.mjs
node scripts/check-domain-glossary.mjs
git diff --cached --check
git diff --cached --name-status
git diff --name-status 0a995b55f541675141f6a99704678f3466076a75 HEAD
```

The two Node checks were inspected first. They read tracked documentation and invoke only local git file inventory; they have no network or listening-service path. Both passed. The evidence document is outside the agent-doc checker inventory, so it also received manual source/path/claim review. No glossary or ownership definition changed. Artificial RED, lint/typecheck and unit suites are unnecessary for this docs-only checkpoint under the task's explicit check restriction.

Historical commands below are provenance only, not commands executed again:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run --config /tmp/914-worker-render-budget/baseline.config.mts src/jobs/diagnostics/SafeReplacementScheduling.spec.ts
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run --config /tmp/914-worker-render-budget/timing.config.mts src/jobs/diagnostics/SafeReplacementScheduling.spec.ts
```

Their accepted log hashes are recorded above. The earlier `commands.json` hash is `649ed5cdabfb85edbe76b1c462c15a2a15c5752293ceab2e8edf65e146073b80`, and the success-only `timing.config.mts` hash is `d303c41b229d4fc36ab47397f73a720e1dd3305ac242ff07908d7a97e4d66d62`. The installed library was read only at `/Users/bagtyyar/.t3/worktrees/carberk/t3-f225c6af/apps/worker/node_modules/pdf-lib`, specifically `package.json`, `cjs/api/PDFDocument.js`, `cjs/core/embedders/CustomFontEmbedder.js` and `CustomFontSubsetEmbedder.js`. Package metadata says 1.17.1, matching this base's pinned dependency. This is installed-source evidence, not a claim about another library version.

New `/tmp/914-worker-renderer-cost-diagnosis` artifacts:

| Artifact | SHA-256 |
|---|---|
| `inspect.py`, exact file/digest/base comparison and receipt extraction script | `2d053cb478ee94d8f9f296249e9b557984f02c0bc8dc821f8c67efc826088664` |
| `source-preservation.json`, 14 repository files identical to base plus four installed-library file hashes | `e325c42a9c3079848e2f88362f20d7ad08b35d78a9402b3372b97089a09f7207` |
| `receipts.json`, full existing receipt hashes and lengths | `12a17ea4a3726858d6a1b5f833c107a976537268c5ddf8213fa682c3ef9b5d7d` |
| `d9cc-selected.txt`, exact three phase records and worker result line | `1c8f788c470eb8b78d76d2ba94f2c7e9bc7a96e4ff905b100106192eb3a32776` |
| `agent-docs.log`, passed | `aecc3fad493f95385b2eb915f12a25975582dfc392a5f942fea2eecbcf8cf7db` |
| `glossary.log`, passed, 31 terms | `2e05fa0133022f990bd0007c0ce14a7141e5ad8e3bcf7bc68332b987daceaf09` |

These temporary artifacts are local receipts; the tracked document preserves the conclusions and exact hashes if the files are later removed. The final commit and tree are returned in the writer handoff to avoid a self-referential commit hash in this document.

## Decision and handoff

No repair or workaround is justified by the present evidence. The parent should decide whether the single instrumented experiment above is worth a separately scoped hosted diagnosis. If it is not authorized, leave the renderer/parser cost unknown and preserve the existing scheduling correction and its RED baseline. Hosted GREEN remains unknown. This document does not claim release readiness.

Verification for this docs-only checkpoint:

| Criterion | Evidence | Result |
|---|---|---|
| Source/fixture/parser paths inspected | Source files listed above; `/tmp/914-worker-renderer-cost-diagnosis/source-preservation.json` | pass |
| Prior hosted/local receipts preserved | Exact hashes above; `/tmp/914-worker-renderer-cost-diagnosis/receipts.json` | pass |
| No production/test/helper/config changes | `git diff --name-only 0a995b55f541675141f6a99704678f3466076a75..HEAD` plus status | pass |
| Renderer/parser hosted cost attributed | d9cc phase records lack subphase data | unknown, intentionally unresolved |
| Bounded next task and fixture tradeoff recorded | No implementation; next experiment and conditional fixture map only | pass |

Checkpoint branch: `agent/issue-914-worker-renderer-cost-diagnosis-20261023`. The branch is reserved and pushed from the supplied base. No CI polling/dispatch/rerun, deployment, Railway retry, Docker, database/HTTP service, listener, native/device action, credential probe, or external message occurred. The three Railway refusals and three prior repair attempts remain terminal; this research does not restart either budget. No background process was started. Parent owns assembly, exact-candidate acceptance and all later manual native testing.

## Authorized single local instrumented run, 2026-10-23

This append records the parent's separately authorized one-run experiment after inspection of the temporary config, runtime, transform, all 24 preparation manifest artifacts, 1,375 runtime input hashes, and four source hashes. It supersedes the earlier statement that no timing run was authorized only for this one exact invocation. Parent explicitly allowed intrinsic Vitest local API-token/cache management as incidental runner state. No token file was manually inspected, printed, changed, redirected or patched. API/UI/browser remained off, and no listener or device checks were added.

The run used this writer's owned worktree at frozen source checkpoint `0593e3757d2bdcd3ba91fa21a6b934630c793762`, tree `2e332b86bd883bb45d6431ff46680de2d4984146`. Parent integration was `0ca85a6276286278b49333cfa25e0cc99cd93166`. Direct `git show` byte comparisons confirmed that the worker, renderer, parser and named spec are identical at both commits and in this worktree. No rebase occurred. Other tracked files were unchanged before this append.

Preparation used the authorized `pnpm install --offline --frozen-lockfile --ignore-scripts`, with 2,034 reused packages and zero downloads, then the exact local contracts and DB builds. DB code generation used only the explicitly inert URL from the preparation receipt. No migration, seed, database connection, application build or borrowed output occurred. Parent reviewed the installed/generated passive import chain. The standalone temporary config imports no repository global setup or setup-env, retains the original maxWorkers and default 5,000 ms bound, and disables API/UI/browser, HMR and file watching. It uses the real module identities without aliases or mocks. Original tracked test bytes, arguments, imports, await expressions, assertions, ordinary generation and scheduling remain unchanged. Four in-memory transforms were guarded by exact source hashes and expected edit counts, with byte-exact inverse reconstruction checked before the run. The existing failure hook would freeze per-case AsyncLocalStorage records after emission; this successful run did not exercise its timeout path.

Exactly one timing command was executed, from `/Users/bagtyyar/.t3/worktrees/carberk/t3-674e5c28`:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run --config /tmp/914-worker-renderer-parser-probe/config.mts src/jobs/diagnostics/SafeReplacementScheduling.spec.ts
```

Output was redirected once to `/tmp/914-worker-renderer-parser-probe/authorized-once.log`. Terminal exit was **0**. Vitest 5.0.4 reported **1 file passed, 3 tests passed**, duration **1.95 s**, with tests 62%, import 34% and transform 3%. There was no setup failure, retry, fallback, or second timing invocation. Each locale produced exactly one completed probe record.

### Completed measurements

All times below are local monotonic elapsed milliseconds, rounded by the prepared hook. Outer phases include their nested work.

| Outer phase | TK | RU | EN |
|---|---:|---:|---:|
| Total case | 444.9 | 371.8 | 362.5 |
| fixture-fonts | 10.0 | 0.2 | 0.2 |
| issued-generation | 65.7 | 38.2 | 34.7 |
| issued-read-parse | 4.0 | 1.6 | 1.1 |
| backlog-erasure | 0.3 | 0.2 | 0.2 |
| pending-locales | 83.0 | 66.5 | 69.5 |
| maintenance | 185.9 | 173.3 | 168.2 |
| replacement-preservation | 21.0 | 20.3 | 16.2 |
| ordinary-drain | 75.1 | 71.6 | 72.4 |

Each outer phase count was one per locale. Each renderer phase completed ten entries per locale; parse-load completed four, parse-font-maps and parse-content twelve each, worker-current thirty-five and worker-cleanup two.

| Inner phase | Calls per locale | TK ms | RU ms | EN ms |
|---|---:|---:|---:|---:|
| render-create | 10 | 1.4 | 0.0 | 0.2 |
| render-fonts | 10 | 12.0 | 6.2 | 6.2 |
| render-layout | 10 | 301.2 | 271.3 | 268.2 |
| render-save | 10 | 85.4 | 66.3 | 64.6 |
| parse-load | 4 | 3.2 | 1.1 | 1.0 |
| parse-font-maps | 12 | 4.0 | 2.9 | 2.5 |
| parse-content | 12 | 0.8 | 0.5 | 0.4 |
| worker-current | 35 | 4.6 | 2.4 | 2.1 |
| worker-cleanup | 2 | 0.5 | 0.3 | 0.3 |

The expected ten renders and four full PDF parses completed in every case, thirty renders and twelve parses overall. The twelve page-map/content entries per case are consistent with the actual four parsed three-page PDFs. Ten font-phase entries each cover both embedded font calls. A rounded zero is below this hook's resolution, not proof of no work.

All original assertions passed: three distinct ready safe replacements with one generation attempt, predecessor A absent from replacement text, B's own report/finding/template/mileage/date preserved, the first pass completing exactly the expected four FIFO ordinary artifacts, final drain completing all six, the original B record and issued artifact row/bytes preserved, and the unrelated object retained. No cached fixture output, skipped parse or changed ordinary artifact state was introduced.

### Interpretation and evidence limits

For this single completed local run, layout/drawing is the largest measured renderer phase; save is next. The layout phase includes wrapping, fontkit-backed text measurement, drawing, diagram work and associated allocation. The experiment does not isolate which of those dominates. The save phase includes deferred font subsetting/embedding and full PDF serialization, so it cannot be described as serialization alone. The direct embedFont phase is smaller here; that does not establish total font cost because shaping and deferred subsets occur in later phases.

PDF load/font-map/content decoding, current validation and cleanup are small in these local records. Replacement-preservation includes other reads/assertions beyond the measured parser. Nested phases and outer phases are not disjoint and must not be summed together. Rounding per segment, instrumentation, the added case promise bookkeeping, library initialization and scheduler waits affect these elapsed values. There is no uninstrumented control run under this authorization and no CPU profile. No repeat or timing loop is justified by these numbers.

This is local in-memory fixture evidence only. It does not establish why hosted d9cc needed more than five seconds, does not attribute hosted cost to layout, does not simulate hosted contention, and supplies no hosted GREEN or release-readiness evidence. The known scheduling baseline RED and existing product correction remain preserved. No timeout, concurrency, retention, authority, lock, assertion, renderer or fixture change is authorized by this result.

The smallest next evidence task is for parent to decide whether the completed phase counters should be carried into a separately authorized representative hosted observation. Local evidence makes layout/save the first phases to compare, while retaining parser/current/cleanup counters to detect a changed cost distribution. Do not run another local timing experiment, change wrapping/subsetting/parser behavior, add cached fixture PDFs, or infer hosted benefit from this one local sample. If no hosted observation is authorized, keep the hosted cost attribution unresolved.

### Artifacts and append verification

All preparation and run artifacts remain under `/tmp/914-worker-renderer-parser-probe`. The original preparation manifest is preserved as `SHA256SUMS.pre-run`. The updated manifest lists the 24 reviewed preparation artifacts and five added receipt artifacts. It intentionally excludes runner-managed cache/token files; none were inspected for this handoff.

| Artifact | SHA-256 |
|---|---|
| `authorized-once.log`, complete one-run output | `f2fea49975648a5e794762b515e8c31b1e74087dbc4da5a5e6124a4895bf1964` |
| `measurement-records.json`, exact three parsed records | `f8e42057ece9b66ca59095771d5e1b2ee08d440488f01f44a85667ba6ec05e02` |
| `run-exit.json`, exact command/cwd/base, exit 0, invocation count 1 | `2e64479fba59858b8fefaaa9ab20aa4b380b3f7189e5d3c8f3fea6d74dfe466d` |
| `post-run-source-preservation.json`, four frozen/parent source comparisons and pre-append clean status | `e91aeb735ef1c0d27752660fa02c39da62c33c1e2b7aa67f8c35d69d9fac1a50` |
| `SHA256SUMS`, updated controlled artifact manifest | `dbab0c3a431f440d1ace2860c2d86624230b97886f7bb2a6bbcce6de0fc2e477` |

The earlier PREPARATION.md runner-token concern is superseded solely by the parent's explicit disposition above. Preparation artifacts and executable probe hashes stayed unchanged for the authorized invocation. The earlier source-review.json is a pre-run receipt; post-run-source-preservation.json and run-exit.json own current run status.

Append-only verification uses `git show 0593e3757d2bdcd3ba91fa21a6b934630c793762:docs/evidence/issue-914/worker-renderer-parser-cost-diagnosis-20261023.md` as the exact preserved prefix, `node scripts/check-agent-docs.mjs`, `node scripts/check-domain-glossary.mjs`, and `git diff --check`. No additional tests were run for the docs checkpoint. This document is the sole tracked diff. Its pushed commit/tree are returned in the handoff without rewriting the earlier receipt. Parent owns integration assembly and any next authorization.
