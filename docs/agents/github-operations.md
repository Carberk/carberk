# GitHub operations

Use the installed `gh` CLI through `pnpm agent:github` for routine reads and file-based writes. It uses the existing `gh` authentication, no new MCP server or package. GitHub and the PR's Execution state remain authoritative. This helper does not approve, merge, close issues, reconcile labels or replace the broader automation in issue #648.

Read operations retry a small number of transient transport or GitHub service
errors. Writes are never replayed automatically. An applied issue or comment
includes a read-back verification receipt; an `uncertain` result means the
request may have completed and must be checked by resource before retrying.

## Read the part needed

```bash
pnpm agent:github issue 723
pnpm agent:github issue 723 --full
pnpm agent:github pr 724
pnpm agent:github execution 724
pnpm agent:github queue
pnpm agent:github comments pr 724 --limit 3
pnpm agent:github reviews pr 724 --limit 3
pnpm agent:github review-threads pr 724 --limit 3
pnpm agent:github thread-comments <thread-id> --limit 3
```

Reads return JSON. Bodies and comment text are bounded to 1,800 characters per section or comment by default; `--max-chars N` changes that limit. `--full` removes text bounds but still respects the selected comment count or list limit. Truncated text carries `truncated: true`; item and discussion reads identify uncovered surfaces in `omitted`, and paginated connections expose `pageInfo` plus an omitted count where applicable. An empty acceptance or Execution state list means no matching Markdown heading was found, not that the issue has no requirements or the PR has completed.

Issue reads expose `Parent`, `What to build`, `Acceptance criteria`, `Blocked by`/`Depends on`, and a bounded body preview. Read the complete body with `--full` when the preview is truncated or when another section may govern the decision. Native parent and blocker links are reported as omitted because they require a separate GitHub API lookup, for example `gh api graphql -f query='query{repository(owner:"Carberk",name:"carberk"){issue(number:N){parent{number url}}}}'` plus the dependency summary query in [issue-tracker](issue-tracker.md#conventions).

PR discussion has separate surfaces: `comments` are ordinary conversation, `reviews` are formal review submissions and verdicts, and `review-threads` are inline file discussions. `thread-comments` pages the replies within one inline thread. No surface claims coverage of another surface.

## Before implementing or declaring review complete

1. Read the issue's scope, parent, criteria and blocking text. Follow a governing parent or linked specification and read issue comments. Check [native blockers](issue-tracker.md#conventions) separately; the helper does not establish startability.
2. For a PR, inspect its diff, head, checks and Execution state. Read formal reviews, inline review threads and ordinary comments. Keep review verdicts, reviewed commit IDs and thread resolution/outdated flags intact; an older review or an outdated thread does not by itself dismiss a request for changes.
3. Escalate every truncated governing body with `--full`. Page omitted history before changing scope, closing an issue or claiming that review is complete. For ordinary comments and formal reviews, pass `pageInfo.startCursor` to `--before` while `hasPreviousPage` is true. For inline threads, pass `pageInfo.endCursor` to `--after` while `hasNextPage` is true.
4. Each inline thread initially returns its first 10 comments. If its nested `comments.pageInfo.hasNextPage` is true, use `thread-comments <thread-id> --after <endCursor>` and continue to the end. That command defaults to 3 replies per page. `omittedComments` counts comments outside the current page; `pageInfo` tells you whether another page exists in the direction being read. `--full` changes text bounds, never pagination.

The queue lists up to 20 open PRs, including non-queue PRs, with `possiblyMore: true` when the limit is reached. It is a snapshot, not an ownership or merge-readiness verdict. Missing rows do not prove merge or closure. Check states remain their actual values, including pending or failure. Read formal reviews, older governing comments, full criteria and missing evidence explicitly before implementing, reviewing or merging. GitHub mutations and decision authority still follow the coding workflow.

## Write from a body file

Save the exact Markdown in a file in your own worktree or `/tmp`, then preview:

```bash
pnpm agent:github create-issue --title "<outcome>" --body-file /tmp/issue.md --label needs-triage --label infra
pnpm agent:github comment issue 723 --body-file /tmp/update.md
pnpm agent:github comment pr 724 --body-file /tmp/review.md
```

Preview the body file and the dry-run before sending an authorized write with `--apply`. Dry-run returns the argument array and body character count; applied writes return only the resulting URL. Comments are ordinary GitHub comments, not approving PR reviews. Use [leaving-pr-comments](../../.claude/skills/leaving-pr-comments/SKILL.md) for attribution and [sol-loop](../../.claude/skills/sol-loop/SKILL.md) for review records.

Direct CLI equivalents are `gh issue create --title "<outcome>" --body-file /tmp/issue.md`, `gh issue comment 723 --body-file /tmp/update.md`, and `gh pr edit 724 --body-file /tmp/pr.md`. Avoid embedding multiline Markdown in a shell command. The helper invokes argument arrays without a shell and prints no credential values.

All helper commands accept `--repo [HOST/]OWNER/REPO`. Without it, `gh repo view` resolves the current checkout. `pnpm test:agent-github` runs fixture tests without writing to live GitHub; it is included in repository tests and the local unit gate.

Use this helper as the default GitHub boundary. Use direct `gh` CLI/API calls for capabilities it does not expose, such as native blocking links, formal review submissions, replies and thread resolution. Preserve the distinction between ordinary comments, formal reviews, inline threads and execution checks. An installed GitHub connector does not replace this repository's CLI workflow.

Upstream references: [gh JSON formatting](https://cli.github.com/manual/gh_help_formatting), [issue creation](https://cli.github.com/manual/gh_issue_create), [issue comments](https://cli.github.com/manual/gh_issue_comment), [PR editing](https://cli.github.com/manual/gh_pr_edit), [GraphQL requests](https://cli.github.com/manual/gh_api), and [GitHub GraphQL objects](https://docs.github.com/en/graphql/reference/objects). Review fields and connections were checked against GitHub's live GraphQL schema and read-only PR requests on 2026-11-05.
