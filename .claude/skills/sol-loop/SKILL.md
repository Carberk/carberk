---
name: sol-loop
description: Use when the user says "sol loop", and as the review step of every Carberk PR (full-send step 3).
---

# sol-loop

This is a workflow for making your code changes more correct before (or
sometimes after) filing a pull request. tl;dr - use OpenAI's GPT Sol to review
your code in a loop.

Make the most minimal possible changes to appease the Sol reviewers. Be careful
of scope creep and don't be scared to push back.

## Carberk

This loop is Carberk's only code review. It replaces the retired separate
Standards and Spec reviewers, so one Sol reviewer covers three things:

- **Bugs**: the upstream brief below.
- **Spec**: the issue's acceptance criteria and out-of-scope list. An unmet
  criterion is a `blocker`. Work the issue does not ask for is a `should`.
- **Standards**: [coding standards](../../../docs/agents/coding-standards.md)
  and the docs that [AGENTS.md](../../../AGENTS.md) routes for the touched
  areas. A documented-standard breach is a `should`, or a `blocker` when it
  hides a bug.
- **UI**: for user-facing UI changes, run the app and score how it looks
  and works, separately from the code, as in the
  [delivery workflow](../../../docs/agents/coding-workflow.md#4-review).
  Apply the [UI copy rules](../../../docs/agents/coding-standards.md#ui-copy).
  Add the UI and readability lines to the brief and reply below.

For signed-in native UI preparation, follow the required [fixture sign-in procedure](../../../docs/agents/native-fixture-signin.md).

Before the first review, run the checks CI runs for the touched packages
(typecheck, lint, affected tests). Include current results in each brief. Use
the Sol model and effort from [models and effort](../../../docs/agents/models.md): medium, or
`xhigh` for auth, permissions, migrations, data deletion, payments or
concurrency. Never use Fast mode.

Keep the review ledger in the issue implementer's thread. Summarize it in the PR after
approval. Do not write review files into the repository.

## Budget

- Default: 3 rounds total. Every round reviews the full candidate diff.
- Extend to 5 only for security, permissions, auth, data loss, or
  state/concurrency, while a blocker or should stays open with evidence. Or when
  the user asks.
- Stop when the ship gate passes. Declined nits alone need no additional
  round. Fixes go through a fresh review.
- Run one reviewer at a time. Reviewers do not start delegates.
- Keep a ledger: id, severity, outcome, usage if returned. Never guess it.

## 1. Scope

Run `git status --short`. Do not stash, discard, or include unrelated
changes. Limit review to the change paths if they separate cleanly.
Otherwise stop and ask.

Find the base after `git fetch origin`:

- PR: `gh pr view <n> --json baseRefName,headRefOid`. Check out the branch
  only if clean. Confirm `HEAD` is the PR head, or ahead only by this
  change. Base: `git merge-base HEAD origin/<baseRefName>`.
- Local: `git merge-base HEAD origin/<default-branch>`. No remote: a base
  the user names, or `HEAD` for uncommitted changes only.

The change is base to working tree in those paths, with untracked files.
Pin the base by SHA. Keep it across rounds unless the target base changes
when the branch is updated. Compare each candidate to that base. State
intent and out-of-scope in 1-2 sentences. Run covering checks. Do not send
code this change breaks. Note missing or pre-failing checks in the brief.

## 2. Start Sol

In T3, call `orchestrator_capabilities` before the first dispatch. Pick the Sol that
[models and effort](../../../docs/agents/models.md) names unless the user
named a version. Do not hardcode an ID. Record provider, model, and effort
only if exposed. Use `delegate_task` every round (`role: "review"`,
`mode: "async"`). Save `taskId`. New `clientRequestId` per round.
For tests or runtime review, the parent sets `isolation: "worktree"` before
dispatch. The host prepares the child's checkout from the parent's commit;
commit the scoped change locally first so that checkout contains the review
diff. The child uses its host-assigned checkout without creating another
checkout in the shell. For read-only diff review, shared isolation can read
the parent's working diff without switching branches or changing files.
`childThreadId` is storage, not the next target. Do not use
`t3_thread_send`, `create_threads`, or `t3_thread_launch` for review.

If T3 tools are not listed, try one direct capability call. Outside T3, start
a new native Sol subagent with no inherited conversation each round. In
Claude Code, use a custom subagent only if it is set up to run Sol. If no
route runs Sol with fresh context, report the blocker. Do not substitute a
model.

Build each brief from the governing spec, standards, current candidate diff,
and current proof. Give the reviewer the governing excerpts when an issue,
PR, or proof artifact contains review history. Keep earlier briefs, findings,
verdicts, fix summaries, and inter-round diffs out of the review brief.

Do not edit scoped files while review runs. Wait for the notice. Do not
poll or start a second reviewer. Timeout, error, or no reply is not
approval. On failure, cancel, verify stop, and dispatch a fresh reviewer.

Use this brief every round. Include the matching checkout
instruction from [the delivery workflow](../../../docs/agents/coding-workflow.md#4-review):

```text
Review only. Do not edit, commit, push, comment on PRs, or start subagents.
Checkout: <T3: use the host-assigned checkout; shared diff review stays read-only.
Outside T3: read the source checkout without switching branches; run tests
in your own temporary worktree and remove it afterwards.>
Repo: <T3: host-assigned cwd; outside T3: abs source path>
Base: <sha> Candidate: <sha or scoped working diff>
Intent: <intent> Out of scope: <scope> Checks: <current results>
Spec: <issue or governing excerpts>. Each acceptance criterion must hold; unmet = blocker.
Standards: docs/agents/coding-standards.md and <routed docs for touched areas>.
See: git diff <base> [-- <paths>]; git status --short (read untracked).
Review the entire diff from the stated base. Use current source, tests, and
proof. Avoid earlier review threads, review notes, and intermediate commits.
Read surrounding code. Find bugs, broken callers, mismatch with intent.
Skip style unless it hides a bug. Hold to the smallest change. Flag code,
tests, or guards the intent does not need. Other paths, rare cases, small
perf, extra compat: nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = rest.
[UI changes only] Follow docs/agents/local-testing.md for read-only readiness, session reuse, served-origin proof and owned-device selection/cleanup. Android briefs also include docs/agents/mobile-expo.md bounded build, ABI/origins and scheduling rules. Run the app on your owned Simulator with fixture data,
screenshot every changed state, and score the look and flow per
docs/agents/coding-workflow.md#4-review.
Reply:
VERDICT: APPROVE or CHANGES
MERGE CONFIDENCE: N/10
[UI changes only] UI CONFIDENCE: N/10, then U1.. findings with their screenshot
[UI changes only] READABILITY CONFIDENCE: N/10, with observed states/locales/text sizes and copy findings per the delivery workflow. No runtime evidence: neither score.
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion> (stable ids)
```

## 3. Decide and fix findings

The agent implementing the issue owns the findings and the next candidate.
Check the behavior and impact against the issue, standards, and evidence.
Use that assessment to decide which findings need a fix and which are nits,
incorrect, or separate work. Record a brief reason and supporting evidence
when declining a finding. Leave the candidate alone for declined nits.

- Apply small, localized fixes yourself. Add a focused regression when
  needed to prove the behavior.
- Delegate larger fixes to separate implementation agents under the issue
  implementer. Give each the current candidate, an accepted finding, a
  scoped change and its proof requirements. Verify and integrate each fix
  before the next review.

Update the ledger. Re-run checks and `git diff --shortstat <base>`. If
review grew the diff, cut first. Do not agree just to end the loop.

## 4. Next round

After integrating fixes and verifying the candidate, dispatch a fresh reviewer
using step 2 if the budget remains. A round is also needed if a blocker or
should is open or the review does not cover the current candidate. After its
independent verdict, the issue implementer compares the findings with the
ledger. Before marking any earlier finding resolved, verify its outcome on
the current candidate and record the code, test, or runtime evidence in the
ledger. The fresh reviewer's verdict alone does not resolve earlier findings.

## 5. Stop and ship

Ship after a completed independent review of the full current candidate diff
against its pinned base, with no open blocker, should, or concern of your own.
If the verdict is `CHANGES` solely for findings the implementer verifies are
nits, incorrect, or separate work, document those decisions and move on.
Before filing, pushing an update, or merging after a rebase or fix, start a
fresh full review if the completed review no longer covers the diff against
the current target base.

If two independent reviews raise the same blocker or should and the issue
implementer still disputes it, summarize the evidence on both sides for the
user to decide. If the review budget ends and the ship gate is still blocked,
report the latest verdict and each unmet condition for the user to decide.

Do not push during the loop. Push after agreement only if the user asked
to push, ship, or update the PR. If you push to a PR, add above the model
blurb:

`Reviewed with sol-loop: <N> rounds with <model>. Sol verdict: <verdict>`.

Add `on <effort>` only if verified. If the implementer cleared a `CHANGES`
verdict, include the reasons in the review summary.

Report: rounds, model, what Sol changed, diff size before/after, fixed and
declined findings with reasons, usage if exposed (else say not), pushed or not.
