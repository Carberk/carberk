# Support race tests and cleanup diagnostics assembly, 2026-10-21

This batch follows published candidate `abf72a0eeabfa4b02ad5101dae19fb67c30a76f1`, tree `32e8206cc9d67f2f913bd4f2da17851d1837407f`. Main remains `9fde309c3da17f2661fe9c266504e6e56a1b97c9`, already included. The batch changes tests and evidence only. Its hosted outcomes are UNKNOWN until the new candidate runs; the [abf72a0e failure receipt](checkpoint-abf72a0e-20261021.md) remains the latest executed evidence.

## Assembly and provenance

- Planning `c7eb6f82` bounds the next Support worker proofs. Writer checkpoint `b5938034` was incorporated with `-x` as `e61fd981`: independent same-candidate due namespaces, selected-worker/ordinary-reopen ordering, and selected-worker/reset ordering with tombstone authority and zero storage requests. The [test handoff](../issue-901/full-v3-support-owned-worker-race-tests-20261021.md) records barriers, literal accounting and limits.
- Diagnostic checkpoints `b2443cb5` and `16d8b36d` were incorporated with `-x` as `26c8ace7` and `a488d9bb`. Final exact lifecycle-message coverage `1a08b167906efc284243fd5c7119807cb3c37671`, based on `a488d9bb`, was inspected and incorporated with `-x` as `d789d945`. Both diagnostic tasks are terminal, with no pending children or questions.
- Diagnostics emit only bounded, fixed allowlisted error classes/codes/messages, failed issuance categories and aggregate loopback OTP counts. They run before the existing failure assertions, which remain intact. The [diagnostic handoff](../issue-901/full-v3-support-cleanup-diagnostics-20261021.md) records the privacy boundary. No product source, timeout, concurrency, signal or campaign cap changed.
- Root evidence `5a03eb41` records the hosted failure classification. `ec33f8c1` reconciles the acceptance matrix with source already incorporated; it marks no acceptance criterion complete.

## Verification and limits

The held test and initial diagnostic assembly passed root API TypeScript, owning-workspace focused lint, embedded worker/reset syntax, documentation and whitespace checks. The final allowlist writer reports API TS7/TS6, lint, static collection, embedded syntax and byte-preservation checks passing; no runtime services were used.

After incorporating the final checkpoint, root verified that removing its six added message literals leaves the spec byte-identical to `ec33f8c1`. AST comparison against `abf72a0e` preserves all 1,068 original assertion-call nodes and all 29 original plain case declarations in order. The result has 1,165 assertion nodes and 32 plain cases plus the unchanged two-value media parameterization: 34 intended cases, not 34 observed passes. Embedded worker/reset syntax, agent-documentation checks and diff whitespace checks pass. Broader unchanged checks were not repeated.

The latest hosted result remains RED. Support purge committed before cleanup failed; its original cleanup error and the exact reset refusal are still hidden. Media OTP-budget contamination is strongly supported, not confirmed. The diagnostic reinspection route remains an independent 404. The new candidate must expose the original failure before a bounded source repair is selected. No manual CI rerun, polling, local Docker, staging mutation, provider action or speculative product repair was performed for this batch.

Final independent Standards/Spec review, full graph/refusal/race/capacity coverage, browser/native/deployed/ops acceptance, latest-main staging restoration, exact signed Android artifact and matching disclosures remain incomplete. Operational v3 entry remains closed. This checkpoint grants no merge, promotion, spending, invitation or store-submission authority.
