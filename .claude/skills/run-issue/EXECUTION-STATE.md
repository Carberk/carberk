# Durable execution state

Git and GitHub are the recovery record for every implementation issue. Chat history may provide context, but another supported coding agent must be able to continue without it.

## Reservation and first checkpoint

1. Create `agent/issue-<N>` from updated `main` and push it before editing. The remote branch is the issue reservation. A stacked issue under [run-queue](../run-queue/SKILL.md#stacking) branches from its parent's branch head instead.
2. Commit and push after the first meaningful checkpoint, then open a draft pull request. The body starts with `Closes #<N>` and contains exactly one mutable `Execution state` section.
3. Update that section after every checkpoint, verification result, review verdict, failure, or handoff. Do not append competing state summaries.
4. Never query Codex, Claude, or another provider for remaining quota before starting. Checkpoints make an unexpected stop recoverable.

Use this shape:

```markdown
## Execution state

- **Status:** implementing | verifying | reviewing | ready-to-merge | blocked
- **Stacked on:** `<parent PR and parent head SHA, or none>`
- **Last checkpoint:** `<commit SHA>`
- **Completed acceptance criteria:** `<issue checkbox references or concise list>`
- **Acceptance evidence:** `<criterion, red checkpoint/run, green run, or exemption; UI state/spec/screenshot links>`
- **Verification:** `<command and pass/fail/unknown result>`
- **Current failure:** `<root cause or none>`
- **Interrupted commands:** `<command and last known state or none>`
- **Documentation:** `<CONTEXT/ADR/PRD status>`
- **Docs:** `<not needed — package@version published date, before cutoff; official URLs and what each verified; or not applicable>`
- **Reviews:** `Standards <verdict/SHA>; Spec <verdict/SHA>; each finding fixed in <sha>, deferred to <issue>, or rejected: <reason>; or none`
- **Next action:** `<one concrete action>`
```

Silence, a stopped process, and missing output are `unknown`, never `pass`.

## Checkpoint boundaries

Create a checkpoint when any of these becomes true:

- one acceptance criterion is implemented with its test or inspection evidence;
- a migration, generated contract, or current-state document changes;
- a verification phase finishes;
- a review finding is resolved;
- work is about to cross a tool, machine, or session boundary; or
- a long-running command can be safely interrupted after preserving the current result.

Checkpoint commits may be small. The final squash keeps `main` history focused.

Run focused checks for each changed behavior before its checkpoint. Record the exact result in Execution state. A checkpoint is recoverable progress, not a verified final commit. [Verification](VERIFICATION.md) owns the complete gates before final review; a later change invalidates evidence for inputs it affects.

## Acceptance evidence record

For the [acceptance-evidence procedure](VERIFICATION.md#acceptance-evidence), keep one row per criterion in the mutable PR state:

| Criterion | Red checkpoint and run | Green run | Exemption or visual evidence |
|---|---|---|---|
| `<criterion>` | `<pushed SHA, exact command, assertion/failure output>` | `<SHA, same command, result>` | `<reason and inspection proof, or state/spec/screenshot links>` |

Record the actual failure reason and preserve the red checkpoint SHA and output after the test passes. Mark unavailable or interrupted evidence `unknown`, with its next action. For docs-only work record the exemption and documentation checks; no artificial failing test is needed.

## Handoff inspection

An incoming Codex desktop, Claude Code desktop, `claude-kimi` CLI, or other supported client inspects the issue, local and remote branch heads, worktree status, draft PR body and comments, checks, running processes, and the complete diff before changing anything. It resumes the existing record instead of creating another branch, PR, or summary document. It reuses the worktree only when no other session or agent owns it; otherwise it works in its own new worktree from the pushed branch under the [host-specific lifecycle](../../../docs/agents/worktree-lifecycle.md#queue-implementer-worktrees).
