# Milestone A Wayfinder ticket map — 2026-10-30

This is the dispatch contract for the fresh A coordinator. It is based on the
clean handoff checkpoint `52d901c50af1dde97ea22bda8efb1fdf21f169b1` on
`agent/release897-candidate-a-20261029`. The candidate is the internal campaign
scope only; unfinished B prototype work and analytics activation are excluded.
Analytics work in A is compatibility and safety evidence only. B, C and
C-Activation retain the founder's separate gates. Only the Program Parent may
declare A complete.

## Reconciled starting state

- Worktree is clean and the local branch matches
  `origin/agent/release897-candidate-a-20261029` at the handoff checkpoint.
- PR #904 is open/draft at `agent/spec-897-campaign` /
  `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab`.
- The PR head is an ancestor of the candidate (`git rev-list --left-right
  --count 52d901c50...origin/agent/spec-897-campaign` reports `118 0`). The
  candidate branch therefore contains the PR history plus 118 commits. A
  later fast-forward of the PR head, with the resulting URL/head/checks
  recorded, is required before publication or merge. No force push or silent
  branch rewrite is authorized.
- Already accepted evidence remains accepted: reset-cycle focused proof,
  staff/API fixes, static checks, and the fresh ordinary worker full100 run.
  Those runs are not to be repeated unless a changed dependency invalidates
  their evidence.

## Dispatch rules

- Every ticket below has one owner, one exact source base, explicit paths,
  dependencies, non-goals, commands, evidence output, and a pass/fail gate.
- Ready tickets use isolated GPT Sol 6.1 full-access worktrees. Workers may
  inspect and add ticket-local evidence, but do not edit shared contracts,
  reset shared databases, deploy, build native artifacts, assemble the
  candidate, publish/merge PR #904, or claim final acceptance. The coordinator
  owns those serialized operations.
- All source and tests are read-only for evidence tickets A-02 through A-08.
  Their only writable paths are their ticket evidence directories and `/tmp`.
  A worker that finds a source or test defect records a bounded patch proposal and
  stops; the coordinator schedules the single fix round after independent
  review. No duplicate campaign, coordinator, native full100, broad timing
  audit, or B/analytics work may be started.

## Tickets

### A-01 — Independent Standards review

- **Owner:** delegated Sol 6.1 review worker; coordinator records disposition.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- **Allowed paths:** read-only source/tests/docs, no file writes. The
  coordinator records the returned report in
  `docs/evidence/issue-897/a-01-standards-spec-review-20261030.md`.
- **Depends on:** none; must complete before A-09 and before final CI/release.
- **Non-goals:** no source edits, no B prototype or analytics review, no
  re-running accepted evidence.
- **Verification:** inspect the candidate against `docs/agents/coding-standards.md`,
  `docs/agents/domain.md`, `AGENTS.md`, the issue-897 acceptance matrix and
  owning specs; run targeted static commands only if needed to substantiate a
  finding.
- **Evidence:** review markdown with file/line findings, Standards/Spec
  disposition, and a bounded-fix decision.
- **Gate:** FAIL/open while any blocking finding is unresolved. Accepting a
  bounded fix list does not pass review. The coordinator records every
  disposition, completed fix and affected verification. A material scope or
  architecture change returns to independent review. A-11 supplies the separate
  Spec context.

### A-02 — Restricted worker capacity, rollback, and race matrix

- **Owner:** delegated Sol 6.1 worker; coordinator serializes DB reset/setup.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- **Allowed paths:** `apps/worker/src/jobs/diagnostics/**`,
  `apps/worker/test/**`, and ticket-local evidence under
  `docs/evidence/issue-897/a-02-worker-restricted-20261030/`.
- **Depends on:** A-01 review is not required to start; uses the accepted
  worker budget and fresh migration pin already assembled.
- **Non-goals:** no ordinary full100 rerun, no width/timeout redesign, no
  production SLO claim, no changes to API or DB contracts.
- **Verification:** run the existing restricted ownership/erasure, capacity,
  rollback, and both-order race harnesses on the exact candidate migration
  chain; use the repository's worker Vitest/e2e commands and preserve command
  output, rollback state, and fixture cleanup.
- **Evidence:** JSON/markdown receipt naming the candidate SHA, migration
  manifest, actors/roles, orderings, outcomes, and cleanup proof.
- **Gate:** PASS when restricted-role erasure is private and complete,
  capacity refusal is bounded, rollback leaves no partial ownership, and both
  race orders converge without duplicate delivery or leaked data; FAIL on
  skipped/ambiguous cases or dirty fixture state.

### A-03 — Caller, namespace, privacy, and erasure matrices

- **Owner:** delegated Sol 6.1 API/worker evidence worker.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- **Allowed paths:** source/tests read-only across API callers, campaign
  namespace admission, source cleanup, worker erasure and service callers;
  write only
  `docs/evidence/issue-897/a-03-caller-privacy-matrix-20261030/`.
- **Depends on:** A-02 for worker erasure outcomes; A-01 may later disposition
  findings.
- **Non-goals:** no API contract changes, no new permissions, no public
  analytics/measurement activation, no broad service purge.
- **Verification:** run selected existing diagnostics e2e suites covering
  caller identity, namespace isolation, private/public readers, consumed-link
  erasure, predecessor erasure, and adversarial cross-order access. Compare
  outcomes to `docs/prd/features/50-reports-tier.md` and the diagnostics
  overview.
  Reclassify the original R7c namespace, R8 admission/private/erasure, R4 source
  cleanup and R6a service caller assertions from current source and historical
  receipts before selecting suites. Preserve their required assertions and
  unpassed dispositions; do not equate diagnostics-only coverage with this
  cross-context gate.
- **Evidence:** matrix receipt with each caller/namespace/role, expected
  disclosure, observed response, erasure result, and exact command.
- **Gate:** PASS only if every required cell is green and private bytes/IDs
  remain inaccessible across namespaces; FAIL on any unauthorized read,
  identity leak, or untested required cell.

### A-04 — Lawful reset lifecycle proof and hosted plan

- **Owner:** delegated Sol 6.1 reset evidence worker; coordinator owns actual
  shared reset, deployment and restoration operations.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- **Allowed paths:** `packages/db/tests/operational-reset-rows.e2e.spec.ts`,
  `scripts/staging-campaign.mjs`, `scripts/staging*.mjs` (read-only unless a
  bounded fix is explicitly dispatched), and
  `docs/evidence/issue-897/a-04-reset-runtime-20261030/`.
- **Depends on:** existing reset guard/cycle evidence; A-01 for any fix
  disposition. Hosted proof follows A-02/A-03 and is serialized by the
  coordinator.
- **Non-goals:** no generic wipe, guard bypass, new migration family, or
  destruction of shared staging without a recorded reservation.
- **Verification:** prove obsolete campaign `cf`, executor negative/failure/
  expiry/commit-without-finish, provider exclusion, storage drain, authoritative
  grant/clock horizon, controller handoff, restoration, and clean-reset
  behavior using the repository reset-control and focused DB commands; record
  RED-first preservation and post-run cleanup.
- **Evidence:** isolated reset lifecycle receipt and exact hosted execution
  plan with migration hash, state snapshots and cleanup. A-07 records actual
  hosted restoration; A-04 does not claim it.
- **Gate:** PASS when all refusal/rollback/expiry paths preserve state, lawful
  disposal drains only the reserved namespace, and the isolated fixture is restored;
  FAIL on destructive ambiguity, missing negative proof, or un-restored state.

### A-05 — Staff continuity protected/native journey acceptance

- **Owner:** delegated Sol 6.1 staff acceptance worker; coordinator owns device
  and protected runtime sessions.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- **Allowed paths:** `apps/admin/src/app/diagnostics/**`,
  `apps/admin/src/app/(admin)/services/**`, `apps/mobile/src/diagnostics/**`,
  `apps/mobile/src/services/**`, and ticket-local evidence under
  `docs/evidence/issue-897/a-05-staff-journey-20261030/`.
- **Depends on:** accepted staff rendered/source fixes; A-03 privacy matrix;
  hosted/protected runtime is coordinator-serialized.
- **Non-goals:** no redesign, copy expansion beyond required EN/RU/TK review,
  no B prototype screens, no analytics activation.
- **Verification:** run focused admin/mobile tests and review rendered light,
  dark, focus, and zoom states; execute protected multi-actor/runtime/race
  journey for capture, comparison, issue, and B-consume continuity with EN/RU/
  TK copy review.
- **Evidence:** rendered/native screenshots or recordings, locale/copy matrix,
  protected-runtime trace, and test receipt.
- **Gate:** PASS when the selected journey is usable in all three locales,
  protected actors see only their authorized evidence, retries/races converge,
  and no bounded rendered defect remains; FAIL on any leak, broken state, or
  missing locale/runtime proof.

### A-06 — Combined candidate CI and static gate

- **Owner:** delegated Sol 6.1 verification worker prepares the command bundle;
  coordinator runs the exact combined CI on the assembled tree.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1` (updated to the post-fix
  assembly SHA if A-09 changes source).
- **Allowed paths:** repository configuration and package scripts read-only;
  write only `docs/evidence/issue-897/a-06-combined-ci-20261030/`.
- **Depends on:** A-01/A-11 dispositions, A-02, A-03, isolated A-04,
  local A-05 evidence and any A-09 fix. Hosted/native A-05 proof is scheduled
  in A-07/A-08, so it does not create a CI/deployment dependency cycle.
- **Non-goals:** no workflow relaxation, skipped required lane, or unrelated
  dependency update.
- **Verification:** run configured root checks and applicable API/worker/DB/
  admin/mobile/web static, type, lint, build, runtime-import, glossary and
  focused test lanes once on one coherent SHA; retain CI URLs and exit codes.
- **Evidence:** machine-readable command receipt and CI/check summary tied to
  the exact candidate SHA.
- **Gate:** PASS only when every required configured lane is green or an
  explicit repository skip is recorded with reason; FAIL on any unclassified
  failure or changed-SHA result.

### A-07 — Railway deployed acceptance and restoration preparation

- **Owner:** delegated Sol 6.1 runbook worker prepares a reversible checklist;
  coordinator performs Railway mutation, acceptance, and restoration.
- **Base:** current assembled SHA (`52d901c50af1dde97ea22bda8efb1fdf21f169b1`,
  or the A-09 post-fix SHA).
- **Allowed paths:** `railway/**`, `scripts/staging*.mjs`, deployment runbook
  docs read-only, and `docs/evidence/issue-897/a-07-railway-20261030/`.
- **Depends on:** A-04 reset proof, A-05 staff journey, A-06 combined CI,
  shared-staging reservation and existing CLI sessions.
- **Non-goals:** no production promotion, no permanent config/secret change,
  no analytics activation, no unqualified hosted claim.
- **Verification:** inspect desired/runtime config, prepare exact deploy and
  rollback commands, then coordinator runs the protected acceptance journey,
  reset/restoration, health/readiness, and post-restore checks under the
  deployment runbook.
- **Evidence:** reservation, deploy SHA, service/runtime versions, acceptance
  trace, restoration receipt, and final health snapshot.
- **Gate:** PASS when deployed behavior matches the candidate and the staging
  reservation is fully restored; FAIL on drift, missing protected evidence, or
  incomplete restoration.

### A-08 — Exact installable APK/AAB artifact evidence

- **Owner:** delegated Sol 6.1 artifact worker prepares Expo/EAS metadata and
  reproducibility checks; coordinator serializes native builds and artifact
  generation.
- **Base:** current assembled SHA after A-09 (initially `52d901c50af1dde97ea22bda8efb1fdf21f169b1`).
- **Allowed paths:** `apps/mobile/eas.json`, `apps/mobile/app.json`, mobile
  build scripts/config read-only, and
  `docs/evidence/issue-897/a-08-artifacts-20261030/`.
- **Depends on:** A-05, A-06, A-07 and authenticated EAS/build sessions.
- **Non-goals:** no store submission, no signing-key rotation, no iOS export
  claim, no unrelated mobile dependency changes.
- **Verification:** coordinator builds the exact candidate installable staging
  APK and signed production AAB; verify package/version/backend mapping,
  SHA-256 hashes, signing metadata, emulator/device launch, and required
  deployed journey.
- **Evidence:** APK/AAB files, hashes, build logs, EAS/build IDs, package and
  version mapping, and device acceptance receipt.
- **Gate:** PASS only when both exact artifacts are installable/verifiable and
  tied to the accepted candidate SHA; FAIL on mismatch, unsigned output, or
  missing launch/deployed proof.

### A-09 — One bounded fix round after independent review (conditional)

- **Owner:** delegated Sol 6.1 implementation worker; coordinator assembles and
  reruns affected checks.
- **Base:** the exact assembled review source,
  `6a902544f6135273b19c6bc46e37813034fe68fa`. Its post-review changes are
  evidence-only and have source/config equality to the reviewed
  `69948805f6f41f199634300ba2fbaf8c38630be1` state.
- **Allowed paths:** A-01 Standards S1 names exactly
  `apps/admin/src/app/diagnostics/DiagnosticIdentity.tsx`,
  `apps/admin/src/app/diagnostics/DiagnosticContinuity.tsx`, and
  `apps/admin/src/app/(admin)/services/UploadRightsForm.tsx`, plus their
  affected component tests and `docs/evidence/issue-897/a-09-fix-20261030/`.
  A-11 returned no source-fix finding, so it adds no source path to this
  allow-list. No path outside this combined disposition is writable.
- **Depends on:** A-01 and A-11 reports. A-02–A-05 may continue only when their paths
  are disjoint from the proposed fix.
- **Non-goals:** no opportunistic refactor, scope expansion, contract rewrite,
  B/analytics work, or second fix round without a new independent review.
- **Verification:** RED-first reproduction, focused fix tests, affected
  typecheck/lint/build/runtime checks, and a diff/path audit against the
  review finding.
- **Evidence:** patch receipt, before/after commands, affected evidence, and
  new assembly SHA.
- **Gate:** PASS when the named finding is fixed with no new scope and all
  affected checks are green; FAIL otherwise, returning to coordinator review.

### A-10 — Current-PR reconciliation, protected merge, and final acceptance

- **Owner:** coordinator (the delegated worker may prepare a read-only checklist
  in an isolated worktree; all PR mutation, merge, and final acceptance remain
  serialized here).
- **Base:** final assembled SHA after A-09 and A-06.
- **Allowed paths:** Git refs/PR metadata and
  `docs/evidence/issue-897/a-10-release-20261030/`; no source edits.
- **Depends on:** A-01 through A-09 PASS, linked PR #904, green checks on the
  exact head, qualified hosted/native evidence, and restoration complete.
- **Non-goals:** no force push, PR replacement, direct main push, production
  promotion, or store submission.
- **Verification:** fast-forward PR #904's head from its ancestor to the exact
  candidate branch while recording old/new refs; link/confirm the PR, run/check
  required CI on that head, confirm protected merge eligibility, squash-merge
  through protection, verify merged SHA and issue state, then run safe cleanup
  and restoration checks.
- **Evidence:** reconciliation receipt, PR URL/head/checks, protected merge
  receipt, merged SHA, issue/label state, and cleanup/restoration receipt.
- **Gate:** PASS only when the Program Parent accepts every A gate and the
  protected merge/restoration are verified; FAIL leaves refs and evidence
  preserved for recovery.

### A-11 — Independent Spec review

- **Owner:** fresh delegated Sol 6.1 Spec reviewer, not an implementer;
  coordinator records dispositions.
- **Base:** `52d901c50af1dde97ea22bda8efb1fdf21f169b1`; record the actual
  checkout HEAD and prove source equality before review.
- **Allowed paths:** read-only repository and governing issue evidence; no
  edits, formatting, commits or pushes. Coordinator writes
  `docs/evidence/issue-897/a-11-spec-review-20261030.md`.
- **Depends on:** map recorded; available slot after A-01. It is the independent
  Spec context of the same initial review round, not a repeat of Standards.
- **Non-goals:** no B product implementation or analytics product completion,
  no accepted-work reruns and no replacement of missing runtime evidence with
  source searches.
- **Verification:** `git diff --name-status <main-base> 52d901c50` and direct
  source/test/evidence inspection for every selected A criterion. Quote the
  governing criterion for every finding. Return at most 400 words with reviewed
  SHA, actual provider/client, verdict, missing/partial criteria and blockers
  with file/line references.
- **Evidence:** returned report and coordinator-recorded dispositions.
- **Gate:** FAIL/open for missing required acceptance or incorrect behavior.
  Merge stays blocked until dispositions, completed fixes and affected evidence
  pass. Material scope or architecture changes require independent review.

## Concrete command catalog and resource gates

Commands below are selectors, not evidence of successful execution. Each run
receipt records the exact argv/env names, immutable checkout HEAD, source base,
exit code, counts, log path and cleanup. Private URLs, tokens and actor data stay
out of public evidence. A future ticket's new base is pinned before dispatch;
no symbolic final-SHA placeholder is an execution authorization.

- A-01/A-11 inspect `git diff --name-status origin/main...52d901c50` and trace
  production callers and tests. No runtime resource or timing reservation.
- A-02 runs `pnpm --filter @auto-tm/worker exec vitest run
  src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts
  --maxWorkers=1` only with the exact case manifest and
  `DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_ACCEPTANCE=1`. Each of `later-failure`,
  `shared-multiple`, `oldest-capacity`, `overlimit`,
  `worker-first-second-worker`, `second-worker-first-worker`,
  `worker-first-capture`, `capture-first-worker`, `worker-first-proof-use` and
  `proof-use-first-worker` has its own
  `DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_CASE` selector and distinct ordinary task
  DB. Restricted erasure selectors are
  `src/jobs/diagnostics/DiagnosticWorkerPreparation.e2e.spec.ts` and
  `src/jobs/diagnostics/DiagnosticIdentityRetention.e2e.spec.ts`; the worker
  records the exact enabled scenario env before any run. The accepted ordinary
  expiry suite is excluded. A-02 owns the next exclusive CPU/timing slot;
  setup/reset and host-heavy execution await a concrete resource manifest.
- A-03 candidates are `pnpm --filter @auto-tm/db exec vitest run
  tests/campaign-preparation.e2e.spec.ts tests/diagnostic-intake-effects.e2e.spec.ts
  tests/diagnostic-purge-effects.e2e.spec.ts tests/service-history-callers.e2e.spec.ts
  --maxWorkers=1` and selected API diagnostic presentation suites. The worker
  maps old assertions to current source and lists exact suite/test-name
  selectors before the coordinator authorizes a serialized heavy run.
- A-04 lightweight commands are `node --test
  scripts/staging-clean-reset-remote.test.mjs
  scripts/staging-clean-reset-storage.test.mjs scripts/staging-quiescence.test.mjs
  scripts/staging-campaign.test.mjs`. The selected
  `pnpm --filter @auto-tm/db exec vitest run
  tests/operational-reset-rows.e2e.spec.ts --maxWorkers=1 --testNamePattern
  '<remaining-case-selector>'` is queued after A-02 and requires a concrete
  selector/resource manifest. Accepted cycle/guard cases are not re-executed.
- A-05 local selectors are `pnpm --filter @auto-tm/admin exec vitest run
  src/app/diagnostics/DiagnosticContinuity.transport.spec.tsx
  src/app/diagnostics/DiagnosticWorkspace.spec.tsx
  src/app/diagnostics/DiagnosticWorkspace.transport.spec.tsx` and selected
  `apps/mobile/src/diagnostics` / `src/services` suites, recorded before the
  run. No device/browser/hosted resource is claimed by the worker.
- A-06 follows configured CI commands: `pnpm check:glossary`,
  `pnpm test:ci-lane`, `pnpm lint`, `pnpm typecheck`,
  `pnpm --filter @auto-tm/admin verify:runtime`, `pnpm test:api`,
  `pnpm test:db`, `pnpm test:frontend`, `pnpm test:root`, and the API image
  runtime workflow. TS6 counterparts use
  `pnpm --filter <affected-package> exec tsc6 --noEmit`; TS7 uses the package
  `typecheck` script. Hosted CI supplies disposable container evidence.
- A-07 first reads `pnpm staging:control help`,
  `pnpm staging:control discover` and `pnpm staging:control inspect`.
  Operational command argv must come from the reserved target's runbook and
  installed CLI help. No reservation/identity/configuration is inferred.
- A-08 preparation uses `eas config --platform android --profile staging
  --json --non-interactive` and the production counterpart. Serialized builds
  use the checked-in profiles with `eas build --platform android --profile
  staging --non-interactive` and the production counterpart after exact-SHA
  gates. Coordinator verifies `shasum -a 256 <APK> <AAB>`, Android package and
  signing metadata, and the device launch. Existing profile preflight is
  retained, not rerun as a substitute for artifacts.
- A-09's exact paths/tests are supplied only after both review reports; its
  verification includes real component/network interactions, package TS7,
  TS6, lint and affected build/runtime checks.
- A-10 uses `git ls-remote`, `gh pr view 904`, effective protected-check reads,
  and a protected squash merge only after Parent acceptance. It never bypasses
  checks, self-approves, or force-pushes.

## Dependency order

1. Record this map and commit it. Reconcile/inspect PR state without mutation.
2. Start A-01, A-02, and the read-only portion of A-04 in parallel. A-11
   follows A-01 in the freed read-only slot. Start A-03
   after A-02's worker receipt, then A-05 after A-03; reset/database and hosted
   operations remain coordinator-serialized.
3. If A-01/A-11 require bounded changes, run A-09 once, assemble, and rerun only
   affected gates.
4. Run A-06 on the coherent assembled SHA.
5. Run A-07 and A-08 serially under the coordinator, using A-06's SHA.
6. Complete A-10: reconcile PR #904, protected merge, restoration, and final
   Program Parent acceptance.
