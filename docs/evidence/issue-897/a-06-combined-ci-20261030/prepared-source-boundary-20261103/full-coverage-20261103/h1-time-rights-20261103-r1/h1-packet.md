# Issue 939 H1: lawful case clocks and rights (offline source checkpoint)

Release: [6609661944](https://github.com/Carberk/carberk/issues/939#issuecomment-6609661944), [6610869517](https://github.com/Carberk/carberk/issues/939#issuecomment-6610869517). Slot: 2026-11-03T17:30Z–19:15Z. Same executor, worktree and branch `t3/2d375913`. Settings: claudeAgent/claude-opus-5-5, effort high, fastMode false, full-access.

- Source base: `d131c6003e6f…`. Evidence base: `17e20ae68730…`. The prior slot-exhaustion handoff is preserved; its sha256 is `850d15feb2a7…`. Coordinator comment 6610869517 writes it as `850d15fe02a7…`, which differs in one character.
- Source checkpoint: `2225819a878e055f73fc34738a8403cc71fa4d32` (tree `bd2415772683f7ca53cb47fe3404d79e73e6737f`).
- Changed paths: the helper, `DiagnosticContinuityHandoff.e2e.spec.ts` and `DiagnosticScopedDiscovery.e2e.spec.ts`. All three are on the five-path allow-list. Capture and Readers e2e are unchanged.

## What changed

The helper gains these explicit inputs; stage-1 defaults are unchanged:
- A forward-only case clock: `clock`, `at`, `advance`.
- Per-visit provenance and evidence rights deadlines (`MaterialRights`).
- A `reviewer-first` qualification bootstrap order, giving the ordinary 2-hour deadlines a reviewer-earliest order.
- Expiry helpers that move the clock to a persisted deadline: `expireReviewerQualification`, `expireVisitRights`, `expireProofRights`. Each first checks that the persisted deadline equals the declared one.
- Fixture-ordered predecessor report ids: `orderedId("predecessor", n)` stands in for the original `id(4000+n)`.
- `candidate()` and `predecessor()` visit builders.
- A second ordinary Session.
- Lawful proof invalidation through an issuer display-name change. The users trigger `diagnostic_continuity_source_changed` does the invalidation, and the helper asserts it happened.
- `assign` with an explicit capability.

The ten replacement cases keep their original names one-for-one: Handoff covers F11, F16, F17, F20, F27 and F33; Discovery covers F39, F44, F46 and P06. They contain no placeholders, skips or row rewrites. Session expiry is never used or substituted. F20 uses the coordinator-accepted coincidence: proof rights end at the earliest bound material deadline. Audit counts are scoped to the case's A/B orders as the isolation equivalent.

## Verification and accounting

- The five serial checks (API typecheck, tsc6, lint, build, `git diff --check`) ran against `2225819a` and each exited 0: `checks/offline-command-receipts.json`.
- `h1-case-map-and-audit.json` holds the ten-ID map with original/target selector lines and assertion pairs. It also records the allow-list, the unchanged production/migration/config/dependency/workflow paths, stage-1 e2e bytes preserved apart from the import line, the nine original suites plus `DiagnosticMemoryDatabase`, and 2359 prior evidence files, all equal.
- Of the 56 original cases: 5 stage 1 + 10 H1 = 15 have one-for-one e2e replacements. 41 are held: 18 stop-dependency and 23 representable but unimplemented. There are 2 extra controls, giving 17 e2e declarations. The 168 companion cases are unchanged. The 224 original selection is unchanged and still includes the memory refusal. The full 224 replacement is **not** executable.

## Runtime risks, not yet measured

- F39 builds 44 visits, and F44/F46 build 22 each, all under the unchanged 120 s `testTimeout`.
- Two lawful routes have not yet run against PostgreSQL: reviewer-assignment revocation on finalized predecessors (F39) and repeated direct issuance for one pair (F27).
- The cache-control header and 403 message on error responses pass through `GlobalErrorFilter`.

No tests, database, Redis, MinIO, runtime, review, install or PR action was taken. This is not a #939, #938 or Milestone A PASS.
