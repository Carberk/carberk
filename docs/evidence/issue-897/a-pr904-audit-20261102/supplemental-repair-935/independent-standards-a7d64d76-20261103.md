# Issue 924 fresh Standards review, #938 bounded fixture repair, exact candidate a7d64d76

This is a fresh, independent, read-only review written on 2026-11-03 (UTC). It is a new receipt and does not replace or edit any earlier audit, review or receipt. #938 comment 6598737791 requested it.

## Verdict

**PASS. The Standards review of exact candidate `a7d64d768c5ac2893c78348650705e0bc1d203bb` found no blocking findings.** The bounded #938 fixture repair, and the stage-1 test-side changes assembled since the last #924-reviewed source (`ec2494b9`), satisfy `AGENTS.md` and `docs/agents/coding-standards.md` in the changed behavior. No production, migration, guard, dependency or configuration source changed.

This review does not claim #938 ticket acceptance, the 224-case full-coverage run, CI, protected delivery or Milestone A acceptance. Original A accounting stays 1 PASS / 10 OPEN. The A coordinator remains issue-update owner, and Parent retains acceptance.

## Immutable checkout and actual settings

| Item | Readback |
|---|---|
| Reviewer role | Fresh independent #924 Standards reviewer; did not implement the candidate |
| Owned isolated checkout | `/Users/bagtyyar/.t3/worktrees/carberk/t3-73aab263`, branch `t3/issue938-standards-review` |
| Reviewed HEAD / tree | `a7d64d768c5ac2893c78348650705e0bc1d203bb` / `08056e68d1a60a26b7c6e6adb765afb837a2f60d` |
| Executor input | `d131c6003e6fdb4dd3df7b9acad0da529f121820`, tree `711e5218062469c48644fc1c11ad1f51721d0c7c` |
| Released source repair | `ae9c01f6593e48c9375da192ee1794171bb2f6de` (assembled as `d106b2249518f6e9354d15a5a472138716d6d54b`) |
| Working state | Clean before this receipt (`git status --porcelain` = 0 lines); HEAD/tree unchanged at 08:24:15Z. Only this new, uncommitted receipt was authored. |

Actual `t3_thread_configure({})` readback, with no configuration mutation:

```json
{"modelSelection":{"instanceId":"claudeAgent","model":"claude-opus-5-5","options":[{"id":"effort","value":"high"},{"id":"fastMode","value":false}]},"runtimeMode":"full-access","interactionMode":"default"}
```

This matches the #938 6598737791 reviewer contract: `claudeAgent/claude-opus-5-5`, `effort=high`, `fastMode=false`.

## Source identity

- `git diff --name-status d131c600 a7d64d76 -- . ':(exclude)docs'` returned empty, exit 0. The same comparison against `ae9c01f6` also returned empty, exit 0. Non-documentation source equals both pins.
- The `apps/` patch of `d106b224` is byte-identical to the `ae9c01f6` patch, ignoring index/header lines. The only source paths in the patch are `apps/api/test/helpers/diagnosticPreparedReaderFixture.ts` and `apps/api/src/modules/identity/presentation/DiagnosticScopedDiscovery.e2e.spec.ts`.
- `git diff --quiet 7dc251d5 a7d64d76 -- packages apps/api/src ':(exclude)*.spec.ts' ':(exclude)**/testing/**'` exited 0, so there is no production source change. No `**/testing/**` path changed. The non-doc paths changed since `7dc251d5` are the four stage-1 e2e specs and the fixture helper only.
- The delta since the last #924-reviewed source `ec2494b9` adds `eec8e176f` (explicit completion tracking) and `c28817f53` (literal lifecycle ledgers and proof-detail read) to `d106b224`. All three are reviewed below.

## Required checks

| Check | Disposition | Basis (exact candidate) |
|---|---|---|
| Fixture `measurement_state` UPDATE privilege | **Correct, minimal, derived from a production consumer** | `diagnosticPreparedReaderFixture.ts:186` adds only `measurement_state` to the UPDATE list. The table was already granted SELECT (178) and DELETE (183). The grant loop at 191–193 issues `GRANT SELECT,UPDATE`. The consumer is production `PrismaAccountDeletionUnitOfWork.ts:54–58`, which runs `SELECT "epoch" FROM "measurement_state" … FOR UPDATE` and then `deleteMany`. PostgreSQL requires UPDATE privilege for a `FOR UPDATE` row lock. The fixture's real purge path reaches it (`purgeA`, `new PrismaAccountDeletionUnitOfWork(this.db).run`). The stage-1 failure evidence (`runtime-20261103T0645Z/result.md:12`) records exactly `42501 permission denied for table measurement_state` on that path. The role remains `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`, non-owner and non-member, checked at 224–228. No diagnostic table privilege widened. Production code was not bent to the test role. |
| Single Prisma teardown | **Correct** | `close()` at 458–461 is now `app.close()` → else `module.close()` → else `client.onModuleDestroy()`. `PrismaService.onModuleDestroy` (`packages/db/src/prisma.service.ts:30–33`) runs `$disconnect()` and then `pool.end()`, which is not idempotent. The stage-1 failure (`result.md:11`) was `Called end on pool more than once`. `PrismaService` is provided by the global `PrismaModule` (`apps/api/src/common/prisma.module.ts:4–9`), which `DiagnosticsModule` imports (`diagnostics.module.ts:38,45`). The fixture overrides it with `this.db` (`:232`), so Nest's destroy hook owns the single close whenever an app or module exists. The explicit close is kept only when the client exists but no module was compiled. The `live_receipts` count (452–457) still runs before shutdown. Runtime r2 shows all seven receipts, including the three `discovery` cases on the `$extends` client, with `roleBackends: 0`, `roleAbsent: true`, `guardModesRestored: true` and `failures: []`. Its stdout and stderr have 0 `prisma_close` and 0 `42501` matches. |
| Prisma 7 `DriverAdapterError` assertion | **Correct; oracle strength preserved** | `DiagnosticScopedDiscovery.e2e.spec.ts:52–54` asserts `{ name: "DriverAdapterError", cause: { originalCode: "P0001", originalMessage: "diagnostic_identity_evidence_immutable" } }`. This replaces the Prisma 6 `meta.driverAdapterError.cause` path, keeps both literal values and adds the error name. `reached === true` (51) and unchanged stored evidence (55) remain. The assertion is not vacuous: if the trigger stopped firing, `illegalProvenanceRewrite` would return `938_immutable_write_unexpectedly_succeeded` (fixture 418), whose name is `Error` with no cause, and the assertion would fail. Runtime r2 `stage-vitest.stdout:6597–6619` shows the real `DriverAdapterError` from `@prisma/adapter-pg@7.8.0` with `cause.originalCode: 'P0001'` and `originalMessage: 'diagnostic_identity_evidence_immutable'`. The `packages/db/package.json` pins are `^7.6.0`. The guard is raised by the unchanged migration `20261021130000_diagnostic_identity_evidence/migration.sql:152,177`. |
| Preserved original guards and oracles | **Preserved** | Since `ec2494b9`, the only removed `apps/` lines are the replaced assertion shape, the old UPDATE list line, the unconditional `prisma_close`, the `record` signature, the `"first observation"` ledger label (renamed to `"first raw"` and referenced nowhere else in `apps/`), and the `result`→`completion` lines. No `expect` was deleted. No `.skip`, `.only`, `.todo`, `skipIf` or `runIf` appears in the changed files. Trigger enabling and restore are unchanged, and `guard_restore` (489–496) still fails closed. The memory refusal `DiagnosticMemoryDatabase.ts:102` ("Prepared source acceptance requires real PostgreSQL") is unchanged (diff exit 0). The five unchanged 168-case suites and the original `.spec.ts` files are untouched. The `it(` counts in the four stage-1 e2e files are 1/1/2/3 = 7, matching the seven exact case names in `runtime-r2/packet/stage-command.json`. The partial-initialization control (`DiagnosticErasedPredecessorReaders.e2e.spec.ts:69–74`) keeps its sentinel and its full `failures: []` cleanup oracle. |
| Helper completion (`eec8e176f`) | **Correct** | `withPreparedReaderFixture` (505–518) tracks success through `completion = { value }`, so a `void` callback returns `undefined` legitimately. Cleanup still runs first. Cleanup failures aggregate with the original error, the original error is rethrown, and a missing completion still fails with `938_fixture_missing_result`. |
| Ledger assertions (`c28817f53`) | **Compliant** | The expected ledgers are literal arrays (Tests §6). `record` still asserts each version (302–305). The `persisted()` read (307–309) is used only for unchanged-version checkpoints, as the comment at 306 states and as released in #938 Parent 6592324086. The proof-detail read goes through the real HTTP interface (`DiagnosticContinuityHandoff.e2e.spec.ts:9`). |

## Non-blocking observation

- **O1 (informational).** The explicit-close branch at `diagnosticPreparedReaderFixture.ts:461` (client created, no module compiled) is not exercised by any of the seven cases. The partial-initialization sentinel fires at line 253, after `app.init()`, so that control covers the `app.close()` path. The branch is defensive cleanup inside a test fixture, not product behavior, and failure there would still fail closed at `role_cleanup` (`live_runtime_role_backends`). No action is required for this bounded repair. A future fixture revision could add an earlier-stage control if desired.

## Commands (read-only)

- `git rev-parse HEAD HEAD^{tree}`, `git status --porcelain=v1`, `git worktree list`, `git branch -vv`
- `git rev-parse <pin>^{tree}`, `git cat-file -t` for `d131c600`, `ae9c01f6` and `d106b224`
- `git diff --name-status|--stat|--quiet` across `d131c600`, `ae9c01f6`, `ad4d1821`, `dfb84ee8`, `ec2494b9` and `7dc251d5` against `a7d64d76`, excluding docs (or including only production paths)
- `git show d106b224 -- apps`, compared with `git show ae9c01f6 -- apps`; `git log --oneline ec2494b9..a7d64d76`
- `git grep` and `grep` source reads of the fixture, the four stage-1 e2e specs, `prisma.service.ts`, `prisma.module.ts`, `diagnostics.module.ts`, `PrismaAccountDeletionUnitOfWork.ts`, `DiagnosticMemoryDatabase.ts`, the guard migration and `packages/db/package.json`
- Evidence reads under `docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103/recovery-stage1-20261103-r1/` (`runtime-packet-20261103/runtime-20261103T0645Z/result.md`, `fixture-runtime-repair-20261103-r1/repair-packet.md`, `runtime-r2/result.md`, `runtime-r2/owned-output/stage-vitest.{stdout,stderr}`, `runtime-r2/packet/stage-command.json`)
- `gh issue view 897|924|938` (read only); `t3_thread_configure({})` readback

No package, install, build, typecheck, lint, test, service, database, storage, Docker, hosted, native, PR, ref or issue-write command ran. No source, test or prior receipt was edited.
