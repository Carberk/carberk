---
name: run-issue
description: Runs one ready AutoTM GitHub issue end to end through portable execution state, verification, fixed-commit review, pull request, squash merge, local sync, and dependent unblocking. Use when the user invokes /run-issue with an issue number or asks a supported coding client to execute one unblocked issue from the ready-for-agent queue.
argument-hint: "[issue-number]"
arguments:
  - issue
disable-model-invocation: true
---

# Run one issue

Execute exactly one issue per invocation. Under [run-queue](../run-queue/SKILL.md), each queued issue's implementer runs it in its own worktree under the host-specific lifecycle through verification, and the queue orchestrator runs review and merge ([ADR-0069](../../../docs/adr/0069-queue-implementers-run-in-host-created-worktrees.md)). Invocation authorizes the normal reservation-branch-to-merge flow; pause only at the decision boundaries below. Codex desktop, Claude Code desktop, and the `claude-kimi` CLI may implement, review, resume, or integrate under [ADR-0059](../../../docs/adr/0059-kimi-code-as-a-third-interactive-coding-agent.md). Reviewer eligibility follows [ADR-0064](../../../docs/adr/0064-any-supported-client-may-review-either-axis-and-issues-have-no-concurrency-limit.md).

## Resolve the issue

1. Follow [AGENTS.md](../../../AGENTS.md). Read the issue and its governing specification, then the affected overview, source, and tests. Use [the glossary](../../../docs/domain/GLOSSARY.md) for relevant terms and [the coding workflow](../../../docs/agents/coding-workflow.md) for execution gates. Read roadmap, sprint, charter, and ADR material when it governs this issue; load `docs/agents/sprint-transitions.md` when reconciling sprint progress.
2. If `$issue` is empty, list open `ready-for-agent` issues without `blocked` and ask the user to pick. Never auto-pick interactive work.
3. Fetch the chosen issue, labels, dependencies, comments, local and remote branches/worktrees, and PRs.
4. Require an open issue, `ready-for-agent`, no `blocked`, closed dependencies, and an intelligible problem plus testable acceptance criteria. Under [run-queue](../run-queue/SKILL.md#stacking) stacking, the only open dependency may be a reviewed PR owned by the same queue, and a `blocked` label caused only by that dependency does not stop the issue.
5. Accept either the rich sprint-child template or a lean issue. Derive missing file/read/test details from repository facts; stop if product intent remains ambiguous.

## Preflight and reservation

- Require a clean working tree. Report overlapping user changes and stop; never stash, discard, or absorb them.
- Follow [the worktree lifecycle](../../../docs/agents/worktree-lifecycle.md). For a standalone session, reuse its isolated worktree and record any unchanged scaffold branch for later cleanup. Under `run-queue`, creation follows the host-specific lifecycle, and the host or user retires the worktree; a host without either supported isolation route runs one `run-issue` session per issue instead ([queue implementer worktrees](../../../docs/agents/worktree-lifecycle.md#queue-implementer-worktrees)).
- Write only in your own worktree and in `/tmp`. Never create or write to a worktree another session or agent owns. If the host refuses a write, stop and report the exact message; never retry it through a shell command, a script, or another tool.
- Start from updated `main` on `agent/issue-<N>` and push that branch before editing. The remote branch is the reservation. A stacked issue under `run-queue` starts from its parent's branch head instead. When the branch already exists and is checked out in another worktree, run `git switch --detach origin/agent/issue-<N>` and push with `git push origin HEAD:agent/issue-<N>`, as [run-queue](../run-queue/SKILL.md#implementers-and-worktrees) describes.
- If a local/remote canonical branch, issue worktree, or PR already exists, including a reservation-only branch with no checkpoint commits, route through `resume-issue <N>` and continue the existing attempt instead of creating a duplicate.
- A design pause may leave only the reservation branch. After its design PR merges, `resume-issue` verifies that the branch has no unique work and fast-forwards it to current `main` before implementation.
- Build a scoped execution plan mapping every acceptance criterion to implementation and evidence.
- For an issue with ordered slices, read [SLICED-ISSUES.md](SLICED-ISSUES.md) before planning and apply its eligibility, checkpoint and real-path evidence rules.
- Record relevant canonical terms and avoided synonyms. Do not silently migrate unrelated names.
- Before writing or debugging code that relies on an external dependency version published after your training cutoff, read its official documentation, following `docs/agents/documentation-lookups.md` and ADR-0096.
- Never query an agent provider for remaining quota before starting.

## Decision boundaries

Pause for explicit direction only when work would require:

- scope expansion beyond the acceptance criteria;
- a new architecture or product decision;
- nontrivial missing UI design;
- destructive recovery; or
- a merge conflict with multiple valid resolutions.

Do not add confirmation gates for ordinary implementation mechanics. Keep one issue and one integration owner.

## Execute

1. Read [EXECUTION-STATE.md](EXECUTION-STATE.md). Commit and push meaningful checkpoints. After the first checkpoint, open the one draft PR and keep its `Execution state` current.
2. For UI work, follow [UI-MODE.md](UI-MODE.md).
3. Use [SUBAGENT-MODE.md](SUBAGENT-MODE.md) when dividing substantial UI work. The integration owner always inspects and tests each group. A run-queue implementer does not use it, because it starts no subagents.
4. Follow [Acceptance evidence](VERIFICATION.md#acceptance-evidence) before production implementation, then implement the smallest complete vertical slice. Tests and required current-state docs are in scope even when omitted from a file list.
5. Follow [VERIFICATION.md](VERIFICATION.md). Repair an in-scope root failure at most three focused times. Update the PR after each completed or failed verification phase.
6. Follow [FINALIZATION.md](FINALIZATION.md) to pin the implementation commit, get its one independent Standards and Spec review round, make the PR ready, set auto-merge, confirm the merge, sync, and unblock dependents.
7. Resolve accepted findings in one fix round of new checkpoint commits and rerun proportionate verification. Nothing re-reviews the fixes ([ADR-0085](../../../docs/adr/0085-one-review-round-one-fix-round-no-re-review.md)).
8. On any stop or failed finalization, follow [BAIL-AND-RECOVERY.md](BAIL-AND-RECOVERY.md).

## Completion

Report the issue and PR, merged commit, evidence by acceptance criterion, tests and host-only gates, documentation changes, dependent labels changed, and any honest residual risks. Stop after this issue. A [run-queue](../run-queue/SKILL.md) implementer stops after verification and returns its report to the orchestrator.

A batch PR for several deferred follow-ups is not a `run-issue` run; follow [Small changes](../../../docs/agents/coding-workflow.md#small-changes-adr-0065).
