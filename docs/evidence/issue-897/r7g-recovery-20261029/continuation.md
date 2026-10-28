R7g prerequisite recovery and reached RED, 2026-10-29

Supersedes the missing-six-path condition in checkpoint.md. That older source-only checkpoint and its evidence remain unchanged as history. Current capability acceptance is OPEN, not accepted. No compiler/test/build/DB command has started during the worker timing interval that followed the first released interval.

At 6ee05a50 all 18 maintenance paths are byte-identical to old-owner head c7d6c37a04c0a214954aa8d8224d6a33a741db9c, tree e24dbaad1039ca1e95f7598783202186d05db1e4. The six prerequisites were recovered exactly, plus CONTEXT.md from the same lineage to remove the temporary missing-wiring note and reconcile its now-active source descriptions. Nothing was cherry-picked wholesale; no other old branch/base changes entered this checkout. No old checkout command or mutation occurred.

The exact six-file delta from fd8e5558 to 6ee05a50 is `/tmp/897-r7g-recovery-20261029-prerequisite.patch`, SHA256 `e5941f1cab4718fdce22b67dd16143df853dde1a9f2f9f6f3d21e028bc9ccfc0`. The machine-readable receipt contains the actual hash, source file hashes, literal failing titles and raw RED receipt hash.

Prerequisite delta, additions/deletions:

- scripts/demo-inventory/remove.ts: +9/-85. Retains marker/contact discovery, refuses nonempty physical User deletion before storage/row effects, empty namespace stays a no-op.
- scripts/promote-admin.ts: +4/-10. Retains parsing, exact locking selectors and campaign checks; role/audit adapters remain explicitly unsupported.
- scripts/reviewer-scenario.ts: +3/-383. Removes duplicate inline adapter and imports recovered PrismaReviewerScenarioSeedStore. Target/config/cleanup behavior is retained.
- scripts/ui-fixture.ts: +13/-8. Existing User replacement refuses before effects; Listing deletes/creates use finite maintenance helpers. Existing first-import target guard and photo behavior remain.
- src/promote-admin.ts: +3/-18. Dry-run/admin no-op and validation remain; real role/audit mutation refuses.
- src/promote-admin.spec.ts: +19/-0. Adds before-effect refusal coverage. The complete original file remains a byte-identical prefix, so original success and audit-rollback assertions survive.

Configured dependency verification during the released interval:

- contracts build PASS.
- DB build PASS, Prisma7.8.0 generation using unreachable localhost port1, no DB contacted.
- TS7 and TS6 each FAIL on pre-existing fixtures' direct apps/worker/node_modules/bullmq and ioredis imports and resulting missing inherited methods. A configured offline worker dependency install then PASSed, 423 packages reused, no downloads; no worker source/process/service touched. Compiler rerun is still pending.
- Focused unit command in prerequisite-and-red.json at6ee05a50:72 tests,63PASS/9FAIL. Collection now works after contracts build. Raw receipt is `/tmp/897-r7g-recovery-20261029-original-unit.json`. No SQL/MinIO/loaded-V8 proof yet.

RED was committed/pushed at268236f3 before the one authorized correction ataf59cd86. Coordinator permitted removing only displayName from the held-added protected-field refusal matrix, since accepted displayName convergence has its own passing test. The correction removes that parameter and its now-unreachable setup branch; all protected-field assertions, all original tests and the convergence test remain unchanged. GREEN is pending worker interval release. No new production behavior was authored.

The current original eight unit capability failures remain requirements, not waived assertions. Literal titles and their raw receipt hash are in prerequisite-and-red.json. Their mappings/proposals were sent by agent message to coordinator mcp:ac0bb7f1-e0a9-4ffa-b92b-fb4b4b91e833:

1. Five promotion tests require exact phone/verified-email selection, User.role admin transition and exact contact-free ADMIN_BOOTSTRAP_PROMOTE audit atomically, with rollback on audit failure and original reason preserved. Production path scripts/promote-admin.ts -> src/promote-admin.ts currently refuses. Existing account_schedule/restore permits deletionScheduledAt only; no role-promotion finite operation exists. Staff grants are a different authority. Minimal compatibility dependency is an exact role-transition plus audit finite command with locked/revalidated selector and unchanged campaign policy, supplied by the shared-kernel owner, followed by bounded adapter wiring.
2. Two reviewer tests require stable fixed User IDs, contact rotation or revoke tombstone/email clear, owned Session removal/device invalidation and audit without secrets or partial effects. Production path scripts/reviewer-scenario.ts -> scripts/reviewer-scenario-store.ts -> src/reviewer-scenario-seed.ts currently refuses those complete plans. sign_in_method_change permits exactly one nonempty verified contact pair on one User; session_change does not represent the joint contact/device operation. Minimal compatibility dependency is an explicitly accepted exact reviewer rotation/revoke compound plan with all ownership/privilege checks and whole-plan rollback, not arbitrary role authority or partial cleanup.
3. One tester test requires whole-list atomic schedule, owned Session removal and active Listing archive. Production path tester command -> src/tester-accounts.ts -> src/PrismaTesterAccountStore.ts refuses Session-bearing plans. account_schedule derives personal Listing archive but not Session deletion and its explicit rows permit Users only. Minimal compatibility dependency is exact owned Session-delete closure for the accepted schedule plan, keeping one preparation/transaction and the existing30s timeout, then adapter wiring. Separately, this original oracle postpones an earlier schedule to NOW, whereas the accepted finite finding requires preserving earlier schedules. This policy conflict is sent to coordinator; neither oracle nor behavior is silently changed.

The source evidence for these gaps is diagnostic_source_allows and parse in migrations20261023130000 and20261025015000, plus account_effects in20261024060000. These are read-only dependencies. No migrations, schema, shared kernel, worker, authority, budgets or original assertions changed.

Next after explicit worker release:

```sh
pnpm --filter @auto-tm/db typecheck
pnpm --filter @auto-tm/db exec tsc6 --noEmit
pnpm --filter @auto-tm/db exec vitest run src/reviewer-scenario-seed.spec.ts -t 'preflights an unsupported final reviewer|converges displayName-only drift' --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-scalar-green.json
COMPOSE_PROJECT_NAME=candidatea-r7g pnpm --filter @auto-tm/db exec vitest run tests/maintenance-finite.r7g.e2e.spec.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-restricted.json
COMPOSE_PROJECT_NAME=candidatea-r7g pnpm --filter @auto-tm/db exec vitest run tests/promote-admin.command.test.ts tests/tester-accounts.e2e.spec.ts tests/demo-inventory.seed.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-original-db.json
```

DB/MinIO must remain disposable, dynamically mapped ports and unique database/role namespaces. No shared5432/6379/9000, no staging, no native/browser/Metro. Notify coordinator before any timing-sensitive budget checks. Full original capability run and fixture cleanup/repair still need real evidence; old29/29 and12/21 remain historical only. Meaningful RED precedes new production fixes. No owned runtime resource was started; no background invocation remains. Existing checkout/dependencies/ref are retained for continuation. No competing GitHub execution summary or issue PR was published.
