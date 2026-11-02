# Issue 935 offline prerequisite block

Implementation did not reach behavioral RED. No production code or tests changed.
The authorized API selector failed before test execution because the isolated
checkout lacks the compiled `@auto-tm/db` entry point. All repair and acceptance
criteria remain OPEN.

## Identity and authority

- Executor: `issue935-supplemental-repair-20261103-r1`.
- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-57c0ba42`.
- Owned branch: `agent/issue-935`, reserved and pushed before evidence writes.
- Preserved scaffold: `t3/57c0ba42`.
- Supplied base and unchanged source commit: `a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568`.
- Base tree: `1c10140203e24f8baff1a2ce5efb2ddd6c79c123`.
- Non-documentation source pin: `4199eb86d4846fecc6b53edca6c447ec868b1566`.
- Host settings verified during identity preflight and reverified by coordinator
  before release: `codex_work/gpt-6.1-sol`, `reasoningEffort=xhigh`,
  `serviceTier=default`, runtime `full-access`. No settings were changed.
- Release: https://github.com/Carberk/carberk/issues/935#issuecomment-6587616493.
- Exclusive slot: `issue935-offline-20261103-r1`.

The live parent body was reread and matched the prior preflight read exactly.
The updated issue 935 body and all three execution comments, including the
release, were read before the branch reservation. The coordinator remains the
sole issue-update owner and assembler. No issue or PR was mutated.

## Attempt and result

The exact API selector from reservation 6587307330 ran once, sequentially, with
`AUTO_TM_TEST_DATABASES=off` and `--maxWorkers=1`. Its full argument array,
UTC start/end, elapsed duration, exit and raw-log checksum are in
[api-prerequisite.command.json](api-prerequisite.command.json). The unedited
output is [api-prerequisite.raw.log](api-prerequisite.raw.log).

It started at `2026-11-02T20:30:15.116411+00:00` and ended at
`2026-11-02T20:30:19.027645+00:00`, duration 3.896353583 seconds, exit 1.
Vitest failed in `apps/api/test/globalSetup.ts:7` while importing
`PrismaService` from `@auto-tm/db`:

```text
Error: Failed to resolve entry for package "@auto-tm/db". The package may have incorrect main/module/exports specified in its package.json.
Serialized Error: { code: 'ERR_RESOLVE_PACKAGE_ENTRY_FAIL' }
```

The output's earlier "No test files found, exiting with code 0" is not a pass.
The complete command exited 1 with the global-setup error. No test body or
behavioral RED/GREEN was established. No RED checkpoint or source fix exists.

## Unexpected dependency setup

Before the selector, root/API/admin `node_modules` and both shared-package
`dist` directories were absent. The authorized `pnpm exec` automatically copied
1,036 packages from the existing pnpm store, with zero downloads, and ran the
Prisma preinstall script. No explicit install command was invoked. This setup
was unexpected under the release's no-install constraint; no further package
command, cleanup or workaround followed.

Root and API dependency directories now exist. Admin dependencies, Prisma
generated output, and the compiled DB/contracts exports remain absent. See
[prerequisites.json](prerequisites.json) and
[post-probe-prerequisites.json](post-probe-prerequisites.json) for before/after
path observations. Ignored dependency output is preserved for the coordinator.
Tracked dependency versions, lockfile and configuration are unchanged.

## Exact missing prerequisite and next owner

The immediate import blocker is `packages/db/dist/src/index.js`, the configured
runtime entry for `@auto-tm/db`. The DB declarations, `@auto-tm/db/testing` entry,
Prisma generated output, and `packages/contracts/dist/index.js` plus declarations
are also absent. Their absence is a static prerequisite observation, not a
claim that every later failure has been diagnosed. Admin dependencies are absent
and its selector was not attempted because another automatic setup could repeat.

The coordinator must provide a separate, explicit prerequisite-preparation
contract for this same writer/checkout, including how to handle pnpm automatic
setup and source-matching shared-package compiled/generated artifacts, before
renewing the bounded offline repair. No build, generated-source workaround,
dependency symlink, configuration change or package install was attempted to
bypass this block. The existing source must remain pinned or be explicitly
repinned before continuation.

The admin selector and API/admin TS7, TS6 and lint were not run. Their post-GREEN
gate was never reached. Real DB suites, runtime, builds, services, resets,
hosted/deployed/native checks and all later acceptance remain unrun. Fresh
coordinator assembly/affected verification and independent exact-SHA Standards
and Spec review are still required.

## Preservation and terminal handoff

All source, tests, twelve mechanical callers, clock composition, mutation
timestamps, expiry comparisons, permission policy, locks/barriers, rollback,
no-op and existing outcomes remain unchanged. AUDIT-S2 and AUDIT-S3 are still
unrepaired. No repository-module mock was added or removed.

[preservation.json](preservation.json) records direct non-doc equality and
configuration/lockfile equality to the supplied base, both exit 0, and matching
Git blobs plus SHA-256 hashes for all nine historical audit-directory files.
Only new evidence under this supplemental directory is changed.
[path-audit.json](path-audit.json) enumerates the complete delivery diff.

`git diff --check` exited 0. The staged full-diff check exited 2 solely for a
new blank line at EOF in the unedited `api-prerequisite.raw.log:59`. Its bytes
and checksum are preserved. The separate authored-file check excludes only
raw logs; exact commands, times and outcomes are retained in
[diff-check.command.json](diff-check.command.json).

The source commit remains the supplied base. The separate evidence commit is
the commit containing this receipt; its exact SHA is returned in the terminal
handoff after push. The offline slot is idle at terminal handoff. The coordinator
must explicitly release or renew its issue reservation. No child, other
worktree, background package command or service was started.
