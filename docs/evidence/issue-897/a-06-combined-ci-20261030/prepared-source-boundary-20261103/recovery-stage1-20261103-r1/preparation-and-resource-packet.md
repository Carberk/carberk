# Issue 938 recovery stage 1 preparation and held runtime packet

This packet is executable after a separate coordinator runtime release. It was prepared without launching a service, database, storage server, Compose project, worker, or probe.

## Offline inputs and checks

- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-2d375913`; branch `t3/2d375913`.
- Source checkpoint: `6bc5196958c58611328c09eb7a3dfa6fdc8c4f11`; tree recorded in `final-source-checkpoint.json`.
- Source: `87456f4fe6b564d2edbc40ef807d6a75ef37f452`; candidate: `7dc251d550cae7ab977810a41b61dd60416c52b6`.
- Offline store: `/Users/bagtyyar/Library/pnpm/store/v11`.
- Matching install, contracts, db, worker, and import outputs were reused after the input and compiled-output audit in `preparation-reuse-audit.json`.
- Final serial checks and raw SHA-256 values are in `offline-command-receipts.json`; all four exited 0. `git diff --check` exited 0 in `git-diff-check-final.json`.

## Fresh runtime identity to revalidate before launch

Project `auto_tm_ci_897_938_s1_20261103_r1`; PostgreSQL `127.0.0.1:61169`; Redis `127.0.0.1:61168`, logical DB 1; MinIO `127.0.0.1:61170`; base database `auto_tm_897_938_s1r1`; bucket `diagnostic-test-private`. Global setup must create and capture `<base>_t<sixhex>_template` and `_w1`, with `--maxWorkers=1`. The API and worker URLs must be derived from the actual globalSetup output. Foreign65379, #925 ports, #935 resources, shared buckets and global cleanup are forbidden.

Production object keys are only `diagnostic-evidence/<UUID>/<SHA>` and `diagnostic-pdf/<UUID>/<UUID>.pdf`. `issue938/recovery-stage1/<suite>/<case>` is a logical label and never an S3 prefix.

## Roles and grants

Create through a separate bootstrap connection, then verify each role is LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, is not an owner, and has no inherited role membership:

- `r938_s1_capture`
- `r938_s1_handoff`
- `r938_s1_discovery`
- `r938_s1_readers`

Application clients are constructed with each restricted `DATABASE_URL`; the environment URL is restored immediately. Bootstrap commands are the configured `@auto-tm/db` `staff:bootstrap` and `diagnostics:bootstrap-synthetic` scripts. The helper records exact grants from `diagnostic_source_registry()` plus the explicit prepared-source, fixture, report, purge and storage tables it uses. No guard is disabled for fixture setup. The F47 extension is installed only on the discovery Prisma client and leaves the transaction object unchanged, preserving `DiagnosticPreparedIntake`'s WeakMap identity.

## Planned Compose commands, not executed

```text
docker compose --file infra/compose/docker-compose.ci.yml --file /tmp/issue938-prepared-reader-r1/compose-overlay.yml --project-name auto_tm_ci_897_938_s1_20261103_r1 config --format json
docker compose --file infra/compose/docker-compose.ci.yml --file /tmp/issue938-prepared-reader-r1/compose-overlay.yml --project-name auto_tm_ci_897_938_s1_20261103_r1 up --detach --wait --wait-timeout 120
docker compose --file infra/compose/docker-compose.ci.yml --file /tmp/issue938-prepared-reader-r1/compose-overlay.yml --project-name auto_tm_ci_897_938_s1_20261103_r1 port postgres 5432
docker compose --file infra/compose/docker-compose.ci.yml --file /tmp/issue938-prepared-reader-r1/compose-overlay.yml --project-name auto_tm_ci_897_938_s1_20261103_r1 port redis 6379
docker compose --file infra/compose/docker-compose.ci.yml --file /tmp/issue938-prepared-reader-r1/compose-overlay.yml --project-name auto_tm_ci_897_938_s1_20261103_r1 port minio 9000
docker compose --file infra/compose/docker-compose.ci.yml --file /tmp/issue938-prepared-reader-r1/compose-overlay.yml --project-name auto_tm_ci_897_938_s1_20261103_r1 down --volumes --remove-orphans
```

The overlay uses `!override` for only these three loopback bindings. Resolve and hash the config before `up`; record image/container labels, applied migration checksums, actual project/volume/network ownership, and every derived worker URL. These commands remain a packet only.

## Vitest command held for later release

```text
pnpm --filter @auto-tm/api exec vitest run src/modules/identity/infrastructure/ClassifiedForwardCapture.e2e.spec.ts src/modules/identity/presentation/DiagnosticContinuityHandoff.e2e.spec.ts src/modules/identity/presentation/DiagnosticScopedDiscovery.e2e.spec.ts src/modules/identity/presentation/DiagnosticErasedPredecessorReaders.e2e.spec.ts --maxWorkers=1 --passWithNoTests=false -t '^(issue938 recovery stage1) (accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1|lets only the selected current B technician reload a minimal usable handle without A access|returns only named currently eligible distinct B technicians to a non-reception reviewer|projects commissioner and currently assigned staff reads, preserving the exact technician mutation receipt and B source|omits malformed required retained evidence without a partial candidate or protected error|\[938 control\] rejects persisted provenance rewrite without changing stored evidence|\[938 control\] cleans partial fixture initialization before returning failure)$'
```

No `AUTO_TM_TEST_DATABASES=off` is permitted for this runtime stage. Record redacted environment names and values, the actual worker URLs, and the exact raw command streams.

## Lifecycle and cleanup proof

Each case owns its role, restricted Prisma client, Nest app, Redis/Bull callers, S3 keys, center/template/users/sessions/orders/reports/proofs and source/campaign receipts. `withPreparedReaderFixture` stops new callers, drains all in-flight promises, verifies zero source/campaign receipts, closes app and Prisma pools, removes only its registered evidence/PDF keys, verifies the control key before removal, proves an empty bucket, drops the exact role only after zero backends, restores every source-trigger mode, and closes the bootstrap pool.

The partial-init control fails after the role/app/bucket/control boundary and proves the same cleanup. Success and behavior-failure paths use the same `finally`-equivalent cleanup path; cleanup errors are aggregated with the original behavior error. Global setup must then drop the actual `_w1` and `_template` databases, flush only Redis DB1, and prove no owned database, role, listener, container, volume, network or object remains. Any setup or unsupported lawful-state failure stops with its exact stage and dependency.
