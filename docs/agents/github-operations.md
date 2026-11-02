# GitHub operations

Use the installed `gh` CLI through `pnpm agent:github`, or an already configured GitHub MCP/connector exposed to the current thread. The helper uses existing `gh` authentication and needs no new package. GitHub Issues own task contracts, assignments, status and dependencies under the [tracking-before-dispatch gate](issue-tracker.md#required-tracking-before-dispatch). The helper does not approve, merge, close issues, reconcile labels or replace the broader automation in issue #648.

## Verify the active connection

1. Identify the tools actually exposed to this thread and the authenticated GitHub account. Read the full parent issue and selected ticket, including governing updates. For the Carberk release, target `Carberk/carberk` explicitly; historical repository URLs do not select the write destination.
2. Verify that the connection covers the repository's owning account or organization and the target repository. Issue mutations need `Issues: write`; public reads and membership alone do not prove write access. A personal-account app installation does not cover organization-owned repositories. Host approval settings such as "Allow all actions" do not add GitHub permissions.
3. After a verified access correction, send one authorized real issue write and read back its returned URL/body before continuing a migration batch. Search for existing issues first. Preserve the request if the result is uncertain and reconcile whether it succeeded before resending. A settings screenshot or successful read is not a successful write receipt.
4. At the first permission refusal, stop writes and report the exact error, transport, account and repository without credentials. Preserve the intended body and arrange an access correction. Follow the [refusal rule](issue-tracker.md#required-tracking-before-dispatch); another tool, account, browser session or provider is not a retry path around that refusal. GitHub remains the tracker while access is blocked.

### Host-specific tools

| Runtime | Access check and use |
|---|---|
| Codex with the GitHub connected app | Discover the exposed GitHub tools. Read the authenticated identity, installations and repository coverage before using issue tools. Use structured arguments for issue bodies, then read back the returned issue. |
| Claude Code | Inspect `/mcp` in the session, or `claude mcp list` for configured servers. An authenticated GitHub MCP can supply issue tools if its configuration exposes them and its credential permits them. Inspect actual tool schemas; names vary by server/version. A GitHub App named "Claude" is not proof that this Claude Code session has that MCP. |
| T3 Code | Use GitHub tools actually supplied to the selected provider/thread. T3 thread/delegation tools manage agents; GitHub MCP/connector/CLI operations manage issues. Tool availability and credentials must be checked in each runtime; another thread's successful call is not proof of access here. |
| Repository CLI | Use the commands below with existing approved authentication and an explicit `--repo Carberk/carberk` for release work. CLI credentials are separate from connected-app credentials. |

MCP servers expose capabilities; they do not grant repository access by themselves. GitHub MCP read-only mode removes write tools even when an issue toolset is configured. Missing tools require a supported configuration correction, not invented tool calls. Report capability mismatches and keep dependent dispatch held. Inspect only needed configuration metadata; keep tokens, cookies and authorization headers out of docs, issue bodies and tool output. Configuring or explaining another host does not authorize changing the release's model/provider.

For an authorized MCP write, pass the reviewed Markdown as the structured body argument and verify the resulting GitHub issue. For CLI writes, use a body file as below. Record the resulting issue number/URL in execution receipts; the issue holds live assignment, status and dependency updates.

Official references checked on 2 November 2026: [Claude Code MCP management/authentication](https://code.claude.com/docs/en/mcp), [GitHub MCP toolsets and read-only mode](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md), [issue-write permissions](https://docs.github.com/en/rest/issues/issues#create-an-issue), and [GitHub integration permission errors](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#resource-not-accessible).

## Read the part needed

```bash
pnpm agent:github issue 723
pnpm agent:github issue 723 --full
pnpm agent:github pr 724
pnpm agent:github execution 724
pnpm agent:github queue
pnpm agent:github comments pr 724 --limit 3
```

Reads return JSON. Bodies and comment text are bounded to 1,800 characters per section or comment by default; `--max-chars N` changes that limit. `--full` removes text bounds but still respects the selected comment count or list limit. Truncated text carries `truncated: true`; comment results report omitted history. Ordinary item reads omit the complete body, comments and formal PR reviews. An empty acceptance or Execution state list means no matching Markdown heading was found, not that the issue has no requirements or the PR has completed.

The queue lists up to 20 open PRs, including non-queue PRs, with `possiblyMore: true` when the limit is reached. It is a snapshot, not an ownership or merge-readiness verdict. Missing rows do not prove merge or closure. Check states remain their actual values, including pending or failure. Read formal reviews, older governing comments, full criteria and missing evidence explicitly before implementing, reviewing or merging. GitHub mutations and decision authority still follow the coding workflow.

## Write from a body file

Save the exact Markdown in a file in your own worktree or `/tmp`, then preview:

```bash
pnpm agent:github create-issue --title "<outcome>" --body-file /tmp/issue.md --label needs-triage --label infra
pnpm agent:github comment issue 723 --body-file /tmp/update.md
pnpm agent:github comment pr 724 --body-file /tmp/review.md
```

Add `--apply` to send an authorized write. Dry-run returns the argument array and body character count; applied writes return only the resulting URL. Comments are ordinary GitHub comments, not approving PR reviews. Review records must still follow Finalization and include the pinned SHA and attribution.

Direct CLI equivalents are `gh issue create --title "<outcome>" --body-file /tmp/issue.md`, `gh issue comment 723 --body-file /tmp/update.md`, and `gh pr edit 724 --body-file /tmp/pr.md`. Avoid embedding multiline Markdown in a shell command. The helper invokes argument arrays without a shell and prints no credential values.

All helper commands accept `--repo [HOST/]OWNER/REPO`. Without it, `gh repo view` resolves the current checkout. `pnpm test:agent-github` runs fixture tests without writing to live GitHub; it is included in repository tests and the local unit gate.

Upstream references: [gh JSON formatting](https://cli.github.com/manual/gh_help_formatting), [issue creation](https://cli.github.com/manual/gh_issue_create), [issue comments](https://cli.github.com/manual/gh_issue_comment), [PR editing](https://cli.github.com/manual/gh_pr_edit), and [GraphQL requests](https://cli.github.com/manual/gh_api). Context7 verified these through `/websites/cli_github_manual` on 2026-10-07; installed CLI flags were checked with `--help`.
