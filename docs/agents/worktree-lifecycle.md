# Worktree lifecycle

Use one linked worktree per agent session and retire it after its parent integration PR merges. This prevents host-created scaffold branches, canonical task branches, and full dependency trees from accumulating after successful work.

The issue reservation branch/comment and parent integration PR are the durable recovery record. Codex desktop, Claude Code desktop, the `claude-kimi` CLI, or another supported client that finds either resumes it after inspecting the issue, local and remote heads, worktree, PR body/comments/checks, running processes, and diff. It never creates a parallel attempt because the prior chat is unavailable. It resumes in the found worktree only when no other session or agent owns it; otherwise it works in its own new worktree from the pushed branch.

Load the procedure for the current role and phase. Startup needs the section below; queue dispatch, merge and cleanup load their references only when reached.

## Start in the worktree you already have

Some hosts create a linked worktree and a `claude/<name>` or `codex/<name>` branch before the task begins.

1. Inspect `git worktree list --porcelain`, the current branch, status, local/remote task branches, and open PRs.
2. If this is a queue implementer, follow the host-specific creation route below and preserve the parent chat's checkout. Otherwise, if the current checkout is already an isolated linked worktree, reuse it. Create or switch to the workflow's canonical branch in that worktree; do not create a second linked worktree for the same task.
3. Record any host scaffold branch and its starting SHA. It is cleanup-eligible only while it remains unchanged and has no PR or remote work.
4. Create a new linked worktree only when the current checkout is the shared repository checkout or the task explicitly needs another isolated checkout.

Write only in your own worktree and in `/tmp`. Never create a worktree for another session, and never write to one that another session or agent owns. If the host refuses a write, stop and report the exact message; never retry it through a shell command, a script, or another tool.

## Queue implementer worktrees

Before creating, dispatching or resuming a queue writer, read [Queue writer worktrees](worktree-queue-writers.md#queue-implementer-worktrees). It owns Claude/Codex creation routes, branch/checkpoint ownership, stopped-writer recovery and retirement responsibilities.

## Treat merge and cleanup as separate results

After a merge attempt, read [Merge and cleanup](worktree-merge-cleanup.md#treat-merge-and-cleanup-as-separate-results). Verify remote merge independently from local cleanup and record the exact cleanup tuple. A live task retains its checkout and reports that tuple to its integration session.

## Safe cleanup gate

Before retiring any worktree, read and satisfy [the complete safety gate](worktree-merge-cleanup.md#safe-cleanup-gate). Keep every tree whose gate fails; age or an absent session is not completion evidence. Use the script rather than ad hoc deletion.

## Run the cleanup gate

The integration owner reads [Cleanup execution](worktree-cleanup.md#run-the-cleanup-gate) before running the report or applying it after merges and at queue end. That reference owns commands, scan coverage, stop conditions, exceptions and the immediate pre-removal recheck. Detailed diagnostics are consulted when a scan or verdict needs interpretation.

## Completion report

After the cleanup phase, return [the completion report](worktree-cleanup.md#completion-report), including preserved trees, reasons, scan coverage and pending tuples.
