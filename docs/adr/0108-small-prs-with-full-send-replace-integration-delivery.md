# ADR-0108: Small PRs with full send replace integration delivery

- **Status**: Accepted
- **Date**: 2026-11-04
- **Deciders**: Carberk founder
- **Supersedes**: [ADR-0098](0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md), and the integration-branch, reviewer-round and orchestrator rules it amended in [ADR-0065](0065-small-changes-skip-the-issue-ceremony.md), [ADR-0084](0084-related-issues-of-one-parent-may-ship-on-one-integration-branch.md) and [ADR-0085](0085-one-review-round-one-fix-round-no-re-review.md).

## Context

Under ADR-0098 the #897 campaign became one integration branch: about 1,500 commits and 426,000 added lines, 72% of them committed evidence. Nothing merged to `main` between 18 October and 4 November. CI never ran on the live candidate. Coordinators created repair and process issues faster than features closed. The founder could not tell which features worked.

The founder paused the campaign on 2026-11-04. The work is archived under `archive/2026-11-04/` tags, PR #904 is closed unmerged, and the backlog is being reset.

## Decision

1. **One issue, one small PR.** Each ticket is a vertical slice that a PR of about 500–1,000 changed lines can finish, excluding lockfiles and generated files. PRs branch from current `main` and merge back by squash. Integration branches, coordinator agents and sprint queues are retired.
2. **Deciding uses Matt Pocock's skills; shipping uses tstack's.** Grilling, prototypes, `to-spec`, `to-tickets`, `triage`, `tdd` and `diagnosing-bugs` decide and shape work. `full-send`, `sol-loop`, `file-pr` and `babysit-pr` ship one PR. Third-party skills are copied into `.claude/skills` at pinned commits.
3. **One reviewer.** `sol-loop` is the code review: one GPT Sol reviewer, up to three rounds, checking bugs, the issue's acceptance criteria and the coding standards. It replaces the separate Standards and Spec reviewers.
4. **CI is the proof gate.** The required `pr` check, focused tests and, for UI, the running app on a simulator prove a PR. Proof goes in the PR description. Evidence files are no longer committed.
5. **Merging.** An agent merges only when the founder says "full send" for that task or approves the PR, and only through branch protection. Production deploys, Railway and EAS settings, store submissions, paid services and data deletion still need the founder.
6. **Unfinished features ship dark.** User-visible work that spans several PRs stays behind a feature flag or tester-only switch until it is complete.
7. **Environments.** Local Docker is the development environment. Railway staging is for real phones, testers and release checks, and redeploys from `main` after CI. PR environments stay off.

## Consequences

- `main` moves every day, and a broken change is small enough to find and revert.
- Staging redeploys after more merges, which costs memory. Deploying only services whose code changed is tracked as separate work.
- Large features need more up-front slicing, and flags must be removed when a feature completes.
- The retired workflow's skills, agents and guides are deleted. Their history stays in git and in the archive tags.
