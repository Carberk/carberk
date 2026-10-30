# Transaction holder final IPC delivery — attempt 1

Bounded writer base: `0169758a2f1df2259c4ce236532e6a0f99e4d063`.
Branch: `agent/issue-901-holder-final-ipc-20261021-r1`.
Scope: actual test helper process and one root-discovered process-boundary test. No diagnostic authority spec, production guards, SQL, caller, budgets or timeouts changed.

The parent reports hosted run 39700863239 / DB job 119569543879 reached successful holder exit, backend-57P01 and connection-ended, then failed the original terminated-cleanly assertion. Producer exit and no-resurrected-OTP assertions were unreached. This attempt addresses missing final-phase delivery separately from the earlier health-probe diagnosis. Synthetic pressure reproduces unsafe shutdown; it does not establish the hosted runner's exact pressure.

## RED checkpoint

Command: `node --test scripts/campaign-transaction-holder.test.mjs`.
Runtime: Node v24.13.0, pnpm 12.11.2. Exit 1.
The test forks the actual helper with real IPC, replacing only external `pg`. At client.end, the boundary queues 8192 1KiB messages; the parent stalls 50ms on connection-ended, matching the supplied diagnostic reproduction.

- Backpressure case fails: `successful exit must include completion; observed advisory-held,backend-57P01,connection-ended`. Exit code was 0.
- Disconnected IPC fails: expected exit 1, actual 0.
- Missing-57P01, wrong-error and missing-end controls pass (exit 1 and no success phase).
- Node reports 6 tests, 3 pass / 3 fail (including the containing test).
- Full local output: `/tmp/holder-ipc-red-20261021.log`.

SHA256 before repair:

| File | SHA256 |
| --- | --- |
| scripts/testing/campaign-transaction-holder.cjs | `3de5bb484587e52199814e87043e47e21602eb4ac22bf245948442566307bf4a` |
| scripts/campaign-transaction-holder.test.mjs | `a255f7657c5779e0621b005c783facf992a85650e03395ff1c12b40bbe7d2d58` |
| packages/db/scripts/staging-reserved-fixture.e2e.spec.ts (protected) | `072f4884d5b8999d0f913d6bb89fa9b319ab55d22e1fdaebf21fbecde4f561bf` |

Docs: not applicable — internal helper shutdown and process-boundary test; no dependencies or external service APIs changed. DB overview inspected; no ownership or documented limitation changes require an overview edit.

Hosted acceptance remains required: the original test must reach every original assertion. Offline success cannot retire it or establish either hosted root's closure. No local services, Docker, deploy, CI mutation, integration push, merge or additional agents used.

## GREEN repair

RED checkpoint was committed and pushed as `775b65b04c441dc71923baf1b1aa67c18794216c` before the helper edit. The test remains byte-identical to that checkpoint.

The helper now awaits only the final `process.send` callback before its existing forced exit. A send error rejects into the existing exit-1 path. Intermediate phases, PostgreSQL termination/error checks and failure exit remain intact. No pressure traffic or instrumentation was added to the helper.

Same command: `node --test scripts/campaign-transaction-holder.test.mjs`, exit 0; 6 tests passed, 0 failed. The backpressure case observes terminated-cleanly at exit 0; all four failure controls observe exit 1 without success. Full local output: `/tmp/holder-ipc-green-20261021.log`.

Post-repair helper SHA256: `392fa64fe168e265ea15659d91a3817c66931dba9caf9b2448f640679a74eea9`.
Test SHA256 remains `a255f7657c5779e0621b005c783facf992a85650e03395ff1c12b40bbe7d2d58`.
Protected caller SHA256 remains `072f4884d5b8999d0f913d6bb89fa9b319ab55d22e1fdaebf21fbecde4f561bf`; `git diff --exit-code 0169758a -- packages/db/scripts/staging-reserved-fixture.e2e.spec.ts` passes.

Verification:

- `node --check scripts/testing/campaign-transaction-holder.cjs` and `node --check scripts/campaign-transaction-holder.test.mjs`: PASS. These root JS files have no workspace TypeScript or ESLint target.
- `pnpm check:agent-docs`: PASS (links, headings, context map and policy routing).
- Runtime gate initially failed because dist outputs were absent. `pnpm --filter @auto-tm/contracts build` passed; DB build initially required DATABASE_URL to load Prisma config. `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unreachable pnpm --filter @auto-tm/db build` then passed (generate/compile only, no DB connection). `pnpm check:runtime-imports`: PASS for db and contracts. Logs: `/tmp/holder-ipc-build-20261021.log`, `/tmp/holder-ipc-runtime-built-20261021.log`.
- `git diff --check`: PASS.
- First `pnpm test:root`: exit 1, 590 passed / 1 failed / 1 skipped. The reviewer-smoke file failed to import missing contracts dist because the root run began before the offline builds. After builds, `node --test scripts/staging-reviewer-flow-smoke.test.mjs`: exit 0, 6 passed. Full `pnpm test:root` rerun: exit 0, 597 tests / 596 passed / 0 failed / 1 skipped, including this helper regression. Logs: `/tmp/holder-ipc-root-20261021.log`, `/tmp/holder-ipc-smoke-recheck-20261021.log`, `/tmp/holder-ipc-root-built-20261021.log`.

No repository-wide unit/typecheck, hosted container suite or deployed acceptance was run in this bounded root-JS writer scope. Chief of Staff owns integrated candidate verification and the original hosted test's unreached assertions. This is the first repair attempt for final-phase delivery, not another health-probe guard attempt.
