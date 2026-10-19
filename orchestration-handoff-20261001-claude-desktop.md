# AutoTM orchestration handoff, 2026-10-01 (Claude Code desktop → next session)

Supersedes `/Users/bagtyyar/.codex/worktrees/7738/auto.tm-rewrite/orchestration-handoff-20261001-codex.md`. Untracked; never commit it into an implementation PR. GitHub and pushed commits are authoritative: re-read actual state before acting.

## Authority (re-confirm with the founder in the new session)

Said by the founder in this session: full founder access; decisions and ADR acceptance in the founder's name; "you can merge things in my name"; "launch them, I give you every permission you need"; use subagents and parallelise. Railway operations only on explicitly identified PR environments in project `176ddec0-dd65-4087-b82c-798599fc2ebe`; never staging (`652abc79-fdb0-48b0-9f6c-ad0ff572d7b2`) or production (`c628b9bf-08ef-45f6-976f-3d646e0ebfbd`). Docker stays stopped.

Roles: `queue-implementer` (Sonnet 5.5, worktree isolation) writes; `queue-reviewer` (Opus 5.5) reviews Standards, Spec, Delta. The orchestrator posts verdicts, records decisions, marks ready and sets auto-squash. It never writes source.

The Claude Code auto-mode permission classifier refused some actions here (merge, `worktree:gc --apply`, a Railway deploy before the environment state was read, a few agent launches). Do not work around a refusal; ask the founder for an explicit instruction.

## Merged today

| Issue | PR | Merge commit | Verified |
|---|---|---|---|
| #369 | #470 | `5264344` | closed; PR env absent |
| #371 | #483 | `bc31bc75855cb21c871899301b18153c6685cb5d` | closed; PR env absent; main CI success at `bc31bc7` |
| #485 | #487 | `b8accf5725e5df7874a4ca01d2d0b94ea400992a` | closed. **Main CI at `b8accf5` was in progress: verify.** PR 487 env `5abeec4f-53cf-4c24-9d96-1669f9b6084a` deletion not yet verified |

`origin/main` = `b8accf5`.

## Open PRs, in the order to finish them

### PR #488, issue #481 (native PR seed guard). Head `bdf13faadd001ffca47b5f73944b28af92a763fe`, draft, hosted `pr` SUCCESS (after rerun of an unrelated Redis ECONNREFUSED flake in an API e2e suite)
Reviews: Standards pass at `9de1f64`; Spec findings at `9de1f64`; fix round `18e15c2` (red) + `bdf13fa`. All posted with decisions.

Remote proof (acceptance criterion 3), environment `auto.tm-rewrite-pr-488` = `6b6b8a0c-74ac-4e01-ae77-47ba71850b1a`, API service `6db6f1b1-5c7a-4033-88d0-53f5f315bfc0`:
- Done and captured in `/tmp/autotm-481-proof/`: `/readyz` reports `commitSha` `bdf13fa` (PR head); no-argument run exits 1 with the local-mode-removed message (`local-mode-refusal.txt`); production-name `--remote` exits 1 with no seed step (`production-name-refusal.txt`); two `--remote` runs were **correctly refused** with "Native seed requires the MinIO public endpoint of this PR" because the env inherited staging's media URL (`remote-run-1.txt`, `remote-run-2.txt`: keep these, they are good guard evidence).
- I then set the API service variable `MINIO_PUBLIC_URL=https://${{MinIO.RAILWAY_PUBLIC_DOMAIN}}` in that PR environment (docs/agents/mobile-expo.md step 4); the container now resolves host `minio-autotm-rewrite-pr-488.up.railway.app` (`media-host.txt`). The API was deployed by me with `railway redeploy --from-source` (Railway had skipped it). Worker was not deployed or changed.
- **In progress when this was written:** a background shell job was running the two successful `--remote` runs, writing `/tmp/autotm-481-proof/remote-success-1.txt` and `remote-success-2.txt`, then `readyz-after.json`. Run 1 had started at 15:58:44Z. That job dies with this session. **Check whether both files exist and end with `exit=0`; if not, rerun** (each run re-creates fixture users and listings; no other agent is using this environment):
  `railway ssh --project 176ddec0-dd65-4087-b82c-798599fc2ebe --environment 6b6b8a0c-74ac-4e01-ae77-47ba71850b1a --service 6db6f1b1-5c7a-4033-88d0-53f5f315bfc0 sh -c 'node /app/scripts/native-pr-seed.mjs --remote; echo "exit=$?"'`
  Expect step lines `Native PR seed: buckets`, `catalog`, `native fixtures`, `brand logos`, then `exit=0`. If a run fails, treat it as a finding, not a retry loop.
- Then: a fresh implementer (from `origin/agent/issue-481`) commits the proof files under `docs/evidence/issue-481/` with a README (IDs, deployed SHA, the variable change, the earlier refusals, no variable values), updates the PR body to mark criterion 3 met. Then one Delta review of `9de1f64..<final head>` covering the fix round and the proof. Then ready + auto-squash; verify closure, main CI, env deletion.
- File one follow-up issue for the native PR seed area (deferred P3s): load-order test strength; `packages/db/scripts` not typechecked; Railway API watched paths excluding `scripts/native-pr-seed.mjs` and `packages/db/scripts/**` (which is why the API had to be deployed by hand and the media URL set by hand).

### PR #489, issue #472 (price inputs, burst typing). Head `d2f586326b698c2320bb7eff862bd254d9ab947f` at last read, draft
- Rebased onto main after #483 merged. Production code unchanged: the defect did not reproduce in rendered tests or on the iOS simulator.
- Reviews posted: Standards findings at `fc42c5b` (fixed in `d52d8ee`, `154ead8`); combined Spec + Delta at `154ead8`: Delta carries Standards to pass; Spec had two P2 (criterion 2 presented as complete although the cause is not established; an unsourced "different simulator and tool" claim) and four P3, all evidence wording.
- Decision posted: criterion 2 is closed by integration decision as "cause not established"; the device risk is carried to #345 (comment posted there). Wording fixes ordered.
- **A docs-only fix implementer (`agent-a9398525c74f8404f`) was running; head `d2f5863` is probably its push. Its report was not received.** Read the PR Execution state and `git diff --stat 154ead8..origin/agent/issue-472` (must touch only `docs/evidence/issue-472/`).
- Then: Delta review of `154ead8..<head>` confirming the Spec P2s and P3s are resolved and carrying both axes; wait for hosted `pr`; ready + auto-squash.
- Follow-up to file in a mobile batch: `parseInt` then `toString` loses precision for 16+ digit price input and yields `1e+21` at 22+ digits.

### PR #490, issue #471 (mobile test shells). Head `1d79c7b9ba6ff272723c60fd0fd08f7cc4f1912b`, draft, hosted `pr` SUCCESS
- Implemented; no app code changed. Deviation: the Search parameters Condition control is a three-button segment, not a checkbox, so the rendered proof is on the model-row checkbox in the Model picker plus a shell contract spec.
- **Standards (`agent-a7782df18d7c448b6`) and Spec (`agent-a0de2a340400e32a5`) reviewers were running; no verdict received or posted.** Their results die with this session: relaunch both, pinned to the current head, and ask the Spec reviewer to rule on the criterion 1 deviation and on two new spec files that fail at load (not by assertion) at red checkpoint `b07090e`.

## After the queue
- Run `pnpm worktree:gc`, read it, then `pnpm worktree:gc:apply` (the founder may need to run apply). Not applied since #483 and #487 merged; this session's many `agent-*` worktrees are waiting on it.
- Follow-up batches to file (ADR-0065): cleanup gate P3s from PR #487 (Spec P3-S1 to S4, Delta P3-D1); native PR seed items above; mobile items above.
- #486 is `needs-triage`, not in the queue; recommended for the first release as small polish.

## First-release scope (founder agreed 2026-10-01; not yet recorded on #320: do that first)

Release map #320: reviewer-only Android on Google Play. The founder will act as the human for design sessions, decisions, device proof and Console work.

1. **Discovery journey:** #371 merged; #472 and #471 in review; #486 proposed.
2. **Screen redesigns, the critical path:** #352 Favorites and Conversations, then #353 Cabinet/Profile/Settings/sign-in, then #354 Sell wizard and My listings. Each needs a prototype session with the founder (design-grill / `prototype` skill, UI-MODE.md), then build slices. #372 (Favorites large card) is written and waits on #352.
3. **Release decisions:** #322 share destination, #328 ListingStatus mismatch, #326 Android-only proof gate. Prepare evidence and a recommendation for all three so the founder answers them in one sitting.
4. **Release candidate:** #325 manifest and permissions audit, #329 signed AAB freeze.
5. **Human-only:** #375 migrate and reseed, #279 and #282 (Android parts), #345 physical-device matrix (now includes the price-input check), #327 and #391 Play Console. #327 and #391 can start now.

Out: iOS, #262, tooling (#452, #404, #407). Proposed triage, not applied: #429 and #426 in the release; #413 and #445 deferred.

Prototype status: `prototype/release-screen-map` (#344) and `prototype/listing-content` (#351) are approved, on read-only branches, and implemented through slices #358–#374 (all closed except #372). #352, #353 and #354 have no prototype yet. View one with `git show prototype/<name>:docs/prd/ui/prototypes/<file>.prototype.html`.

Estimate given: roughly 4 to 6 weeks to submission with the redesigns in scope; the number of build slices from the three prototypes is the main unknown.

## Local state
- Docker stopped. Simulators `38747B85-BB39-48A2-BF0D-4DD6A5ED1D13` (Metro 8471) and `3A8BB230-13C9-4624-8239-395A6E887D4C` (Metro 8469) were reported shut down by their agents; verify with `xcrun simctl list devices booted`.
- Posted review and decision bodies are in `/tmp/autotm-review-*` and `/tmp/autotm-decision-*`; seed proof in `/tmp/autotm-481-proof/`. `/tmp` may be cleared.
