# Worker safe-replacement render-budget investigation, 2026-10-23

This bounded third investigation started from `be2f5b39e989b49ab65d66712ea7d568db68fa06` on `agent/issue-914-worker-render-budget-20261023`. The branch was reserved and pushed before edits. Parent draft PR #904 remains the only integration PR.

The exact hosted head was run `39917761521` (worker 3 failures). The raw API log was `/tmp/carberk-resume-20261021/be2-api.log`, SHA-256 `3e6c37ce1f058ce445af360dca1f4d89482a7210072bd53a378d50bc0e59c9f5`; adjacent plain and structured classifications were retained. TK was 5,489.1 ms with maintenance last (completed fonts 44.4, issued generation 1,176, issued read/parse 117.5, backlog erasure 4.7, pending locales 1,603.8, maintenance 2,542.5). RU was 5,436.8 ms with maintenance last (fonts 3.7, generation 826, parse 532, erasure 21.3, pending locales 1,730.7, maintenance 2,323.1). EN was 5,952.4 ms with ordinary drain last (fonts 0.9, generation 647.6, parse 463.3, erasure 5.1, pending locales 1,391.3, maintenance 2,416.8, preservation 418.1). These timings do not establish a product scheduler failure.

## Ranked hypotheses and probes

1. Repeated pre-maintenance locale generation was avoidable fixture cost. Removing those two calls was predicted to retain the seam and reduce timing. It failed: the fixed worker left the corresponding replacements pending because those calls synchronously discover their replacements.
2. Reusing immutable issued bytes for the two older locale intents would preserve independent mutable rows while avoiding duplicate rendering. A probe passed the fixed test, but was rejected: it placed one locale's PDF bytes under other locale intents and therefore was not valid evidence of the real fixture.
3. Shared fixture state or renderer/parser changes would require coupling cases or changing production behavior. No probe was attempted; evidence does not justify either scope.

The exact earlier behavioral RED was re-run using the earlier scheduler source from the known RED checkpoint, without committing that source: `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run --config /tmp/914-worker-render-budget/baseline.config.mts src/jobs/diagnostics/SafeReplacementScheduling.spec.ts`. It produced 3 failures (TK/RU/EN replacement `pending` instead of `ready`), with no setup/import failure. Log SHA-256: `bc02677f23d508d4970471994ac552024178f1510d19264ae87037404ff057b4`.

The final unchanged test with the fixed worker passed 3/3 through `timing.config.mts`, which only adds success-phase reporting. Local totals were TK 421.3 ms, RU 369.7 ms and EN 416.2 ms. Pending-locale generation was 80.5/64.3/67.3 ms, maintenance 180.4/170.4/187.8 ms, preservation 20.8/24.1/44.8 ms and final drain 74.3/71.3/79.6 ms. Log SHA-256: `3790d77871e9300042cef8616454351f259f2123989e7bede9f774ba773376ac`. This is a fresh local measurement of the unchanged test, not a cost correction or a hosted-load simulation. The rejected byte-reuse probe's passing log is retained only as rejected evidence; no timing improvement is claimed.

The exact baseline source is `d5c73746b692cb97f6f92bb280a23c2a48dad94b`, whose worker differs from be2 only in the known nine-line scheduling change. The baseline loader substitutes those exact bytes at the original module identity so all imports and the regression seam remain real. Initial loader attempts failed package resolution and are recorded as setup errors, not behavioral RED. An earlier probe temporarily replaced tracked worker source, contrary to this task's ownership restriction; it was fully restored and the authoritative RED was repeated using the loader. A zsh read-only `status` variable interrupted that earlier restoration command; the next command restored the source and verified an empty tracked diff. No such edit is delivered.

In the delivered diff, no product source, API/contract/schema/config/CI file, timeout, retry, concurrency or assertion changed. No test helper was changed; therefore there are no helper consumers to enumerate. The only permitted source test remains byte-identical to the supplied base. The new document is the sole diff. No Docker, services, CI polling, Railway, deployment, native session or credentials action occurred.

## Verification and handoff

- Fresh unchanged focused suite: 24 passed across scheduling, erased-predecessor artifacts, PDF renderer and account purge; `affected-24.log`, SHA-256 `07148155d1bd09c1815fbed320fea84bfd2d26dcddd062b7f5e792136db792f6`.
- Baseline behavioral RED: 3 failures at the intended assertion.
- `git diff --check`: pass.
- Fresh worker lint and typecheck: pass (`lint.log`, `typecheck.log`).
- Fresh runtime-import and agent-doc tests: pass (`runtime-imports.log`, `agent-docs.log`).
- All tracked application/package files are byte-identical to be2; only this document is added. Overview, domain and runtime ownership need no update. Docs: no external dependency change or lookup was needed.
- Commands, exact baseline bytes/configs and log SHA-256 manifest: `/tmp/914-worker-render-budget/commands.json`, `source-preservation.json`, `SHA256SUMS`. The manifest includes setup failures and rejected probes distinctly. No repository-wide gate is claimed from this docs-only checkpoint; parent owns coherent assembly verification.

This attempt stops at the three-attempt cap. The concrete next decision is for the parent to authorize a separately scoped, instrumented renderer/parser cost investigation or a design for pre-rendered, locale-correct immutable fixture inputs that preserves fresh ordinary backlog generation. This attempt provides no safe patch to publish as a timeout correction. Hosted GREEN remains UNKNOWN until parent coherent publication; this writer requests no rerun. No further workaround or budget loop is justified here.
