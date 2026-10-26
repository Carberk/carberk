# B5 renderer positioning correction, 2026-10-26

This source checkpoint removes measured font positioning work whose results pdf-lib discards. Local affected verification passes with original PDF bytes preserved. B5 hosted acceptance remains open until the parent tests the integrated, uninstrumented candidate.

Same isolated owner/worktree and reserved branch as `c8d01014`, no duplicate child. Only the renderer, its direct caller test, the explicitly permitted renderer observer repin and evidence changed. Worker disposal/preparation/expiry, schema, kernel, R8/profile, API, fixtures, integration branch and CI configuration remain untouched. PR904 remains the sole integration PR. Current founder standing authority governs; historical attempt counts, failures and receipts remain intact.

[The machine receipt](b5-renderer-positioning-correction-20261026.json) contains exact commands, raw log paths and SHA-256s, before/after source pins, dependency/artifact hashes, CPU samples, case metrics, observer records and byte compatibility results. Diagnostic harnesses and raw profiles remain under `/tmp/897-b5-layout-20261026`.

## Baseline and provenance

Verified attribution receipt `/tmp/897-b5-hosted-attribution-20261026.json`, SHA256 `0330b708f9ba4f5d964f3f99a8ecdc59568d17c7c23c2d0c0d96b59f266287d3`, and full failed log `/tmp/897-hosted-40273159386-failed.log`, SHA256 `b06cfaf3f39a028ec95a04ced8a300f2aa5adb26f74831fa38742413bd527cb7`. Candidate `0faf63520e119064539da8318dd90178d14862c2`, tree `24c399f72886da8fe0a094604237e2eb55d3e3af`. The local spec, worker, renderer and parser matched all four receipt pins and those exact Git objects before profiling. Load-time Vite guards also required the actual four source inputs to match those pins before executing the original spec. Config retained repository setup and maxWorkers=min4,availableParallelism. No module mocks, aliases, collaborators or fixture changes were used.

The hosted receipt is the timing RED: TK4515ms success, RU5485.6ms failure, EN5837.5ms failure. All observer records were valid. RU completed10 layouts/9 saves/4 parses with a save active, EN9 layouts/8 saves/4 parses with a save active. Their completed layout intervals were4302.7/4788ms. Failure records remain frozen at first observation; later callbacks cannot turn their active work into completed evidence. No local native5000ms reproduction is claimed. The actual original B5 scenario was run locally, then profiled to distinguish demonstrated CPU work from scheduler delay rather than manufacturing slow scheduling.

Additional parent-supplied run40277574871, API job121423538150, is retained independently at `/tmp/897-hosted-40277574871-api-job.log`, SHA256 `1146a4a69918d13afadafb2607e2d4e7f975f2112a38e12eabca3867c1cd5491`. Its checked-out merge names head `14cd6f15eefb9bda8718e3741cce653207e2cb5e`. All four source Git objects still match the original pins, so it does not include this correction. The exact TK timeout block is at lines2137–2141 in this raw file, with unchanged5000ms. Worker totals were10 failed/53 passed/1 skipped files and39 failed/423 passed/33 skipped tests out of495. The file also retains three observer lines, including TK failure5174.3ms,10 layouts/9 saves and a save active. This supplemental receipt does not replace the original attributed run or establish a new cause. No unchanged hosted rerun was launched.

## Hypotheses and measured result

Ranked before probes: repeated wrapping measurements dominate; drawing/SVG operations dominate; or scheduler delay dominates without concentrated CPU work. The original real spec passed locally under an inspector CPU sampler, with case wall480.3/375.2/355.7ms. The profiler instead identified concentrated OpenType positioning during text encoding. Inclusive sampled width measurement was63.3ms, text drawing539.8ms, SVG drawing2.3ms and positioning632.5ms across the run. These stack intervals overlap and must not be added together. Process CPU includes V8 background threads and is not a single synchronous renderer CPU meter. The local profile establishes actual waste, not absence of hosted contention.

Installed pdf-lib1.17.1 `CustomFontEmbedder.widthOfTextAtSize` requests fontkit layout but sums glyph.advanceWidth, not GlyphRun.positions. `CustomFontSubsetEmbedder.encodeText` requests layout but consumes glyph IDs and creates its own subset. Neither consumes the positioned advance/offset arrays. Inspection of both exact shipped Noto Sans font tables found GPOS features kern/mark/mkmk and no such feature tags in GSUB. Glyph substitution is separate and remains enabled.

One-variable probes retained the original real B5 spec, parser, worker, fonts, inputs, concurrent-worker setting and5000ms default. They changed only the renderer's font feature options after validating its original hash:

- Disabling kern alone reduced profiled case wall to385.7/317.0/307.9ms and positioning samples to421.5ms. It was a partial diagnosis, not the delivered fix.
- Disabling the three unused positioning features reduced case wall to222.1/207.3/159.2ms and positioning samples to22.4ms. All original assertions passed.
- The final actual source, profiled through the same sampler with updated source identity, passed at316.5/271.7/214.7ms. Positioning samples were29.7ms and total renderer samples341.7ms, versus632.5/831.6ms in the baseline. Local load varied, including between the option probe and final source run. This is a measured reduction in redundant work, not a guaranteed hosted duration or a subtraction from old hosted receipts.

The optimization consists only of `{ features: { kern: false, mark: false, mkmk: false } }` on both fresh subset-font embeddings, with a source comment explaining the discarded result. No layout paragraph, wrapping calculation, glyph substitution, drawing, evidence processing, font bytes, metadata, version, parser, output cache, authorization, security check or worker state changed. Every render still creates a fresh PDF and embeds fresh font subsets. No cache of rendered output or decoded text was introduced.

## PDF preservation and tests

Before editing production source, captured original renderer hashes for paragraphs containing kern-sensitive words, ligatures, combining marks, Cyrillic/Turkmen characters, blank paragraphs, long wrapping text and an over-width word. Added three direct caller cases with those literal hashes plus real embedded-font parsing, full normalized explanation content, finding IDs, mileage, observation time and page count. All seven renderer tests passed against the original renderer at test checkpoint `f6c57bc7877405a876fbfab77e755a713fab7f94`. These are output-preservation tests, not a new performance RED. The representative hosted timeout supplies the performance RED; no flaky local timing threshold or artificial delay was added.

The option probes rendered the existing representative corpus and original B5 scenario. All54 completed render hashes matched the baseline multiset, and all18 files were byte-identical for short, long, zero-photo, many-findings, alternate-body and draft variants across TK/RU/EN. Their actual PDF text checks, glyph coverage and evidence completeness checks passed. The final uninstrumented source again produced18/18 files byte-identical to that baseline. This includes every page/content stream, line break, font program, Unicode map, diagram and photo byte in those files, not only extracted prose.

The final observed original scenario passed3/3, elapsed230.4/171.0/148.8ms, with layout84.1/64.8/57.5ms. Each record had invalid=false,10 complete fresh renders/saves,4 full parses,12 page-map/content segments,35 current checks and2 cleanup scopes, and no active frames. Both same-case sweeps and every original assertion remained intact. This measurement has observer overhead and is local only.

## Affected verification and failures

- Original uninstrumented worker suite: `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker test --config /tmp/897-b5-layout-20261026/uninstrumented.config.mts`,310 passed,73 service-dependent tests skipped,44 passed/15 skipped files. The temporary config only removes plugins from the repository config; its test object, setup, exclusions, concurrency and native timeout remain unchanged. No source transform, CPU sampler, new setup or observer runs in this verification.
- Final uninstrumented renderer corpus plus original B5 spec:10/10 passed, including the three new golden cases, original scheduling checks and all18 optional proof PDFs. This ran after the test-only lint correction described below.
- Known scheduler RED retained after the renderer fix: the scheduling-only earlier FIFO substitution from the previous diagnosis still causes all three required pending-versus-ready failures. This separate temporary loader has no observer plugin. Tracked worker source remains unchanged; its substitution hash is `89c8707755ba4e2e20314c81b87e2d49fa5a01fafb2e46ec1cbf322e14e23b76`.
- Observer reconstruction/failure-freeze checks3/3, worker lint, TypeScript7, TypeScript6 and worker build pass. The existing observer runtime/freeze semantics are byte-identical. Original five-second timeout and all safety assertions remain.
- An initial temporary paragraph config accidentally selected the full local suite instead of the intended test. It passed307 tests but is not counted as paragraph evidence. Corrected explicit selection ran the intended3 cases and captured the original hashes. The original and corrected logs are retained.
- Initial new-test lint failed `no-non-null-assertion`. Replaced that assertion with the repository's explicit fixture guard. Corrected lint and final affected tests passed; the failing lint log is retained.
- Some source-loaded manifests were overwritten by later byte-comparison runs using the same diagnostic config. This loss is recorded in the machine receipt. Every such run retained the original input guard; raw profile/config files and hashes remain. The final actual-source profile manifest contains all four exact loaded source hashes.

Docs: https://pdf-lib.js.org/docs/api/interfaces/embedfontoptions verifies the supported features option. The official versioned sources https://github.com/Hopding/pdf-lib/blob/v1.17.1/src/core/embedders/CustomFontEmbedder.ts and https://github.com/Hopding/pdf-lib/blob/v1.17.1/src/core/embedders/CustomFontSubsetEmbedder.ts verify which layout results are consumed. https://github.com/foliojs/fontkit#fontlayoutstring-features--- documents the feature boolean map. Installed matching declarations/implementation and the exact font tables were also inspected. No dependency changed. Any future font/library change needs renewed output compatibility evidence rather than assumed equality.

## Observer disposition and handoff

Renderer source SHA changed transparently from `f10b795606fcf5a2dd50a5fd32039b251881cd885d70ae34deec9f317911ec54` to `56cadc7ed652de1293e1d7d65523935e71c5443e2777592e11f7620a69aa74be`. Only that observer pin and the affected exact anchors/offsets changed; the declaration diff is preserved in the receipt. The spec/worker/parser pins stay unchanged. Historical receipts continue to identify the old renderer and are not evidence for the new source. Reconstruction checks passed for the new declaration. Observer config remains active in this diagnostic branch; final acceptance must remove it or use the equivalent plugin-free configuration, then run the original suite on the integrated candidate. Parent owns the actual integration/disposition and hosted run.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Identify bounded renderer waste | Actual pinned real-scenario profiles and one-variable feature probes | pass locally |
| Preserve issued bytes and semantics |54 render hashes,18 byte-identical files,3 original golden cases, real glyph/content checks | pass locally |
| Keep original scenario and timing contract | Original B5 unchanged;3 complete observed successes; final uninstrumented proof | pass locally |
| Preserve scheduler regression sensitivity |3 expected pending-versus-ready failures after fix | pass |
| Required affected checks | Worker310 passed/73 skipped, lint, TS7, TS6, build, observer checks | local pass, service gates remain |
| Original uninstrumented hosted candidate | Parent-integrated source not yet tested | pending parent |

No B5 closure or hosted GREEN is claimed. Parent should incorporate the test and correction checkpoints, retain the original hosted receipts and exact dependency/source mapping, then obtain original uninstrumented hosted evidence on the assembled candidate. Ordinary disposal/campaign closure is released for the parent's next assignment and was not changed here.
