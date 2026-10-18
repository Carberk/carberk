# GitHub organization and UI purpose evidence, 18 October 2026

The parent delivery owner audited all 79 open issues and eight draft PRs, then applied the bounded organization changes recorded below. The post-action inventory contains 72 open issues and two retained draft PRs, #904 and #557. These are GitHub organization results, not campaign completion or release acceptance.

## Evidence and actual changes

[All 79 issue dispositions and rationale](github-audit-dispositions-20261018.md) preserves the original read-only recommendations. Recommendations in that document are not an action log. [Before/after inventories and actual actions](github-organization-inventories-20261018.json) preserve the source records with SHA256 digests. The original files remain in `/tmp/carberk-campaign-delivery-20261014/`.

Six superseded draft PRs were closed after comments preserved their delivery history. Their branches and exact heads are retained here. These six branches were preserved during cleanup.

| PR | Preserved branch | Preserved head | Closure evidence |
|---|---|---|---|
| #834 | `agent/issue-833` | `f666cf4fd52d3c72b81cf3c1b9d1226287dd8a21` | [Comment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/834#issuecomment-6246525932), close command exited 0 |
| #835 | `agent/issue-823` | `99963c763199d234a5e6cdf66b47fd2739f6d493` | [Comment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/835#issuecomment-6246526981), close command exited 0 |
| #842 | `agent/issue-841` | `8aa68c1294bebe9464b8fef2bca929b83b1eec0a` | [Comment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/842#issuecomment-6246528037), close command exited 0 |
| #844 | `agent/issue-843` | `343688176c38f44898938e54a2d5ef8f88f13817` | [Comment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/844#issuecomment-6246529290), close command exited 0 |
| #845 | `agent/issue-837` | `85da4c42943231d9790067621933e6f37d54cef0` | [Comment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/845#issuecomment-6246530370), close command exited 0 |
| #846 | `agent/issue-824` | `705a14418bea39f9521c123d94d086645d44ec40` | [Comment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/846#issuecomment-6246531808), close command exited 0 |

Seven issues were closed. #752 is completed by merged #857, squash `f8f245f3b1a7852393e0e1736c07e075fecb45f7`, and #853 execution comment `6139211969`, including compiler timing and compatibility evidence. Planning issues #500 and #604 through #608 were completed with remaining execution handed to live issues. Their closure does not activate services.

The parent also updated #602 and #746 titles and body status prefaces while preserving founder scope, and applied nine corrections using existing labels to #847, #815, #856, #624, #599, #711, #763, #746 and #777. The action record identifies each label addition and removal. Other recommendations remain historical recommendations. In particular, #873 stayed open because its volume requirement was not transferred to #901. The audit ledger proposed that transfer as a prerequisite to closure; neither the transfer nor closure occurred.

## UI purpose and runtime limits

[Source-only purpose matrix](ui-purpose-source-audit-20261018.md) records screen entry, the purpose of controls and text, Back and recovery paths, and visible account and business boundaries at `9f3fb6aca45694578ae63681e1d6772d5c184c51`. It is a grouped source map, not an exhaustive string inventory or rendered acceptance. It identifies two accepted P2 findings: History child forms fail to release busy state after rejected server-action promises; delivered History report cards omit required filename and size. An isolated fixer owns those files. No fixes or runtime proof are claimed by this documentation checkpoint.

Required runtime evidence remains open: interruption and recovery of browser calls to Next server actions, native media and PDF handling, navigation, Back and account switching, text layout and accessibility, reserved deployed campaign acceptance, independent operational monitoring topology, and latest-main staging restoration. T3 browser calls timed out in three bounded attempts. Upstream HTTP tests and source inspection do not replace these gates. The parent owns final criterion reconciliation through #886, #919 and #920, and protected PR #904 finalization.

## Fixture RED and cleanup boundary

Parent-verified hosted PR Checks [39104191526](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/39104191526), database job `117606486050`, at `83d8acf38d1837be0c4f860193903af365569d55` reached the actual migrated disposable PostgreSQL lane. Exactly the four intended campaign fixture assertions at lines 136, 170, 191 and 206 expected exit code 0 and received exit code 1; 280 other tests passed. This is genuine behavioral RED against the intentionally unavailable campaign adapter. Full log remains `/tmp/carberk-campaign-delivery-20261014/fixtures-red-db-39104191526.log`. The implementation was subsequently incorporated as `59ed534600c1ef3cc308e6a80bfbcbab4a1500ce`. Hosted SQL verification is pending in PR Checks run `39104576573`; no GREEN result is claimed here.

The proposed profile covers four synthetic identity prerequisites and tracking of authentication records only. Broader campaign graphs remain blocked. Cleanup of OTP delivery jobs and sink records is unsupported, so post-OTP reset must refuse and staging activation remains blocked even if later identity seed tests pass.

The parent subsequently verified garbage-collection apply session 85753 completed with exit code 0. The terminal result records exactly 12 worktree removals, 12 conditional branch deletions and a metadata prune, with `failed: null` and no skipped actions. [Exact operations, SHA tuples and preservation decisions](worktree-cleanup-20261018.json) preserve the terminal evidence. Process scanning included the current process among 503 entries; the Claude scan completed with zero sessions. The parent observed 145 remaining live worktrees after a concurrent isolated UI checkout was created. This differs from the earlier read-only eligibility estimate; the terminal operations are authoritative.

Preserved worktrees include dirty trees, active process/session ownership, locked checkouts, work for open PR #904, app-managed checkouts, evidence, prototype and research work, PRs closed without merging and heads lacking a safe merged-PR match. The six superseded draft PR heads above remain preserved under the closed-without-merging rule. No second cleanup run was performed. This assembly checkpoint performs no GitHub mutation, staging, device or browser operation, or SMTP send.
