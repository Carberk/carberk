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
  Add the UI line to the brief and reply below.

Before round 1, run the checks CI runs for the touched packages (typecheck,
lint, affected tests) and put the results in the brief. Use the Sol model and
effort from [models and effort](../../../docs/agents/models.md): medium, or
`xhigh` for auth, permissions, migrations, data deletion, payments or
concurrency. Never use Fast mode.

The ledger stays in this thread and the PR line below. Do not write review
files into the repository.

## Budget

- Default: 3 rounds total. Round 1 is full. Later rounds check only
  changed code and open findings.
- Extend to 5 only for security, permissions, auth, data loss, or
  state/concurrency, while a blocker or should stays open with evidence. Or when
  the user asks.
- Stop early if a round returns only nits. Declined nits and comment,
  doc, or format-only fixes need no new round.
- One reviewer only. Sol must not start subagents or reviewers.
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
Use one diff command all rounds. State intent and out-of-scope in 1-2
sentences. Run covering checks. Do not send code this change breaks. Note
missing or pre-failing checks in the brief.

## 2. Start Sol

In T3, call `orchestrator_capabilities`. Pick the Sol that
[models and effort](../../../docs/agents/models.md) names unless the user
named a version. Do not hardcode an ID. Record provider, model, and effort
only if exposed. Use `delegate_task` every round (`role: "review"`,
`mode: "async"`). Save `taskId`. New `clientRequestId` per round.
`childThreadId` is storage, not the next target. Do not use
`t3_thread_send`, `create_threads`, or `t3_thread_launch` for review.

If T3 tools are not listed, try one direct capability call. Outside T3, use
a native Sol subagent and keep its ID. In Claude Code, use a custom subagent
only if it is set up to run Sol. If no route runs Sol, report the blocker. Do
not substitute a model.

Do not edit scoped files while review runs. Wait for the notice. Do not
poll or start a second reviewer. Timeout, error, or no reply is not
approval. On failure, cancel, verify stop, restart with the ledger.

Round 1 brief (T3 children get no history):

```
Review only. Do not edit, commit, push, comment on PRs, or start subagents.
Never checkout or switch branches in <abs path>; to run tests, use your own
`git worktree add /tmp/review-<sha> <sha>` and remove it afterwards.
Repo: <abs path> Base: <sha> Intent: <intent> Out of scope: <scope> Checks: <results>
Spec: <issue URL>. Each acceptance criterion must hold; unmet = blocker.
Standards: docs/agents/coding-standards.md and <routed docs for touched areas>.
See: git diff <base> [-- <paths>]; git status --short (read untracked).
Read surrounding code. Find bugs, broken callers, mismatch with intent.
Skip style unless it hides a bug. Hold to the smallest change. Flag code,
tests, or guards the intent does not need. Other paths, rare cases, small
perf, extra compat: nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = rest.
[UI changes only] Run the app on a spare Simulator with fixture data,
screenshot every changed state, and score the look and flow per
docs/agents/coding-workflow.md#4-review.
Reply:
VERDICT: APPROVE or CHANGES
MERGE CONFIDENCE: N/10
[UI changes only] UI CONFIDENCE: N/10, then U1.. findings with their screenshot
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion> (stable ids)
```

## 3. Answer findings

Check each finding and severity yourself. Another path, rare case, or
small cost is a nit, whatever label it came with.

- Agree: smallest fix. Prefer delete or narrow over new lock, cache,
  helper, or option. Fix the case that happened. Add one focused test
  that fails without the fix, if intent needs it.
- Disagree: say why, with evidence (file:line, test, output).
- Out of scope or nit: decline in one line. List as follow-up.

Update the ledger. Re-run checks and `git diff --shortstat <base>`. If
review grew the diff, cut first. Do not agree just to end the loop.

## 4. Next round

Start one only if budget remains and a blocker or should is open, behavior code
changed, or approval does not cover the current behavior diff. Use a fresh
`delegate_task` in T3, or follow up the saved native ID. Send the round 1 brief,
the ledger (`fixed:` / `disagree:` / `declined:` + evidence), the same base
diff, and the change since last round. Tell Sol: open ids and changed code only.
Mark each old id `resolved` or `still open: <reason>`.

## 5. Stop and ship

Agreed: APPROVE on the current behavior diff, no blocker or should open,
no concern of your own. Stuck: an item stays disputed after two replies,
or budget ends. Show both sides in 2-3 lines each. The user decides.
Budget end is not approval.

Do not push during the loop. Push after agreement only if the user asked
to push, ship, or update the PR. If you push to a PR, add above the model
blurb:

`Reviewed with sol-loop: <N> rounds with <model>. Sol verdict: approved`.

Add `on <effort>` only if verified.

Report: rounds, model, what Sol changed, diff size before/after, fixed and
declined findings with reasons, usage if exposed (else say not), pushed or not.
