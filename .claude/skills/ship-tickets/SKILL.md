---
name: ship-tickets
description: Deliver an approved ticket graph as small PRs with parallel worktrees and parent-owned merges.
---

# Ship tickets

Use this skill when an approved spec has more than one ticket. The parent
thread coordinates the graph; implementation agents own isolated worktrees.
There is no separate coordinator agent and no integration branch.

Read the parent spec, every child ticket, blocking edges and later founder
corrections. Also read `AGENTS.md` and
`docs/agents/{coding-workflow,models,environment}.md`. A missing criterion or
contradictory dependency is a planning blocker: resolve it before dispatching
dependent work.

## Mode and ledger

Carry the founder's explicit mode into every ticket:

- `full-send` authorizes merging each ticket that reaches the merge gate. It
  does not authorize production deploys, store submissions or other actions
  that the environment guide reserves for the founder.
- `full-stop` leaves PRs open for founder approval while independent tickets
  may continue.

Without an explicit mode, ask the founder to choose one before dispatch.
The parent thread applies the mode. Implementation agents never invoke the
mode's merge or auto-merge steps.

Keep a compact ledger in the thread with one row per ticket:

```text
ticket | blockers | owner | branch/worktree | PR | proof | review | merge
```

Before dispatch, fetch `origin` and record the current `origin/main` SHA as
`startingBase`. Preserve that SHA through every merge and pass it explicitly to
the final review. Do not recompute a merge-base against the new `main`, which
would hide tickets that already merged.

## Graph and dispatch

Use at most three implementation tickets concurrently. A ticket is ready when
all its blockers are merged into `main`, not merely open as PRs. Check for
cycles, already-merged work and overlapping owned paths before dispatching.

Each ticket gets one small PR from current `main`. Give its agent:

- the complete issue/spec and acceptance criteria;
- its blockers and the decisions already made for them;
- the recorded base and the paths it owns;
- the mode, required proof and applicable project guidance;
- the instruction to run the configured checks, `sol-loop` and `file-pr`.

Use the environment's delegation procedure with an isolated worktree. The
delegation tool owns checkout creation; never create a child checkout in a
shell or in the task prompt. If isolated delegation is unavailable, run the
tickets sequentially in this worktree and report that limitation.

The agent that creates, takes over or pushes a PR links it immediately as its
next tool call. Children never watch PRs and never make merge decisions; the
parent thread watches and integrates. Follow each delegate's returned next
step, and do not poll or launch replacement work while a delegate is running.

## Integrate

When an agent finishes, inspect the actual diff, acceptance, proof and review.
Fix real findings before merging. Rebase a ready PR onto current `main`, prove
any conflict resolution, and rerun review for changed behavior.

Apply these skills to every ticket:

1. `sol-loop` reviews bugs, acceptance and standards.
2. `file-pr` opens the real PR with proof and `Closes #<ticket>`.
3. `babysit-pr` handles CI and review changes.
4. The parent applies `full-send` or `full-stop` and owns every watch and merge
   decision; children stop after filing or updating their PR.

Merge only when required checks are green, review is complete, the branch is
up to date and GitHub reports it mergeable. Use the repository's protected
squash merge; never bypass branch protection. After a merge, refresh `main`,
remove that ticket's worktree and dispatch newly unblocked tickets. Keep
independent tickets moving when another ticket is parked.

## Finish

After the requested graph is merged, run the configured cross-ticket checks and
exercise the combined critical flow. Run one final `sol-loop` review against
the complete diff from `startingBase` to the final `HEAD`; pass that fixed base
explicitly. Fix findings in new small PRs rather than reopening merged ticket
branches.

Report every ticket's PR, proof, review and merge state, plus the starting base,
important decisions and any parked or blocked work. Unwatch active PRs before
handing the result back to the founder.
