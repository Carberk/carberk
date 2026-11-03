# #939 H1 independent Standards review: 323049c5

- Candidate: `323049c5c1ef310d9b40ad83ab8e29804d57c68a`, tree `4447976eca19ba3e5cdbcea155133f8568fbc682`. HEAD and tree were read back at the start and end of the review, and the worktree was clean.
- Reviewer: claudeAgent/claude-opus-5-5, effort high, fastMode false, full-access. This was a fresh, read-only review sub-agent. It made no source, package, runtime, resource, PR or issue edits.
- Recorded: 2026-11-03T18:05Z.
- Read: #939, #938 and #897 (current bodies); `docs/agents/coding-standards.md`; AGENTS.md; the diff from source base `d131c6003e6f…`; the H1 receipts; the original memory suites; and `PrismaDiagnosticContinuityProofs.ts`.

## Commands (all read-only)

`git rev-parse HEAD HEAD^{tree}`; `git diff --name-status d131c600 HEAD` (plus a non-add filter); `git diff --quiet 2225819a HEAD -- . ':(exclude)docs'`; `git diff --name-only d131c600 2225819a -- . ':(exclude)docs'`; `git diff d131c600 HEAD -- apps/`; `git diff --check d131c600 HEAD -- apps/api`; `shasum -a 256 -c sha256sums.txt` (in the H1 directory); `git diff --quiet 87456f4f HEAD -- <original memory specs>`; marker grep over the five allow-listed paths; and source reads. API typecheck, TS6, lint and build were **not** rerun. No dependencies are installed in this worktree, and install/build is outside the read-only scope. Those checks rely on the recorded receipts.

## Verified

| Check | Result |
|---|---|
| Static pins | `checks/offline-command-receipts.json`: all five commands show head `2225819a878e055f73fc34738a8403cc71fa4d32`, tree `bd2415772683f7ca53cb47fe3404d79e73e6737f`, exit 0. `git rev-parse 2225819a^{tree}` = `bd241577…`. All 14 entries in `sha256sums.txt` verify. |
| Candidate = pinned source | The non-documentation diff from `2225819a` to HEAD is empty (exit 0). |
| Allow-list | The non-documentation change from `d131c600` touches only the helper and the Handoff and Discovery e2e specs, all within the five-path list. The Capture and Readers e2e specs, production code, migrations, config, dependencies, workflows and the original memory suites are unchanged. |
| Evidence preservation | Every documentation change from base to HEAD and from HEAD^ to HEAD is an add; nothing was deleted or modified. |
| Placeholders, skips, `.only` | None in the five paths. |
| Range whitespace | `git diff --check d131c600 HEAD -- apps/api` exits 0. |
| Lawful transitions | No H1 case writes an immutable row. Invalidation goes through `PrismaUserRepository.updateDisplayName`, and the users trigger fires `diagnostic_continuity_source_changed`, as `20261024010000…/migration.sql` confirms. The second Session goes through `PrismaSessionRepository`. Expiry uses the forward-only injected clock and checks persisted deadlines. No case expires or revokes a Session. |
| Names and literals | All ten titles and their literal oracles match the originals in `DiagnosticContinuityHandoff.spec.ts` lines 128/133/134/137/179/279 and `DiagnosticScopedDiscovery.spec.ts` lines 123/134/168/195. The substitutions are the ones the map records: `orderedId` for `id(4000+n)`, B version 7, and audit counts scoped to the case's orders. |

## Findings

**S1 (Medium, blocking): F16 and F17 are observationally identical to F20, and only F20's coincidence has a recorded disposition.**
- Production pins proof `rightsUntil` to the minimum of the bound A/B material and provenance deadlines (`PrismaDiagnosticContinuityProofs.ts:258-268`).
- `admit()` rejects at `proof.rightsUntil <= now` (`:661`) before it re-derives material rights (`:672`). `admit()` is shared by the handoff listing and consume.
- So the predeclared A-provenance (F16) and B-evidence (F17) deadlines expire the proof at the same instant. Both cases stay green if the per-material A and B rights rechecks are deleted. That fails the deletion test in coding-standards.md ("still passes with the production code it covers deleted"), and it is weaker than the original memory cases, which expired only the material row and left the proof valid.
- `coordinator-disposition.json` accepts the coincidence only for `f20`. `h1-packet.md` says "F20 uses the coordinator-accepted coincidence". F16 and F17 note it only in the map's `transition` text.
- Under #939's stop rule, this needs either an explicit coordinator/Parent disposition for F16 and F17 with the packet corrected, or a lawful way to tell the cases apart. No code change is implied.

**S2 (Low, advisory): P06 has no positive control before the transition.** It never shows the reviewer has access under `reviewer-first` before `expireReviewerQualification()`, so an unrelated setup denial would also satisfy denied = missing. The original case has the same shape, and the stage-1 eligible-technicians case shows that access works in the default order.

**S3 (Low, advisory): the recorded `git diff --check` ran with no range on an already-committed checkpoint, so it proved nothing.** The range form above, run by this review, exits 0, so there is no defect.

**Info: these risks are disclosed and unmeasured.** F27 issues 22 proofs for one pair, F39 revokes a reviewer assignment on a finalized predecessor, and F39 builds 44 visits under the 120 s timeout.

## Verdict

**FAIL (Standards not passed) at `323049c5c1ef310d9b40ad83ab8e29804d57c68a` / `4447976eca19ba3e5cdbcea155133f8568fbc682`.** S1 is unresolved. All exact-SHA, pin, allow-list, preservation and marker checks pass. This is not a #939, #938 or Milestone A acceptance, and it releases no runtime.
