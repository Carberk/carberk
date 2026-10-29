# Worker ownership-expiry verification budget: focused contract review r1

Read-only. Pins: candidate `c1e909adf94f9833798821aca8f386a321b5c730`, base `21994d876ecc58427141598875a808697bd0c721`. Source pins `65024d5271cd7f5fda8e921e34fca9f9a957b089` and `aa5eed1d7b597bf75ed06397adce42e37e2532f0`. Not the whole-A Standards/Spec round, not acceptance. No native tests, services or edits.

## Verdict

**APPROVE the exact correction, with no blockers.** Native acceptance remains unproved and unauthorized by this review.

## Does it lawfully replace only a coordinator/Vitest default?

Yes.

- `apps/worker/vitest.config.mts` sets no `testTimeout`, so the 5000 ms is Vitest's unset default. The config is unchanged by the candidate.
- The only `5000` in the spec was the sampler cutoff, added by `169fa9743` ("Bound ownership statement observation to original five seconds"). The receipt cites it as `0c2a8fd50`; the hash differs but the subject and content match. The spec has no elapsed assertion and no explicit timeout at `aa5eed1d`.
- I searched ADR-0104, ADR-0109, Feature 50, Flow 66 and `apps/worker/CONTEXT.md` independently. None gives an ownership-expiry time bound. They give the "no blanket TTL" and declared-rights-end retention rules, which the diff does not touch.
- The "5 s" criterion appears only in coordinator artifacts (the batching review and RED diagnosis). That is the coordinator's own promotion of the default.

So it is not product behavior and not an accepted budget from a product source. It is a coordinator-carried default, and the founder's latest authority covers correcting it through review.

## Is 60 s justified and finite? Do retention and use requirements stay intact?

- **Finite.** `it(..., budgetMs)` gives a hard per-test bound, and a hang still fails. The sampler stops at the same value and `clearInterval` is still called on the success and failure paths (spec lines 152, 197, 202).
- **Justified.** The clean full-100 projection is about 12 to 14 s including the refused phase. Worst observed contention is 2.1×, about 30 s. 60 s is twice that. It was chosen before any fresh acceptance attempt. `ServiceLifecycle.e2e.spec.ts` already uses 60000 (lines 88, 158 and 200), so the precedent is real.
- **Package-wide setting avoided.** The correction is per test, not a `testTimeout` change, so other specs keep their defaults.
- **Requirements unchanged.** The diff touches nothing in the retention or use logic.

## Assertions and source byte-preservation

- `git diff 21994d876 c1e909adf` on the spec has exactly three hunks: the constant plus comment, the sampler cutoff, and the `it` timeout argument. Every assertion, the refused-then-accepted single test, the 100 grants and `cleanup()` are byte-unchanged. The spec at `aa5eed1d` is byte-identical to the base.
- `git diff --name-only 65024d52 21994d876 -- apps/worker` lists only `DiagnosticPdfRenderer.ts` and `DiagnosticPdfRenderer.spec.ts`. These are B5 renderer files and are not in the nine-file ownership payload. The candidate then adds only the one spec. The ownership source and the memory adapter are identical to `65024d52`.
- `vitest.config.mts` and `package.json` are unchanged, and so are the renderer files. `DiagnosticPdfRenderer.spec.ts` already carries its own explicit 60_000 on one test and is untouched.

## Nonblocking nits

1. The decision doc cites the founder's "recovery instruction" without a durable pointer or quote. The receipt itself says its founder search was incomplete. The next evidence update should anchor the authority text.
2. The receipt's commit pin `0c2a8fd50` differs from the branch's `169fa9743` for the same sampler change.
3. The sampler now runs for up to 60 s at 50 ms intervals instead of 5 s. It adds a little load and a larger `statement-observations.json`. Both are diagnostic only and bounded.
4. `beforeAll` and `afterAll` keep Vitest's default hook timeouts, which this correction does not change.
5. The comment "sized from worker-width-decision-20261029" is accurate but relies on a projection.

## Exact evidence gaps

- The 60 s figure rests on measured per-entry cost multiplied out, not on an observed full pass. The receipt says so. It is not acceptance evidence.
- No fresh native full-100 run exists yet on this assembled candidate.
- The restricted-role capacity, rollback and race cases (ten extended cases) are unprovisioned and unrun.
- The shared-staging and CI timing difference is unknown (default Postgres on a shared Docker VM).
- The historical native 5 s RED with partial ownership7 stays excluded, as stated.
- The assembled Standards/Spec round, CI and deployed acceptance remain separate gates.
