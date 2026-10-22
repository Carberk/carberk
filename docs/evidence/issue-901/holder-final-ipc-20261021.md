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
