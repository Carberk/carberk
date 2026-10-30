# B5 executed diagnosis checkpoint, 2026-10-25

B5 remains unresolved. This checkpoint executes and validates the previously held observer, preserves the known scheduler RED, and fixes two observer integration defects. It does not contain a production performance fix or establish hosted acceptance.

Base `de80c7b572a8e2b5df832774bef751a6e299fc4f`, tree `8190e99411eadb4904c9187b2fc31555f4cdc9e5`. Branch `agent/issue-897-b5-timing-diagnosis-20261025` was reserved and pushed before edits in host-provided worktree `t3-acc63437`. PR904 remains the sole integration PR and was linked to this thread. No nested agents, other checkout writes, deployment, database service, Docker, workflow mutation or parent-branch write occurred.

Current authority is `/tmp/897-founder-autonomous-candidate-authority-20261025.md`. Historical caps and HOLD instructions in the imported preparation receipt remain history, superseded by that authority. No permission question or exhausted-cap stop was introduced. Earlier failed runs and rejected fixture shortcuts remain counted and unmodified.

## What executed

Exact commands, raw log paths, SHA-256s, runtime, source pins and all observed counter records are in [the machine receipt](b5-timing-diagnosis-20261025.json). Runtime was Node24.13.0, pnpm12.11.2, Vitest5.0.4, macOS ARM64, availableParallelism10 and the configured maxWorkers4. This differs from the hosted Ubuntu/Node22 environment. Repository globalSetup and setupFiles remained configured. Local unit runs used the configured database-off mode, with no service access.

- Actual transform invocation reconstructed every original module byte after removing only the 21 declared inserted spans. Changed bytes and alternate module identities were refused. All four original SHA-256 pins remain unchanged, with no repinning. Original config reconstruction also matched its pin.
- The real unchanged spec passed locally 3/3. Initial TK/RU/EN totals were 483.4/414.8/442.4ms. After the observer integration corrections, the same command passed 3/3 at 489.0/400.6/485.2ms. Every success had ten completed renders, four full parses, twelve page-map/content segments, 35 current checks and two cleanup scopes, no active frames and invalid=false.
- Configured `pnpm --filter @auto-tm/worker test:unit` passed 42 files, 299 tests. B5 totals were 570.3/578.8/728.4ms, with the same complete counts. This excludes e2e files and lacks simultaneous API/container work, so it is not the hosted full-suite scenario.
- The observer-specific `node --test apps/worker/test/b5-observation.check.mjs` passed 3/3. It proves actual transform reconstruction and identity refusal, original rejection identity, one failure emission, separate active/completed counts, immutability after late completion, complete success accounting and invalid incomplete-success evidence. These checks exercise observer behavior; they do not simulate B5 product success.
- An observer-only temporary test intentionally left a frame active and awaited an unresolved promise. The real Vitest default deadline failed at unchanged5000ms. The hook emitted once at5004.5ms with render-save started1/completed0/completedMs0 and one active frame. This validates actual timeout delivery without claiming that a render operation itself stalled or that B5 reproduced. Late callback freezing is proved separately by the observer checks.
- The known scheduler RED was preserved without changing tracked worker bytes. A separate temporary config removed the observer plugin and substituted current worker bytes with only its scheduling block replaced by the exact earlier FIFO block from `d5c73746b692cb97f6f92bb280a23c2a48dad94b`. Current expiry/preparation changes remained present. All three locales failed the expected pending-versus-ready assertion, not a setup error or timeout. The red worker hash is `89c8707755ba4e2e20314c81b87e2d49fa5a01fafb2e46ec1cbf322e14e23b76`. Temporary harnesses and hashes are retained under `/tmp/897-b5-diagnosis-20261025`; the production observer never accepted or silently repinned this substituted source.

## Measured boundary and next hypotheses

The original hosted run39959579692 on0ca85a62 remains the authoritative unresolved timing RED, TK5145.6ms with ordinary-drain active. Its completed checks do not establish the tail assertions. The existing local probe and these new local observations cannot assign its cause.

In the configured local unit observation, layout completed402.4/424.5/545.4ms, save103.3/91.7/125.8ms, current5.6/2.7/4.2ms and cleanup0.5/0.4/0.6ms. Layout is the largest measured local interval. It includes wrapping, shaping, drawing and diagrams. Save includes deferred font work. These wall intervals overlap the outer phases and cannot be summed with them as CPU. No overhead subtraction or infrastructure attribution is made.

Ranked predictions for representative hosted collection, before selecting any production change:

1. Layout accounts for the hosted shortfall. Predict that layout scopes dominate the timed-out observation and a CPU profile within that phase identifies a concrete repeated operation. Broad layout timing alone does not justify a width cache or renderer rewrite.
2. Deferred save/font work accounts for the additional hosted cost. Predict that save completed/active intervals grow enough to explain the shortfall while layout does not. Distinguish font subsetting from serialization before changing either.
3. Currentness, cleanup or parsing accounts for the hosted cost despite small local timings. Predict that their hosted completed or active scopes account for a substantial part of the case. Preserve every safety check and parse while testing that prediction.

No hypothesis is confirmed by these local runs. No production patch is justified yet. Required renders, all real PDF/glyph/layout/currentness checks, both same-case sweeps, due retries, FIFO/replacement assertions and the default5000ms budget are intact.

## Delivered observer corrections and disposition

Imported plugin/runtime bytes and the historical preparation receipt are exact from3510963655a90b1389e85a2e6847d6d6bbd4aec0. The first lint run failed import/order because the prepared config lacked a blank line before its local import. The first typecheck failed TS7016 because its .mjs plugin had no declaration. Added that blank line and a narrow `.d.mts` declaration returning Vite's Plugin type. Neither changes runtime instrumentation. The initial lint log remains; the initial typecheck log was overwritten by its corrected run, but its exact error remains in the tool transcript and the machine receipt explicitly records this evidence loss.

Worker lint, TypeScript7 typecheck and TypeScript6 checks now pass, as do observer checks and `pnpm check:agent-docs`. Docs: no new dependency or external API behavior; no documentation lookup needed. Existing overview ownership/constraints did not change.

Observer remains active in the checkpoint config for parent assembly and hosted collection. It must not be mistaken for a production fix or left unexamined in the final candidate. The two integration defects are fixed and runtime behavior has now been exercised. The historical preparation document's statements that runtime was unexecuted apply only to that earlier checkpoint.

The existing representative CI path is PR Checks on PR904, whose integration branch belongs to the parent assembler. It has no workflow_dispatch entry. No extra PR or CI-policy change was introduced to obtain an independent run; no hosted refusal is claimed. Parent can incorporate this pushed observer checkpoint into its next assembled candidate and use that existing authorized path. A changed pinned worker must receive explicit source comparison and observer review before collection, rather than a silent pin update.

## Acceptance checkpoint

| Criterion | Evidence | Result |
|---|---|---|
| Preserve original source,5000ms, normal concurrency and full work | Reconstruction checks, unchanged four source pins, real success counters | pass locally |
| Retain known scheduler RED | Three exact pending-versus-ready failures with scheduling-only substitution | pass |
| Preserve useful failure evidence | Actual default-timeout hook plus late-completion freeze checks | pass |
| Observer integrates with worker checks | Worker unit299/299, lint, TS7, TS6, observer3/3 | pass |
| Establish concrete hosted timing cause | Representative hosted observation not collected | blocked |
| Deliver justified performance fix | No cause established; no production patch selected | blocked |
| Final candidate acceptance | Uninstrumented exact-candidate hosted verification remains required | blocked |

This is a clean pushed diagnosis checkpoint for the parent, not B5 closure. The next dependency is representative collection on the parent's assembled candidate, followed by a measured own-path fix if supported and uninstrumented final hosted verification. No authority renewal is required within the standing candidate scope.
