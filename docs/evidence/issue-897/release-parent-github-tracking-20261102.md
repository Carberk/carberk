# GitHub tracking correction — 2 November 2026

The [3 November migration receipt](#verified-issue-migration-3-november-2026) records the later successful access correction. The refusal and configuration observations below remain historical evidence.

Founder requires GitHub Issues for release task contracts, assignments, dependencies and status. The repository already named GitHub as its issue tracker. No founder decision authorized the document-only A tracker. Maps and execution receipts remain evidence, not substitutes for issue pages.

The attempted migration of A-01 through A-11 failed. The connected integration returned `403 Resource not accessible by integration` from issue creation; no issue was created. The batch incorrectly continued through all eleven permission failures. Future writes stop at the first such refusal. No alternate tool, credential or endpoint has been used to bypass it. The earlier PR-creation refusal remains preserved and has not been retried.

GitHub documents this message as insufficient token permissions. Issue creation requires `Issues: write`. Repository ownership does not automatically grant the connected app that permission. The returned error is not evidence of API rate limiting, nor an explanation for the earlier tracking decision.

Current A checkpoint is `a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568`. Its assembled source is `4199eb86d4846fecc6b53edca6c447ec868b1566`; the later interval is documentation only. A is 1 PASS / 10 OPEN and unaccepted. A has no active child, verification process or runtime resource. New dispatch is held until the relevant real GitHub issue and exact contract exist.

Draft migration bodies are preserved in `/tmp/carberk-a-github-issue-migration-20261102/`. They require current-SHA reconciliation and real issue-number dependencies before publication. They are not a replacement tracker or evidence of successful migration. Parent remains the sole migration writer under [campaign #897](https://github.com/Carberk/carberk/issues/897), while the A coordinator retains assembly and dispatch ownership.

The [tracking-before-dispatch rule](../../agents/issue-tracker.md#required-tracking-before-dispatch) now covers selection, recovery, refusal handling and future cleanup. Its AGENTS.md pointer makes it part of future agent entry instructions. After release acceptance, a GitHub cleanup task will reconcile issue links and inventory evidence to keep, archive or remove. No cleanup deletion is authorized now.

Permission correction must occur on the GitHub app installation/connection, with access to `Carberk/carberk` and the requested issue-write permission. The repository owner can review installation access; if the app does not request write permission, its provider must add that capability. Once corrected and verified, resume the prepared migration without duplicating existing issues or workers.

On 2 November 2026 the ChatGPT GitHub connection was changed from `Allow low-risk actions` to `Allow all actions` and read back successfully. A single retry of the identical A-01 create request still returned `403 Resource not accessible by integration`. The remaining refusal is therefore at GitHub app installation/repository scope or the app's granted `Issues: write` permission. No further write retries were made.

Sources: [GitHub permission errors](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#resource-not-accessible), [issue creation permissions](https://docs.github.com/en/rest/issues/issues#create-an-issue), [installed app access](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).

## Live access read-back, 2 November 2026

The connector's `github_get_user_login` returned `bagtyyarkovusov`. `github_list_installations` returned only personal installation `167479145`, with `repository_selection: all`; it returned no Carberk organization installation. Installed-repository searches for `Carberk/carberk` and `carberk` both returned empty lists. No access correction or issue-write success has been verified, and no new write retry was sent.

Signed-in Chrome's personal Applications page identifies installation `167479145` as **ChatGPT Codex Connector**. The separate **Claude** app in that list does not establish Claude Code MCP availability or Carberk organization access. The earlier organization Applications read showed only blacksmith.sh. Opening the Codex connector configuration previously reached GitHub's sudo password form. During this follow-up, Chrome input was stopped after two `The user changed '/Applications/Google Chrome.app'` refusals; no permission change or password entry was performed.

A bounded local metadata check found the Claude CLI installed, no global `mcpServers` entries in `~/.claude.json`, and no repository `.mcp.json`. This does not exclude plugin, connector or T3-injected servers. Verify `/mcp` and the active session's exposed tools rather than inferring access from those files. No Claude model was run and no server was installed.

[GitHub operations](../../agents/github-operations.md#verify-the-active-connection) now gives Codex, Claude Code, T3 and CLI instructions without sharing credentials or treating one host's access as another's. `CLAUDE.md` already imports `AGENTS.md`, so both entry points reach the GitHub-first gate. The existing A coordinator will receive the immutable documentation checkpoint; this is a policy handoff, not authorization to resume tickets or create a second tracker. A acceptance and B/C/activation gates remain unchanged.

## Verified issue migration, 3 November 2026

The connected app now returns Carberk organization installation `177915268`, authenticated login `bagtyyarkovusov`, and repository coverage for `Carberk/carberk`. Authorized issue writes and exact body readbacks succeeded through the same connected app after that correction. The earlier 403 and PR-creation refusal remain preserved; no alternate transport or PR-creation retry was used.

The live [parent issue comment](https://github.com/Carberk/carberk/issues/897#issuecomment-6585003890) links all eleven A gates, #924 through #934, plus supplemental audit repair #935. Each actual issue records its owner, exact base, paths/resources, dependencies, non-goals, commands, evidence and acceptance. [Readback hashes](release-parent-github-migration-20261103.json) establish the published bodies; GitHub owns later changes. This receipt does not establish a second task map.

The migration corrected stale source wording. Candidate `a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568` includes A-02's assembled preparation source `4199eb86d4846fecc6b53edca6c447ec868b1566`; their non-documentation comparison exits 0. `4b2c8a6f6161f9c825945637f6f848c64adeb145` remains the earlier accepted UI S1/S2 source. Its bounded PASS does not pass the supplemental audit, real A-02 cases or milestone.

The existing A coordinator received the real issue map for read-only contract/access validation and readiness reporting. No worker was started or duplicated. PR #904's published ref remains unchanged. No package test, service, DB, hosted, reset, build, device, deployment or cleanup action ran. All issues remain open pending protected campaign finalization; original-eleven disposition is still 1 PASS / 10 OPEN, with #935 an additional open repair. A acceptance and B/C/activation gates remain closed.

## Fresh issue-contract clarity audit, 3 November 2026

A fresh read-only GPT-6.1 Sol context reviewed parent #897, A issues #924–#934, supplemental #935, their comments, candidate evidence links and PR identity. It found and corrected stale current authority, broad immutable-evidence write scopes, phase wording that looked circular, the pre-assembly A-02 snapshot label, non-portable `/tmp` matrix references, missing mobile selectors and the incorrect `apps/mobile/app.json` path. The exact findings and read-only exclusions are in [the audit receipt](release-parent-github-issue-audit-20261103.json); the [parent audit comment](https://github.com/Carberk/carberk/issues/897#issuecomment-6586432005) is the live notice.

All affected issue bodies were read back after update. They remain OPEN and unassigned. The coordinator still must record the named writer/worktree, issue-update owner, exact settings and serialized resources before any dispatch. A remains 1 PASS / 10 OPEN and unaccepted; #935 remains OPEN and undispatched.
