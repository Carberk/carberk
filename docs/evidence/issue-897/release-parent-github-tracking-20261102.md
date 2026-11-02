# GitHub tracking correction — 2 November 2026

Founder requires GitHub Issues for release task contracts, assignments, dependencies and status. The repository already named GitHub as its issue tracker. No founder decision authorized the document-only A tracker. Maps and execution receipts remain evidence, not substitutes for issue pages.

The attempted migration of A-01 through A-11 failed. The connected integration returned `403 Resource not accessible by integration` from issue creation; no issue was created. The batch incorrectly continued through all eleven permission failures. Future writes stop at the first such refusal. No alternate tool, credential or endpoint has been used to bypass it. The earlier PR-creation refusal remains preserved and has not been retried.

GitHub documents this message as insufficient token permissions. Issue creation requires `Issues: write`. Repository ownership does not automatically grant the connected app that permission. The returned error is not evidence of API rate limiting, nor an explanation for the earlier tracking decision.

Current A checkpoint is `a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568`. Its assembled source is `4199eb86d4846fecc6b53edca6c447ec868b1566`; the later interval is documentation only. A is 1 PASS / 10 OPEN and unaccepted. A has no active child, verification process or runtime resource. New dispatch is held until the relevant real GitHub issue and exact contract exist.

Draft migration bodies are preserved in `/tmp/carberk-a-github-issue-migration-20261102/`. They require current-SHA reconciliation and real issue-number dependencies before publication. They are not a replacement tracker or evidence of successful migration. Parent remains the sole migration writer under [campaign #897](https://github.com/Carberk/carberk/issues/897), while the A coordinator retains assembly and dispatch ownership.

The [tracking-before-dispatch rule](../../agents/issue-tracker.md#required-tracking-before-dispatch) now covers selection, recovery, refusal handling and future cleanup. Its AGENTS.md pointer makes it part of future agent entry instructions. After release acceptance, a GitHub cleanup task will reconcile issue links and inventory evidence to keep, archive or remove. No cleanup deletion is authorized now.

Permission correction must occur on the GitHub app installation/connection, with access to `Carberk/carberk` and the requested issue-write permission. The repository owner can review installation access; if the app does not request write permission, its provider must add that capability. Once corrected and verified, resume the prepared migration without duplicating existing issues or workers.

Sources: [GitHub permission errors](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#resource-not-accessible), [issue creation permissions](https://docs.github.com/en/rest/issues/issues#create-an-issue), [installed app access](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).
