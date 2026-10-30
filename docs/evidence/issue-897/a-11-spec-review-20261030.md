# A-11 independent Spec review, 30 October 2026

Verdict: **FAIL/open**. Missing acceptance evidence and failed gates remain
blocking. This report does not duplicate the accepted A-01 Standards finding
S1 and does not authorize A-09 by itself.

- Reviewed source: `52d901c50af1dde97ea22bda8efb1fdf21f169b1`.
- Actual checkout: `69948805f6f41f199634300ba2fbaf8c38630be1`.
- Worktree/branch: `/Users/bagtyyar/.t3/worktrees/carberk/t3-a38766b5`,
  `t3/issue-897-milestone-a-spec-review-1`.
- Reviewer: OpenAI T3 Code Codex, `codex_work`, `gpt-6.1-sol`,
  `reasoningEffort=xhigh`, `serviceTier=priority`, full access. Read-only.
- Main base: `9fde309c3da17f2661fe9c266504e6e56a1b97c9`.

Post-base commits are documentation-only. The source/test/migration/config
comparison exited 0. No runtime resources, edits, or accepted-work reruns were
used.

## Blocking findings

- **A-02 FAIL.** The map requires: “PASS when restricted-role erasure is
  private and complete, capacity refusal is bounded, rollback leaves no partial
  ownership, and both race orders converge without duplicate delivery or leaked
  data” (`a-wayfinder-ticket-map-20261030.md:85-88`). Restricted preparation
  passed 12/12, but all ten ownership/capacity/rollback/race bodies were skipped
  at the missing ordinary fixture manifest (`a-02-worker-restricted-20261030/receipt.md:3,33-48`).

- **A-04 FAIL/open.** The map requires: “PASS when all refusal/rollback/expiry
  paths preserve state, lawful disposal drains only the reserved namespace, and
  the isolated fixture is restored” (`a-wayfinder-ticket-map-20261030.md:140-142`).
  Offline checks were 181/181 and 51/52; Railway-focused checks were 37/59;
  retained-schema restoration is RED because four migrations are omitted
  (`a-04-reset-runtime-20261030/receipt.md:31-34,45-55`; `restoration-profile-red.json:4-23`).
  Real PostgreSQL and hosted restoration remain unproved.

- **A-03 remains open.** Its criterion requires “every required cell” green and
  private bytes/IDs inaccessible across namespaces (`a-wayfinder-ticket-map-20261030.md:112-116`).
  The caller/closure matrix remains queued with only partial historical evidence
  (`milestone-a-execution-20261029.md:23`).

- **A-05 through A-10 remain open.** Native locale/protected-runtime proof,
  combined CI, deployed acceptance/restoration, exact APK/AAB artifacts, and
  protected merge are explicitly pending (`a-coordinator-handoff-20261030.md:27-28`;
  `a-wayfinder-ticket-map-20261030.md:163-166,186-188,208-210,230-232,272-274`).

No post-base unrequested behavior or additional incorrect implementation was
found. B prototype work and analytics activation remain excluded. A-09 may
address only accepted A-01 S1 paths; A-11 adds no source-fix path.
