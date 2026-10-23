# Worker safe-replacement render-budget investigation, 2026-10-23

This bounded third investigation started from `be2f5b39e989b49ab65d66712ea7d568db68fa06` on `agent/issue-914-worker-render-budget-20261023`. The branch was reserved and pushed before edits. Parent draft PR #904 remains the only integration PR.

The exact hosted head was run `39917761521` (worker 3 failures). The raw API log was `/tmp/carberk-resume-20261021/be2-api.log`, SHA-256 `3e6c37ce1f058ce445af360dca1f4d89482a7210072bd53a378d50bc0e59c9f5`; adjacent plain and structured classifications were retained. TK was 5,489.1 ms with maintenance last (completed fonts 44.4, issued generation 1,176, issued read/parse 117.5, backlog erasure 4.7, pending locales 1,603.8, maintenance 2,542.5). RU was 5,436.8 ms with maintenance last (fonts 3.7, generation 826, parse 532, erasure 21.3, pending locales 1,730.7, maintenance 2,323.1). EN was 5,952.4 ms with ordinary drain last (fonts 0.9, generation 647.6, parse 463.3, erasure 5.1, pending locales 1,391.3, maintenance 2,416.8, preservation 418.1). These timings do not establish a product scheduler failure.

## Ranked hypotheses and probes

1. Repeated pre-maintenance locale generation was avoidable fixture cost. Removing those two calls was predicted to retain the seam and reduce timing. It failed: the fixed worker left the corresponding replacements pending because those calls synchronously discover their replacements.
2. Reusing immutable issued bytes for the two older locale intents would preserve independent mutable rows while avoiding duplicate rendering. A probe passed the fixed test, but was rejected: it placed one locale's PDF bytes under other locale intents and therefore was not valid evidence of the real fixture.
3. Shared fixture state or renderer/parser changes would require coupling cases or changing production behavior. No probe was attempted; evidence does not justify either scope.

The exact earlier behavioral RED was re-run using the earlier scheduler source from the known RED checkpoint, without committing that source: `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run --config /tmp/914-worker-render-budget/baseline.config.mts src/jobs/diagnostics/SafeReplacementScheduling.spec.ts`. It produced 3 failures (TK/RU/EN replacement `pending` instead of `ready`), with no setup/import failure. Log SHA-256: ``.

The fixed source was restored before verification. The fixed focused test passed 3/3: `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/SafeReplacementScheduling.spec.ts`; log SHA-256 `c99f230c59a18304da180596f106f28b50553bcde51076701c3c24a6981f2e43`. The original phase receipt remains the valid cost comparison: local `pending-locales` 82.6/66.8/66.0 ms and maintenance 184.4/166.4/176.0 ms on RED; the rejected probe measured 0 ms pending-locales but was invalid as described above. Hosted load remains materially different and no hosted GREEN is claimed.

No product source, API/contract/schema/config/CI file, timeout, retry, concurrency or assertion changed. No test helper was changed; therefore there are no helper consumers to enumerate. The only permitted source test remains byte-identical to the supplied base. The new document is the sole diff. No Docker, services, CI polling, Railway, deployment, native session or credentials action occurred.

## Verification and handoff

- Focused safe-replacement worker test: 3 passed.
- Baseline behavioral RED: 3 failures at the intended assertion.
- `git diff --check`: pass.
- Full worker lint/typecheck and the 24-test affected suite are inherited from the prior fixed checkpoint and remain applicable; no implementation changed in this attempt.

This attempt stops at the three-attempt cap. The concrete next decision is whether the parent accepts the existing renderer/test cost as hosted-load risk and gathers a fresh hosted run with the phase hook, or authorizes a separately designed fixture seam. No further workaround or budget loop is justified here.
