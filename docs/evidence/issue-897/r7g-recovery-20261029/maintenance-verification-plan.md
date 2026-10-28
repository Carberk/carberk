# Queued finite maintenance verification

Run sequentially in the owned checkout only after explicit coordinator release. Do not start DB/Docker, a heavy bundle, or any ownership7 invocation. Record command exit status, literal failure titles/totals and output hashes. Send START before the first invocation and RELEASE after the last meaningful invocation drains.

Configured prerequisites (already installed; rebuild changed DB source before runtime consumers):

```sh
pnpm --filter @auto-tm/contracts build
DATABASE_URL=postgresql://build:build@127.0.0.1:1/build pnpm --filter @auto-tm/db build
```

The generate URL is deliberately unreachable; generation/build must not contact a database. Preserve dependency failures as setup evidence, never bypass runtime exports.

Original scalar outcomes, including displayName protected-field negatives/convergence, atomic fake rollback and earlier-schedule cleanup:

```sh
pnpm --filter @auto-tm/db exec vitest run src/promote-admin.spec.ts src/reviewer-scenario-seed.spec.ts src/tester-accounts.spec.ts scripts/demo-inventory/application/testing/FakeObjectStore.spec.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-maintenance-scalar-green.json
```

Both compilers:

```sh
pnpm --filter @auto-tm/db typecheck
pnpm --filter @auto-tm/db exec tsc6 --noEmit
```

Affected TypeScript lint and runtime import check:

```sh
pnpm --filter @auto-tm/db exec eslint scripts/promote-admin.ts scripts/reviewer-scenario.ts scripts/reviewer-scenario-store.ts src/PrismaAdminPromotionStore.ts src/PrismaTesterAccountStore.ts src/diagnostic-source-command.ts src/maintenance-source-command.ts src/promote-admin.ts src/promote-admin.spec.ts src/reviewer-scenario-seed.ts src/reviewer-scenario-seed.spec.ts src/tester-accounts.ts src/tester-accounts.spec.ts --max-warnings 0
pnpm check:runtime-imports
```

Routine focused source/type/lint repairs remain in the owned paths. Preserve initial failed invocation receipts. Rerun only affected commands after fixes, then report the exact final candidate.

## Separate runtime reservation

After scalar/compiler readiness, obtain an exclusive isolated `candidatea-r7g` runtime window with dynamic task-owned ports/namespaces. Do not use shared5432/6379/9000 or R6c ownership7 PG65379. Exact source/migration pins and actual loaded-code evidence are required.

The held restricted fixture still pins historical98 migrations and blanket-refuses the newly accepted three operations. Its authorized contract conversion, parser integration tests, real adapters and two-connection races must be completed before the runtime suite. Preserve original tests and RED history, all foreign/privileged/protected-field/rollback assertions, root/row/effect limits and timeouts. Do not label the restricted suite ready before those changes.

Required runtime outcomes include exact phone/email promotion+audit/no-op/audit rollback; canonical ambiguity and concurrent creation fencing; fixed-roster atomic reviewer rotate/revoke with foreign catalog/Listing/contact and Session/device isolation; no-Session/earlier/equal/future tester schedule and clean repeat; full Session/proof closure and retained consumed retry semantics; dormant/naked/invalid/cross-transaction/unfinished receipt negatives and opposing ownership/inventory/proof races. Source-only or scalar GREEN cannot establish these capabilities.
