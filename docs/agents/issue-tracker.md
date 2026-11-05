# Issue tracker: GitHub

Issues and specs for Carberk live as GitHub issues on `Carberk/carberk`. Use the `gh` CLI for all operations, through `pnpm agent:github` ([GitHub operations](github-operations.md)) for bounded reads and file-based writes. Write titles and bodies with [glossary](../domain/GLOSSARY.md) terms. The repository is public, so keep secrets and private data out.

## Ticket shape

[to-tickets](../../.claude/skills/to-tickets/SKILL.md) writes tickets and [to-spec](../../.claude/skills/to-spec/SKILL.md) writes parent specs. Each ticket:

- is one vertical slice that a single PR of about 500–1,000 changed lines can finish, excluding lockfiles and generated files;
- says what to build from the user's point of view, its acceptance criteria and what blocks it;
- avoids file paths and code, which go stale.

```markdown
## Parent

#<parent spec>, if any.

## What to build

The end-to-end behavior this ticket makes work, from the user's point of view.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

#<issue>, or "None". Omit when native blocking links are set.
```

Bugs use the [bug template](../../.github/ISSUE_TEMPLATE/bug.md). One PR closes one ticket with `Closes #<issue>`.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file>`.
- **Read an issue**: `pnpm agent:github issue <number>` for the bounded delivery sections and body preview; add `--full` when the preview is truncated or another section may govern the decision. Fetch omitted comments separately with `pnpm agent:github comments issue <number>`.
- **List issues**: `gh issue list --state open --json number,title,labels` with `--label` and `--state` filters.
- **Sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>`.
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>`. A ticket is startable when every blocker is closed: `gh api repos/Carberk/carberk/issues/<n> --jq .issue_dependencies_summary.blocked_by` returns `0`.
- **Comment**: `pnpm agent:github comment issue <number> --body-file <file>` for a dry-run, then add `--apply` to publish.
- **Labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`. The vocabulary is in [triage labels](triage-labels.md).
- **Close**: write the reason to a body file, dry-run `pnpm agent:github comment issue <number> --body-file <file>`, apply it, then `gh issue close <number>` with the right reason (`--reason "not planned"` when it is not done).

File issues only in `Carberk/carberk`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.
