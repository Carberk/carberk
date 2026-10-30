R7g maintenance recovery checkpoint, 2026-10-29

Status is SOURCE RECOVERY ONLY. Capability acceptance, B1/G1 and activation remain open/closed as previously recorded. This checkpoint does not establish final acceptance, operational promotion, reviewer rotation/revoke or complete account removal.

Owner uses only `/Users/bagtyyar/.t3/worktrees/carberk/t3-630f4e85`, branch `agent/issue-897-r7g-recovery-20261029`, supplied base `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab`. No commands ran in the old checkout, no old branch was modified, no children dispatched, no issue PR or integration head published, and no GitHub execution summary posted. PR904 was registered with this thread. This document is the coordinator handoff.

Recovered the 12 allowed paths from held `2af0c957da08693a84c946cdb0e5d5f78f05cc95`. Inspected old branch history through `c7d6c37a04c0a214954aa8d8224d6a33a741db9c`: merge `d419ef6c` included the supplied base, `e609b960` corrected indexed source access in maintenance ownership, and `c7d6c37a` pinned the restricted fixture to 98 migrations. Those two narrow corrections are included. CONTEXT.md was reconciled with the actual partial recovery, preserving base documentation and naming the missing command wiring. No new production behavior fix was authored after recovery, and no new red/green proof is claimed.

The source manifest hashes all 12 recovered files and historical/current receipts. Schema, all migration bytes, shared kernel and worker sources are untouched. Static migration provenance is exactly 98 migrations, manifest SHA256 `7e6c3b98ddd2a75ef4751be9ff8fb0fbe5b3a7926f3a27eb91e50e3801e78046`. Loaded V8/generated/build source and applied database provenance have NOT been collected for this recovery. The restricted fixture retains its loaded-source/migration capture; it has not run here.

Current checks before the explicit source-only steering:

- `pnpm --filter @auto-tm/db... install --offline --frozen-lockfile --ignore-scripts --child-concurrency=1 --network-concurrency=1`: PASS, 634 packages reused, no downloads; no lock/config change.
- `pnpm --filter @auto-tm/db exec vitest run src/reviewer-scenario-seed.spec.ts src/tester-accounts.spec.ts scripts/demo-inventory/application/testing/FakeObjectStore.spec.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-offline.json`: FAIL, 28 collected assertions, 27 passed and 1 failed. The reusable storage fake's two cases pass; the original rich tester-removal assertion fails with unsupported Session cleanup. Reviewer suite did not collect because `@auto-tm/contracts` dist was not built. This collection error is setup failure, never meaningful behavior RED. The command had already exited when the source-only steering arrived; no further test/compiler/build work started.
- `git diff --check` for the recovered tracked source: PASS before commit. The final base-to-head check reports three trailing-space lines in the byte-preserved historical Standards report, its original Markdown hard breaks; no production-source whitespace errors were reported. Four untouched original capability suites are hashed in `original-suite-preservation.json`. Reviewer/tester original assertions are retained alongside held additions.

Historical evidence is preserved, not upgraded to current proof: old fix restricted 29/29; original container capability 12/21 with 9 failures; old offline 101/110 with 9 failures. Those results predate this recovery and are not final acceptance. The supplied original receipt and both source reviews are copied here unchanged. Original failure logs/JSON remain in /tmp with hashes in source-manifest.json.

Accepted findings and current limits:

- Foreign reviewer Listing refusal before effects: recovered application preflight plus ownership check/recheck under preparation, and authored foreign personal/business/opposition cases. Runtime proof deferred.
- Catalog collision preflight/rollback: recovered fixed ID/slug association checks before User writes and Serializable adapter recheck. Authored collision/rollback cases retained. Runtime proof deferred.
- No-Session tester removal: recovered combined account_schedule transaction with original 30-second timeout, earlier schedules retained, only exact derived personal Listings archived; Sessions/business/extra effects refuse. Narrow unit regression passed in the pre-steering attempt, but real SQL and original rich capability remain unproved.
- displayName-only convergence: recovered scalar-only reviewer/demo writes; protected fields are compare predicates. Reviewer collection and DB proof deferred.
- Reusable ObjectStore fake: two focused behavior cases pass; fixture imports the one fake. Foreign/private/storage isolation and real MinIO bytes remain runtime-deferred.

Scope dependency requiring coordinator decision:

The supplied base lacks SIX earlier held paths outside the explicit 12-path allowance: `packages/db/scripts/reviewer-scenario.ts`, `packages/db/scripts/demo-inventory/remove.ts`, `packages/db/scripts/promote-admin.ts`, `packages/db/scripts/ui-fixture.ts`, `packages/db/src/promote-admin.ts`, `packages/db/src/promote-admin.spec.ts`. They differ in `git diff 023e6a5d c7d6c37a --name-only`. In particular, reviewer-scenario.ts still implements the old inline store and lacks required preflightSeed, leaving the command disconnected from the recovered adapter and a likely compile error. The restricted fixture also expects the earlier explicit refusals absent from this base. None of these six paths was edited. Coordinator must incorporate those prerequisite changes or authorize their bounded recovery. Do not silently make refusal tests green by changing assertions. Original promotion, rotation/revoke, Session removal and physical demo-removal capabilities remain unresolved; source refusal coverage does not complete them.

Next proof requires explicit R6c interval release. No Docker, DB, service, shared port, staging, public/store or native action occurred. Resource request is one serialized local interval under task project `candidatea-r7g`, disposable Testcontainers PostgreSQL/MinIO with dynamically allocated host ports and unique database/role namespaces; never shared 5432/6379/9000. Do not disturb other threads or prototype services.

After scope reconciliation and explicit release, run sequentially from this checkout:

```sh
pnpm --filter @auto-tm/contracts build
pnpm --filter @auto-tm/db build
pnpm --filter @auto-tm/db typecheck
pnpm --filter @auto-tm/db exec tsc6 --noEmit
pnpm check:runtime-imports
pnpm --filter @auto-tm/db exec vitest run src/promote-admin.spec.ts src/reviewer-scenario-seed.spec.ts src/tester-accounts.spec.ts scripts/demo-inventory/application/testing/FakeObjectStore.spec.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-original-unit.json
COMPOSE_PROJECT_NAME=candidatea-r7g pnpm --filter @auto-tm/db exec vitest run tests/maintenance-finite.r7g.e2e.spec.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-restricted.json
COMPOSE_PROJECT_NAME=candidatea-r7g pnpm --filter @auto-tm/db exec vitest run tests/promote-admin.command.test.ts tests/tester-accounts.e2e.spec.ts tests/demo-inventory.seed.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-recovery-20261029-original-db.json
```

Use the configured unreachable local DATABASE_URL if Prisma generation requires one; never a shared service. Before new fixes, capture meaningful behavior RED from the affected original test, commit/push it, then implement and prove that same test green without widening authority, changing budgets or original assertions. A setup/import/teardown failure must be distinguished from behavior failure. Inspect restricted cleanup if any case fails: its current afterEach runs receipt/guard assertions before disconnect/drop, so an assertion failure may leave owned cleanup unfinished. Do not preemptively rewrite it without the required failing proof. Its `/tmp/897-r7g-restricted-loaded-evidence.json` destination is historical and should be copied immediately to a recovery-specific receipt after a run. Run owned ESLint and configured lifetime/photo checks after affected edits, then required wider gates only when released. Current loaded-source evidence remains UNKNOWN.

Cleanup: no owned runtime service or process remains. Retain this active checkout/branch and ignored focused dependency installation for continuation. No worktree or branch deletion is authorized as part of this checkpoint. Docs: not applicable, internal recovery only; no dependency/API upgrade.
