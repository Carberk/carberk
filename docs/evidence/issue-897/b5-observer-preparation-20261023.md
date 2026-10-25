# B5 observer preparation, 2026-10-23

Prepared under the founder's exact one-measurement exception supplied to this writer, using the full `/tmp/carberk-b5-hosted-measurement-proposal-20261023.md`. This checkpoint prepares reviewable bytes only. It does not collect evidence or establish runtime validity, acceptance, a remedy or GREEN.

Base: `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`. Owned branch: `t3/25216ac4`. The checkpoint commit and tree are returned in the writer handoff. The original proposal names an older base; all four source pins and the config pin match this supplied accepted base exactly. No pin was changed. B1 and production logic are outside this writer's scope. Any later B1 change to a pinned worker module is a collection conflict for parent review, not permission to repin.

The only tracked changes are two worker test-support files, the config import and top-level plugins entry, and this receipt. No tracked source/spec bytes changed. The entire config suffix starting at `  test: {` is byte-identical, including setup, excludes and maxWorkers. No timeout setting was added; the existing default five-second budget remains. No dependencies, scripts, workflows, Turbo settings or environment flags changed.

## Declared behavior

Only the selected spec opens AsyncLocalStorage state. Fixed locale membership and the bounded opened-locale set permit at most one case per tk/ru/en per module instance. Duplicate/unknown case entry fails with a fixed test-support error before running a new body. Renderer/parser/worker calls outside that state return from recorder calls without collecting data.

The original callback returns the ALS wrapper's promise. Its complete original body stays inside one added async callback. One synchronous success continuation returns the identical fulfilled value; there is no rejection handler and the original rejection reason propagates. There are no added awaits. The existing failure hook first calls emitFrozen with explicit closure state, retaining all original failure-hook bytes and output. It does not depend on hook ALS propagation.

Each function wrapper opens one frame, enters try around the entire original body, marks failure in catch, rethrows the identical caught value and closes in finally. Original early returns, await expressions, checks and assertions remain byte-identical. Step completes the previous segment and starts the next. Close records the final segment as completed on normal exit or failed on exceptional exit. Failed and active durations are never added to completedMs. Nested frames remain distinct even when names repeat.

The first emission takes one monotonic timestamp and marks the state frozen before record construction. Success closes the final outer phase and reports no active outer phase. Failure leaves that phase active. All later recorder callbacks and emissions see the frozen guard and do nothing. The record has only fixed names, counters and finite numeric times, locale, outcome and invalid. It has no arguments, identities, object keys, paths, errors, secrets or content. The runtime issues one synchronous stderr.write with the bounded JSON line. A write exception is caught only for that observer transport operation; it yields missing evidence, with no retry or fallback. No original product exception is caught by that transport catch.

Bounds are 32 live frames, 1024 per counter and 60000 ms per duration. Saturation, overflow, unknown recorder enums and invalid success accounting set invalid. Values are rounded to 0.1 ms only when serializing. There are nine fixed inner cells and eight fixed outer cells. The maximum fixed record shape, including 32 active entries, is below 8192 characters. Only the three fixed locales can emit. Successful render segments must each complete ten times, parse-load four times and each page segment twelve times or the record is invalid. Worker-current and worker-cleanup counts remain descriptive cross-checks, with no required 35/two assertion. None of these observer checks alter product/test assertions or turn invalid evidence into acceptance.

Each segment adds clock reads, bounded counter work and frame-set operations. ALS, the added async callback and its success continuation add allocation, context and promise bookkeeping. Transform/import work, hashing code presented to the plugin and no-state recorder calls also add overhead to the normal suite. No overhead measurement, subtraction, zero-cost claim or CPU attribution is made. Event-loop delay can postpone failure-hook delivery beyond five seconds. A kill before that hook leaves missing evidence.

The original font-byte promise, inputs, both sweeps, ten renders/four parses per locale on successful execution, due retries, glyph checks and every assertion stay in the retained source bytes. Reconstruction proves byte retention, not execution outcomes. No source repair is included.

## Passive checks actually performed

Read AGENTS, the full proposal, context map, coding workflow, coding standards, runtime boundaries, domain/worktree guidance, worker and diagnostics overviews, relevant glossary terms, affected sources and existing insertion sketch. Applied unslop to this receipt. No nested agent was used.

Computed source/config SHA-256 pins and compared original source bytes with the accepted Git base. Independently read the plugin's literal JSON declaration as data, required every anchor exactly once at its declared UTF-8 byte offset, checked inserted phase literals against fixed enums, accounted for all 21 insertions and reconstructed every original by removing only those inserted spans. No plugin import, JavaScript evaluation or transform invocation occurred. The declared output digests below are passive byte-concatenation results, not captured Vite outputs. The parent still owns concrete transform review.

`node --check` passed for both new .mjs files. `git diff --check` passed. Syntax-only checks did not load either module. The initial preparation command found no `python` executable; preparation used `python3`. An initial syntax-only check referenced the not-yet-created plugin and reported MODULE_NOT_FOUND; the completed files subsequently passed both syntax-only checks. No observer, render, parser, test, probe, collection, build, CI, service, PR, deployment, reset, Railway, device or native action occurred. No push was made. The checkpoint commit bypassed hooks to avoid implicit execution under this preparation-only authorization.

The three prior repair attempts remain exhausted. Exactly one future observation is permitted only in the next independently justified normal combined hosted batch. This checkpoint does not authorize launching that batch. Missing, invalid or cached evidence returns to parent disposition with no repeat, forced cache miss, tuning, source repair or waiver. Parent must check actual worker execution and final candidate provenance, preserve raw logs and decide observer removal through the normal workflow.

## File hashes

SHA-256. New test-support files have no original version at the accepted base.

- `apps/worker/test/b5-observation-runtime.mjs` new: `ac77a1f2b89098d3870053d41a4375832b7504ee0e07d26f038f4e31db2e4a9e`.
- `apps/worker/test/b5-observation-plugin.mjs` new: `bb4bbe4421edb7e8a62a32035fe28574832cbea0881ac79774a6396905e2be15`.
- `apps/worker/vitest.config.mts` new: `ade9611accac4f64443d98bd381844ad0cf0fd4ea66b528f7589be2d47c58967`.
- Config original: `3a2a5df706d50b5d4c8be9853448577778458cedd68f23e9a4dbba1eaed6d6f8`.

All four tracked source files retain their original digests. The declared output includes the runtime import resolved relative to the plugin. Its spelling here is specific to this owned worktree; another checkout must materialize its own canonical runtime path before comparing output digests. No developer path is hardcoded in the plugin. All four imports resolve to the same runtime module, with no resolveId/load hook, aliases, copies, mocks, redirect or cached output. Canonical target IDs must be exact absolute TS paths derived from the plugin. Query/hash suffixes, encoded, relative, file-URL, /@fs/ and JS spellings of these target names fail the identity guard. A pinned source digest under any other identity also fails that guard.

## Insertion reconstruction

All offsets and lengths below count UTF-8 bytes, zero-based. Each row inserts bytes only. Remove spans from the declared output in descending transformed-offset order, verifying each inserted span hash first, then require the original digest. No original span is replaced, removed or rewritten. The plugin's literal tables contain exact anchor and inserted text for every row. The full local manifest also retains all inserted text at `/tmp/carberk-b5-preparation-manifest-20261023.json`.

Runtime import for these output digests:

```ts
import { observeCase as __b5ObserveCase, observeOuter as __b5ObserveOuter, emitFrozen as __b5EmitFrozen, begin as __b5Begin, step as __b5Step, close as __b5Close } from "/Users/bagtyyar/.t3/worktrees/carberk/t3-25216ac4/apps/worker/test/b5-observation-runtime.mjs";
```

### apps/worker/src/jobs/diagnostics/SafeReplacementScheduling.spec.ts

- Original and reconstructed: `d6cf8dc5e5bcd293776bb78b0f445ba29a0c02b1c846bbb93493f7bc8e1f5f94`.
- Declared inserted output: `29c416331eb26dd9a65465a6fd9273102c21335a754275415b7c207f3af647e5`.

| Insertion | Original offset | Output offset | Length | Inserted SHA-256 |
|---|---:|---:|---:|---|
| runtime-import | 0 | 0 | 266 | `0e42d5152159e88d7a540138bb742e4778722e3b3121e05239793baf206bb971` |
| case-enter | 1510 | 1776 | 66 | `2dae82e31fd01729e4d85407219aac1afb4b403d92ac86dc8ee2390e63aac161` |
| outer-phase | 2059 | 2391 | 28 | `a32d2446de072aa4a4a46d53b23720ef9bf8e6015c7a2b1c59a580cca6b7673a` |
| failure-freeze | 2258 | 2618 | 48 | `b14be14d441a138df2602c144d78cd255b47344f19ade6c5e2bfeac43de34f00` |
| case-exit | 6958 | 7366 | 6 | `3a3e46f94276b6f6f4ed1f02af78bef6a2ee1c439dd5584b973948313214d2b7` |

### apps/worker/src/jobs/diagnostics/DiagnosticPdfRenderer.ts

- Original and reconstructed: `f10b795606fcf5a2dd50a5fd32039b251881cd885d70ae34deec9f317911ec54`.
- Declared inserted output: `334f6a612ba4ad5d9a3ca42e8956e65eb801e9a160c683c7a40683e9de2e200c`.

| Insertion | Original offset | Output offset | Length | Inserted SHA-256 |
|---|---:|---:|---:|---|
| runtime-import | 0 | 0 | 266 | `0e42d5152159e88d7a540138bb742e4778722e3b3121e05239793baf206bb971` |
| render-enter | 5572 | 5838 | 82 | `2936ee3e4f3b4e619103089c74dcec6ca78c10acfb96f4f93f2b59be47ec19d6` |
| before-fonts | 5858 | 6206 | 39 | `4356e3b56659121dd60d118a55c254d621683d4b3630f6451ec59681fc2e3c16` |
| after-fonts | 5993 | 6380 | 40 | `a89ecf01620332ee20cf0f8f42d455a560c077152d3fbf7c680e3e4c7b17d8b0` |
| before-save | 12275 | 12702 | 38 | `5d13d47564f5b976bdade66eab1ac1909046409bfa6a0b78cd10d6dee54225a3` |
| render-exit | 12411 | 12876 | 140 | `ac5ff43bfc8f3ecf5c65809649caa6bc874b07c255c975a766eeacbeb6b39d66` |

### apps/worker/src/jobs/diagnostics/testing/readDiagnosticPdfText.ts

- Original and reconstructed: `247d1c3367983a5bb6bc406d8cf9a530b5d53e662060303bf4367e3b56e2d083`.
- Declared inserted output: `aca578df7339695b6e020a1d46a9db2b163b7853e6f9d90b01ff7d505be9b4c8`.

| Insertion | Original offset | Output offset | Length | Inserted SHA-256 |
|---|---:|---:|---:|---|
| runtime-import | 0 | 0 | 266 | `0e42d5152159e88d7a540138bb742e4778722e3b3121e05239793baf206bb971` |
| parser-enter | 337 | 603 | 79 | `7a7922180f56e449f467a9a7b203d40ed28714c0376aa0a93fd2ed9549bb36ef` |
| page-fonts | 444 | 789 | 44 | `3ea4e29170e5d62cc0a4188bbebd25e74c1528c025ba5856c060766e75cc1acb` |
| page-content | 1684 | 2073 | 42 | `5aa9e8a87db801b91b51bbcf28ff01f789e4318f18775be9f0517b8045eb9c11` |
| parser-exit | 2814 | 3245 | 140 | `ac5ff43bfc8f3ecf5c65809649caa6bc874b07c255c975a766eeacbeb6b39d66` |

### apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts

- Original and reconstructed: `1eb1f632eb592d16073d78eaff36c4ccefa04878e08e66412aad75635daad102`.
- Declared inserted output: `742bacab83bcdd13dac4fd244e2cdf2ffa49d70b559d73bc3720b434a7372e68`.

| Insertion | Original offset | Output offset | Length | Inserted SHA-256 |
|---|---:|---:|---:|---|
| runtime-import | 0 | 0 | 266 | `0e42d5152159e88d7a540138bb742e4778722e3b3121e05239793baf206bb971` |
| current-enter | 2107 | 2373 | 83 | `cfbb5954a9f05348ec71ceac1479bc62451bbadbe0867c2b87a439b169457ea4` |
| current-exit | 3006 | 3355 | 140 | `ac5ff43bfc8f3ecf5c65809649caa6bc874b07c255c975a766eeacbeb6b39d66` |
| cleanup-enter | 19399 | 19888 | 83 | `994133bd350bed60906cb0eeeb62584b221884e1010ff5d13c0fc3bf92dba2cd` |
| cleanup-exit | 26079 | 26651 | 140 | `ac5ff43bfc8f3ecf5c65809649caa6bc874b07c255c975a766eeacbeb6b39d66` |
