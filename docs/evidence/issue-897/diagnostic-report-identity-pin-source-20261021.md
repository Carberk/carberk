# Raw report identity pin source checkpoint, 2026-10-21

Isolated run-issue writer for #914 within #897, sole draft PR #904. Branch `agent/issue-914-report-identity-pin-source-20261021`; host scaffold `t3/issue-914-report-identity-pin` remains at the supplied base. No issue PR, integration-branch write or issue-comment mutation. Root owns assembly and execution-state updates.

Exact source diff: `75ee52e5c084091a4d3e94acc285b8b17b77f828..d51b0ae594cb075ca0160b72c87c64a11755458c`. The subsequent evidence commit adds only this note. Governing policy is accepted ADR-0108 and the report-binding RED, structured-evidence capture and next-RED contracts in this directory. Structured evidence and pair proofs remain later slices.

First drafts, including a new visit's first reinspection report, select the latest retained raw identity record under the existing order lock. Corrections inherit the parent's nullable id/hash pin. A separate insert/update guard enforces selection, correction inheritance and immutable pins, with clearing permitted on report erasure. There is no backfill. Report state, released snapshots, ordinary report/list/public DTOs and their hashes gain no identity material.

The private comparison returns exactly the pinned predecessor observation and current candidate observation with their ids/hashes and report/order versions. Current technician/reviewer grants, qualification, Session and independent assignments on both orders are required. Both orders remain locked while authority and retained content are read. Missing, erased, unpinned and unauthorized requests use generic `DIAGNOSTIC_NO_ACCESS`; the controller sets private/no-store before validation/authorization. This read neither issues a proof nor changes link admission.

Commissioner purge clears report pins before identity content and intake erasure. Staff deletion leaves other commissioners' pins and immutable snapshots intact. The new FK, reset trigger manifest, exact schema hash/inventory and SQL fixture are coordinated. No historical SQL or reset-tail tests changed; no extra preservation exception was introduced. Real collection remains closed.

## Observed RED and pending GREEN

Observed hosted RED remains published `d124d8c4f857dbc228c77a24817763d39d9c5044`, PR Checks run `39626476492`, API job `119313051265`. The original `DiagnosticReportIdentityBinding.e2e.spec.ts:157` reached comparison after real setup and got 404 instead of 200. API was 3067/3071; the other three failures were retained CampaignFullV3 reset-tail tests. Worker was 369/369; DB, runtime/static and frontend passed. These are earlier hosted results, not results for this source checkpoint.

Raw log `/tmp/carberk-resume-20261021/d124d8c4-api-119313051265.raw.log` was rehashed locally and matches `6a3d313f52969a1248f5636c6112bf21c70162981d5ad3ed6e25fe96453bfbff`. The plain derivative confirms the line-157 failure.

Both suites are byte-for-byte unchanged from the supplied base:

- `DiagnosticReportIdentityBinding.e2e.spec.ts`: SHA256 `4ee535b6c677a85127ff55cbda568b9168c1e3315120c823ae9a7054d10ff694`.
- `DiagnosticIdentityErasure.e2e.spec.ts`: SHA256 `1a81f63decc3a48bcd132ea7521f241a7fe66af334d469c5a9acc00b4a884e52`.

| Criterion | Evidence at source checkpoint | Result |
|---|---|---|
| First-draft pin survives reobservations, release and correction | Original binding HTTP suite unchanged; source and migration inspected | Hosted GREEN pending |
| Exact private comparison, current both-order authority, denial parity and no-store | Original binding HTTP suite unchanged; authority/controller inspected | Hosted GREEN pending |
| Ordinary readers disclose no pin or raw observation | Existing DTO/snapshot mapping unchanged; original binding suite assertions retained | Hosted GREEN pending |
| Erasure/reset compatibility without snapshot changes | Existing erasure suite retained; purge ordering, FK and trigger manifest inspected; offline schema/reset checks below | Hosted PostgreSQL/purge proof pending |

Root's next combined useful hosted batch owns GREEN on the assembled candidate, including migration execution and erasure acceptance. No local PostgreSQL/Redis test environment was configured; no Docker, service, CI dispatch/poll/wait, deployment, live reset, credential or infrastructure mutation occurred.

## Offline verification

All logs below are under `/tmp/issue-914-pin-` in this host. A placeholder `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` was used only for Prisma config loading, validation/generation and offline schema diff; it contacted no DB.

- PASS: `pnpm --filter @auto-tm/contracts build`, then `pnpm --filter @auto-tm/db build`. An initial concurrent DB build preceded contracts output and failed import resolution; the ordered rerun passed.
- PASS: `pnpm --filter @auto-tm/db exec prisma validate` and `prisma migrate diff --from-schema /tmp/issue-914-pin-base-schema.prisma --to-schema prisma/schema.prisma --script`. The diff is only two nullable columns and their FK; reviewed SQL adds the pair check and pin guard. Artifact `schema-diff.sql`.
- PASS: `pnpm --filter @auto-tm/api --filter @auto-tm/worker build`; `pnpm --filter @auto-tm/api --filter @auto-tm/worker --filter @auto-tm/db typecheck`, `exec tsc6 --noEmit` and `lint`. Logs `build.log`, `typecheck.log`, `tsc6.log`, `lint.log`.
- `pnpm --filter @auto-tm/api --filter @auto-tm/worker --filter @auto-tm/db test:unit`: DB 112 passed plus its offline tests; worker 292 passed; API 2410 passed, 2 skipped, 5 failed because the local admin dependency slice lacked `next/navigation`. After installing existing locked admin dependencies, `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/AdminApiBridge.spec.ts` passed all 5. No source/test/lockfile repair. Logs `unit.log`, `admin-retest.log`.
- `pnpm test:root`: 579 passed, 1 skipped, 1 failed import because the mobile dependency slice lacked `socket.io-client`. After installing existing locked mobile dependencies, `node --test scripts/staging-reviewer-flow-smoke.test.mjs` passed all 6. No live smoke command ran. Logs `root-tests.log`, `root-retest.log`.
- PASS: `node --test scripts/diagnostic-identity-records-schema.test.mjs scripts/diagnostic-reinspection-schema.test.mjs scripts/staging-clean-reset.test.mjs`: 22/22. Log `schema-tests.log`.
- PASS: `pnpm check:runtime-imports`, `pnpm check:glossary`, agent-docs check within `test:root`, `git diff --check`, unchanged-test diff check. Docs: not applicable, internal business logic/schema changes using existing repository APIs; no dependency/version changes.

## Changed source files

- `apps/api/src/modules/diagnostics/CONTEXT.md`
- `apps/api/src/modules/diagnostics/domain/ports/DiagnosticReportsPort.ts`
- `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticReportsController.ts`
- `apps/worker/src/jobs/diagnosticAccountErasure.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20261021120000_diagnostic_report_identity_pin/migration.sql`
- `scripts/staging-clean-reset.tables.json`
- `scripts/staging-schema.mjs`
- `scripts/testing/retained-schema/20261021120000_diagnostic_report_identity_pin.sql`

The owned worktree and pushed branch remain for root assembly; ignored dependency/build outputs remain local. No owned check process or service remains running. No other worktree was edited or retired. Next action: root assembles this checkpoint and obtains hosted source GREEN before independent integration review and acceptance.
