# Delivery workflow

One issue is one small PR from current `main`. [ADR-0108](../adr/0108-small-prs-with-full-send-replace-integration-delivery.md) records this decision and retires the integration campaign workflow. Use the [glossary](../domain/GLOSSARY.md) for domain terms and the [environment guide](environment.md) for what you can run and touch.

## 1. Decide what to build

- Unclear goal or design: interview the founder with [grilling](../../.claude/skills/grilling/SKILL.md), or [grill-with-docs](../../.claude/skills/grill-with-docs/SKILL.md) when decisions should become ADRs or glossary entries.
- Open UI or state question: build a throwaway [prototype](../../.claude/skills/prototype/SKILL.md). For user-facing UI, review the affected interaction with the installed `ux-heuristics`, `design-everyday-things`, and `impeccable` skills when available; record findings and limitations in the PR.
- Write it down with [to-spec](../../.claude/skills/to-spec/SKILL.md), then split it with [to-tickets](../../.claude/skills/to-tickets/SKILL.md). Each ticket must fit one PR of about 500–1,000 changed lines, excluding lockfiles and generated files. Split anything bigger.
- For an approved graph in `full-send` or `full-stop` mode, use [ship-tickets](../../.claude/skills/ship-tickets/SKILL.md) to coordinate independent tickets and their blocking edges.
- New bugs and requests go through [triage](../../.claude/skills/triage/SKILL.md). The [issue tracker](issue-tracker.md) guide has commands and the ticket format.

## 2. Build one ticket

1. Branch from current `origin/main` in your own worktree. Name it `t3/<issue>-<slug>` or `agent/issue-<issue>-<slug>`.
2. Read the issue, [CONTEXT-MAP.md](../../CONTEXT-MAP.md), the owning code and its tests, and the guides [AGENTS.md](../../AGENTS.md) routes for the area.
3. Work test-first with [tdd](../../.claude/skills/tdd/SKILL.md). Use [diagnosing-bugs](../../.claude/skills/diagnosing-bugs/SKILL.md) for hard failures.
   For product UI, apply the [UI copy rules](coding-standards.md#ui-copy) before handoff.
4. Hide unfinished user-visible features behind a feature flag or tester-only switch, so each PR can merge without exposing half a feature.
5. Keep the PR to its ticket. Note follow-ups in the issue instead of growing the diff.

## 3. Prove it

Proof is what you observed in this session:

- the checks CI runs for the touched packages (typecheck, lint, tests);
- one focused test that fails without the change, when behavior changed;
- for UI or runtime behavior, the running app on the iOS Simulator, as described in [local testing](local-testing.md). Use its fixture Users, Listings and videos rather than hand-made data.

Put proof in the PR description. Screenshots go in the PR, never in the repository. Do not commit evidence, receipts or review files.

Draft pull requests run only the lane selector. Their required `pr` check is skipped, so a draft-only run cannot establish a green head for the docs shortcut. Mark a draft ready for review to run the selected docs or full lane; later pushes run it again. Adding the `run-full-ci` label forces the full matrix, including on a draft.

## 4. Review

Run [sol-loop](../../.claude/skills/sol-loop/SKILL.md) before filing or updating the PR. One Sol reviewer checks bugs, the issue's acceptance criteria and the [coding standards](coding-standards.md). It runs up to 3 rounds, or 5 for auth, permissions, data loss or concurrency.

Every reviewer, whatever its model, reviews without touching another session's checkout:

- Read the change with `git fetch origin pull/<n>/head:review-<n>`, `git diff` and `git show`. Never `git checkout` or `git switch` in a worktree you did not create; another session may have uncommitted work there.
- To run tests or the app, make a temporary worktree: `git worktree add /tmp/review-<n> review-<n>`, then `pnpm install --frozen-lockfile` in it. Remove it with `git worktree remove /tmp/review-<n>` when done.
- For runtime behavior, use the fixture data and a spare Simulator from [local testing](local-testing.md). Use your own ports, and stop the processes and close the devices you started.

Every review reply starts with `MERGE CONFIDENCE: N/10` for correctness and the issue's criteria.

**UI changes** (any change a User sees in the app, Admin or public Web) get separate UI and readability scores that the founder reads before merging. The reviewer:

1. Runs the PR on a spare Simulator, or Admin/public Web in the preview browser, with the fixture data, and takes screenshots of every state the PR changes: empty, loading, success, error, and long text in Russian and Turkmen where supported.
2. Looks at each screenshot with the `impeccable`, `ux-heuristics` and `design-everyday-things` skills: text density, one clear primary action, visual hierarchy, spacing and tokens, consistency with nearby screens, readable errors with a way forward, and touch targets.
3. Applies the [UI copy rules](coding-standards.md#ui-copy) to each changed state, reading headings, helpers, status and actions together. Flag redundant copy and unnecessary explanation, and verify that required meaning survives proposed cuts.
4. Replies with `UI CONFIDENCE: N/10` and `READABILITY CONFIDENCE: N/10` on separate lines after the merge score, then numbered findings with the screenshot or state each one comes from. Readability covers comprehension, useful copy, hierarchy, contrast, wrapping and locale fit; it is separate from code correctness. State the observed screens, locales and text sizes so a local score is not presented as a whole-product audit.

For both UI and readability: 1–3 means the task is hard to understand or complete; 4–6 needs material changes; 7 has bounded issues still needing resolution; 8–9 is clear and ready within the observed states; 10 requires exceptional evidence across the relevant states. Give reasons, not a score alone.

Screenshots go in the review reply or the PR, never in the repository. Either score below 8 holds the merge until its findings are fixed or the founder accepts them. If the reviewer cannot run the affected surface, it says so and gives neither UI nor readability score; reading code is not a runtime UI review. Unobserved required states remain missing proof even when the observed states score well.

## 5. File, watch and merge

- File the PR with [file-pr](../../.claude/skills/file-pr/SKILL.md). The [PR template](../../.github/pull_request_template.md) has the shape: problem, change, proof, review, and `Closes #<issue>`.
- Watch it with [babysit-pr](../../.claude/skills/babysit-pr/SKILL.md). Fix real CI failures and findings.
- Merge only when the founder says "full send" for the task ([full-send](../../.claude/skills/full-send/SKILL.md)) or approves the PR. The merge gate is green required checks, finished review, an up-to-date branch and squash merge. Never bypass branch protection.
- After merge, remove your worktree and local branch; `node scripts/worktree-gc.mjs` reports which worktrees are safe to remove, and `--apply` removes only those. GitHub deletes the remote branch.

## Always ask the founder first

Production deploys, Railway or EAS setting changes, store submissions, paid services, data deletion or resets outside your local stack, force-pushing a branch you do not own, and closing someone else's PR. Product decisions and scope growth go back to the founder too.

## Not used any more

Campaign or integration branches, coordinator or Chief of Staff agents, sprint queues, exact-SHA reviewer rounds and committed evidence folders are retired. Old campaign work lives in tags named `archive/2026-11-04/<old-branch>`. Copy useful code from there into new small PRs; never merge an archive branch.
