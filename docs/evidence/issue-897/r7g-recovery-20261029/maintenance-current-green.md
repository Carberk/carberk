# Current-byte maintenance verification

The bounded local maintenance scope passes on production source `de18af37857ad130c00c14404f5ce360e937d25e`, tree `6002098d27c8b8c5764dde06bb5192cfb1ea15d7`. The only subsequent executable change adds actual loaded SQL fingerprint capture/assertion to the restricted fixture; it was exercised by its full suite, both compilers and affected lint. No production repair was needed during this verification. Final evidence commit is the assembler's handoff ref; its production bytes are the pinned source above.

This supersedes the unverified continuation status of [reviewer-repeat-source.md](reviewer-repeat-source.md), while preserving its governing decision and every historical RED. It establishes local maintenance behavior, not the full cross-context matrix, assembled review, deployed acceptance or activation.

## Results

| Criterion | Current result |
|---|---|
| Original scalar suites, eight prior outcomes, protected fields/displayName convergence |75/75 PASS, no skips |
| Real exact revoke clean-repeat, dirty/mixed cleanup, rollback, parser and dormant guard |11/11 selected cases PASS; later included in full suite |
| Expanded original promotion/tester database suites |18/18 PASS, no skips, fresh databases |
| Full restricted-principal maintenance suite |40/40 PASS, no skips, fresh database per case |
| TS7 and TS6 |PASS, including final provenance fixture |
| Affected lint, configured DB build, runtime-import gate |PASS |

The real tests cover atomic reviewer rotate/revoke and exact tombstone repeats; whole-plan rollback at Session/device/audit failures; foreign security state and Session video-grant/service-push cascades; foreign Listing/catalog refusal; no-Session tester removal, earlier/equal/future schedules, new personal inventory and write-free repeats; strict parser and naked/dormant guard refusals; both promotion start orders and canonical-holder creation/ambiguity races; real MinIO convergence, metadata stripping, displayName-only convergence and foreign/private byte preservation. Original assertions, limits, transaction/suite timeouts and reached failure history remain intact.

Fixture reuse is resolved through fresh original databases on each full invocation and fresh restricted databases per case. The task-only MinIO fixture restores bucket absence. No production guard bypass or error-contract change was introduced. The previously approved same restricted PostgreSQL INSERT boundary retains exact40001 / `diagnostic_source_user_insert_busy`, which Prisma maps to P2034.

## Loaded provenance

Historical98 migration directories and the Prisma schema are unchanged. There is no161. Additive `20261026016200_diagnostic_maintenance_compatibility` SQL SHA256 is `aebf91d78f4bd1711ac30ada3cb3b8b01da4999fcafbc963e45b839fc14ce379`. Full99 manifest SHA256 is `cf20ed35b61750574ffd627f162a6e89178fdc0282c262877c9deb6989ad278a`.

Both original databases and all40 restricted databases loaded that manifest. Effective diagnostic/campaign function-definition SHA256 is `873c0a1bb4405e2f26daaff3f9850146cf0f3be6c2cba016f55c7052fae5ddd3`; each restricted case verifies it before behavior. V8 inspector captured27 actually loaded scripts. The [machine receipt](maintenance-current-green.json) contains the full99 manifest, source pins, per-case loaded/cleanup verdicts, loaded-script hashes, literal test titles/results and artifact paths/hashes. Prior receipts are retained unchanged in [maintenance-runtime-results.json](maintenance-runtime-results.json).

Literal runtime commands, from the owned checkout with the private task environment supplied by the wrapper:

```sh
R7G_RUN_LABEL=current-repeat-parser R7G_PATTERN='compound reviewer|strict maintenance parser|dormant maintenance' node /tmp/897-r7g-runtime-20261029/rerun.cjs --restricted
R7G_RUN_LABEL=current-original-full node /tmp/897-r7g-runtime-20261029/rerun.cjs --fresh
R7G_RUN_LABEL=current-restricted-full node /tmp/897-r7g-runtime-20261029/rerun.cjs --restricted
```

The wrapper executes `pnpm --filter @auto-tm/db exec vitest run` with the named files, `--maxWorkers=1`, JSON reporter and separate task receipt output. `--fresh` recreates only the task promotion/tester databases. Restricted cases create/migrate/drop their own databases and restore exact trigger modes. Neither command uses another owner's database.

Other literal checks:

```sh
pnpm --filter @auto-tm/db exec vitest run src/promote-admin.spec.ts src/reviewer-scenario-seed.spec.ts src/tester-accounts.spec.ts scripts/demo-inventory/application/testing/FakeObjectStore.spec.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/897-r7g-runtime-20261029/current-scalar.json
pnpm --filter @auto-tm/db typecheck
pnpm --filter @auto-tm/db exec tsc6 --noEmit
pnpm --filter @auto-tm/db exec eslint src/PrismaAdminPromotionStore.ts src/reviewer-scenario-seed.ts scripts/reviewer-scenario-store.ts tests/maintenance-finite.r7g.e2e.spec.ts tests/promote-admin.command.test.ts tests/tester-accounts.e2e.spec.ts --max-warnings 0
DATABASE_URL=postgresql://build:build@127.0.0.1:1/build pnpm --filter @auto-tm/db build
pnpm check:runtime-imports
```

## Release and boundaries

Functional work RELEASED. All test/build/compiler processes exited. Project `candidatea-r7g` PostgreSQL60936 and MinIO60937 are STOPPED, with retained task data/containers only; Redis was not provisioned. Zero scoped client PIDs, zero leftover per-case databases/roles, source/campaign receipts0/0 in both original databases, and all40 trigger snapshots restored. The MinIO fixture bucket is removed. No shared services, ownership7, staging, public/store actions, new PR or integration-head publication occurred. This was functional evidence without a quiet-host or timing-performance claim.

The broader HTTP/kernel/proof matrix, consumed-report retry/retention and opposing contact/Session/device/purge/Listing/business/proof races remain UNKNOWN unless separately proved by their owners. Independent assembled Standards/Spec, combined candidate gates and deployed acceptance/restoration remain coordinator-owned. Do not infer those results from the maintenance passes. The requested operational reset-row dependency will receive a separate bounded source proposal; no reset permission or shared kernel expansion is included here.
