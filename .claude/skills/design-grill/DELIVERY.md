# Design delivery

## Local artifact gate

1. Write approved wireframe/hi-fi artifacts to canonical paths on `design/issue-<N>`.
2. Apply only explicitly approved factual doc corrections.
3. Never update `CONTEXT.md` for future design; it changes with implementation.
4. Validate links, paths, five states, UX scores/severity, accessibility, localization, and source citations.
5. Show `git status`, exact files, and full diff.

## External gates

After the user reviews the diff:

1. Receive approval to commit and push.
2. Stage exact paths and use intentional `docs(ui): ...` commits without model trailers.
3. Push and create the PR only under that approval.
4. Show PR URL, checks, artifacts, UX scores, decisions, and implementation handoff.
5. Receive separate merge approval, or explicit permission to enable auto-merge when green.
6. Never self-approve. If auto-merge cannot be enabled, preserve the open PR; do not fall back to immediate merge.

After merge, verify the merge independently, follow [the worktree lifecycle](../../../docs/agents/worktree-lifecycle.md), sync safely, and report the bounded parent handoff to [Chief of Staff](../run-queue/SKILL.md) as the next action.

## Bail state

On interruption or failure, preserve local branch, remote branch, PR, uncommitted artifacts, passed reviews, open findings, and exact next step. A handoff artifact is justified only for a genuine bail/resume boundary, not normal success.
