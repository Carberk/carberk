# R2 Catalog owned-fixture correction, 2026-10-26

Fixture-only source checkpoint `6f5d27b8e38303bf09b497f29af898d317408307`, tree `fc18433c55b25940070c1e656ba3c94813b6fc6c`, based on coherent67 `67fb9e8e9c90265b0d3fd25a0072eb633e86cbec` through preserved evidence-only `6a937ab12e4bc50c167c488923c5505915e51985`. Same original owner/worktree. Sole changed source path: `apps/api/src/modules/catalog/presentation/AdminCatalogController.e2e.spec.ts`, SHA256 `f4fd5aab8d7d24ff7470a6bf8a9bd123e47ef210308b2b4b4fd6c0e3fca5313f`.

The confirmed root was the suite's first beforeEach cleanup, `auditLog.deleteMany()` producing `DELETE public.audit_logs WHERE 1=1`. Successful full-v3 disposal retained two redacted audits, so its enabled campaign tracker correctly refused their deletion with P0001 `Campaign graph disposed`. Hosted run40284523289 log SHA256 `10206bf8ec2969ff07a1a9c7cbf63e7a33502347a97607c800e0411144a8c205`, lines13274–13327, and the preserved coherent67 representative red establish this root. Older bff39green and prior anchor failures remain distinct historical evidence. No production or generic-guard defect is shown.

Cleanup now uses exact IDs returned by direct fixture creates and successful HTTP responses. Audits are scoped by suite-created actors, Sessions by recorded IDs even after ownership transfer, TOTP by suite-created User ownership, Models/Brands by recorded IDs. The suite creates no Listing or ListingMedia, so it no longer deletes those tables. Final cleanup also runs before app closure. Exact pending/generated/imported MinIO keys are tracked and removed, including the deliberately retained other imported version after its assertions. UUID fixture IDs/slugs remove millisecond collisions.

Audit reads are scoped to suite actors and validate action, actor, target type and owned target. Single-mutation checks require exactly one audit. The two-upload logo test requires exactly two audits with both exact slug/logoKey/previousLogoKey transitions. All original39 cases, actual HTTP/Nest/Identity composition, claims, error/status/body assertions and native budgets remain. No production, kernel, schema, migration, integration or shared-profile edits.

Verification used task-only compose `r2catalogfix_20261026` and fresh database `r2catalogfix`, PostgreSQL16.15, Redis7 and the configured pinned MinIO image. Ports were PG60357, Redis60356, MinIO60355. Shared5432/6379/9000 were untouched. APP_ENV/NODE_ENV=test and AUTO_TM_TEST_DATABASES=off select the already migrated disposable database. Fixture credentials are synthetic task-only values. The unchanged real remote-program fixture bridge performed successful full-v3 seed and reset with reservation d901 repeated8 and candidate a repeated40. All94 finished, non-rolled-back migrations matched committed SHA256 checksums. Full inventory `/tmp/897-r2-catalog-fixture-20261026/verified-migrations.json`, SHA256 `98431fb37d38d5f95ee0714e7959508ab291e77f56c1e460ba7c1a93411c48c0`.

Configured DB/contracts/API builds from the preceding coherent67 run were reused because no dependency source changed. Before runtime, require-resolved actual DB/contracts exports and built preparation/kernel/API bytes were pinned and checked against that rebuild, all byte-exact. See loaded-bytes-final.json and rebuilt67-artifact-continuity.json. This does not claim that rebuilding a fixture-only TypeScript test is necessary; Vitest loaded its pinned source directly. Catalog uses its existing configured auto_tm_ci owner role. The284 managed guards remain dormant D; both campaign audit trackers remain enabled O. The earlier Identity restricted-nonowner/full22 evidence is preserved and was not rerun.

| Check | Actual result |
|---|---|
| Preserved original representative red | 0pass,1fail,38filtered at unscoped cleanup |
| Same representative after scoped cleanup | 1pass,0fail,38filtered |
| Initial full39 | 38pass,1fail,0skipped; new fixture assertion incorrectly expected one LOGO_SET audit for two uploads |
| Changed logo case after exact two-transition assertion | 1pass,0fail,38filtered |
| Final original full39 | 39pass,0fail,0skipped,815ms tests |
| Focused ESLint | exit0 |
| Configured API typecheck | exit0 |
| git diff --check | exit0 |

The intermediate failure was my added count assertion, corrected within the direct fixture. It was not a caller/kernel error and caused no unchanged retry. The initial typecheck also caught the backup-code relation filter; it was corrected to totpEnrollment.userId before runtime. Raw intermediate red logs remain preserved.

Runtime command prefix: `pnpm --filter @auto-tm/api exec vitest run src/modules/catalog/presentation/AdminCatalogController.e2e.spec.ts --maxWorkers=1 --no-file-parallelism --retry=0 --passWithNoTests=false --reporter=default --reporter=json`. The representative adds `-t 'preserves the missing-bearer'`; the corrected logo run adds `-t 'uploads, replaces, and removes a logo'`. Exact complete commands/outputFile arguments and exits are in each `.result.json`; replay.py and verify-final.py retain the executable harness. No timeout padding or assertion disabling.

Before runtime, unrelated sentinel rows were inserted in users, sessions, totp_enrollments, totp_backup_codes, brands, models and audit_logs, including a foreign CATALOG_BRAND_CREATE audit. A foreign MinIO key carried known exact bytes. Canonical complete snapshots of all99 public tables and11 campaign tables were byte-identical before and after the representative, intermediate full39, corrected logo case and final full39. Snapshot SHA256 `9b1d424e31843826ea6424ed14085e602022f8d3462135e0a2cfc27bf3380c6f`. This proves retained/foreign rows unchanged and zero suite DB survivors, including audit/session cleanup. No foreign Listing sentinel was added; the suite writes neither Listing table, and complete table snapshots include both.

The retained audit rows remained journal-matched, deleted=false:

- `024caf2c-8dc6-4251-adf5-6eecd77bc944`, row/journal MD5 `fbe8462d27ac4b549a40bdf2ea02bae5`.
- `b0ff46af-7a2e-4c28-adda-0a80bd497415`, row/journal MD5 `819a4aaf8ae3234c681f75bfc5679bcd`.

Every object verification found exactly the unchanged foreign sentinel and zero suite objects, including imported alternate versions. Real reset receipts, retained manifest/records, migration history and guard states are included in snapshots/provenance. Final source receipts0. Task compose down-v exited0; label-based checks found zero containers, volumes or networks. Disposable foreign sentinels disappeared with their task-owned volumes.

Artifacts: `/tmp/897-r2-catalog-fixture-20261026/manifest.json`, SHA256 `dd645d8a1096ea4d8449b2b835a098581ea7974e8f769c35f134e08c28c318a7`. It hashes logs, commands, source/artifact pins, snapshots, migration inventory, exact baseline red provenance and cleanup. Final full39 log SHA256 `4b440cd2e242e562066dfb29127e1103f4cddeab865f56b9f740f28712a96be2`; JSON SHA256 `f5ec7e97ceafefc1179a28537436ae2fa8aadfdb6bbb90007bf212b38b967973`. Prior red log SHA256 `f166e79f2fd8cf2dcf3fe1966219063b147c914b1b1564232add83334fe1ad88`.

This is scoped local fixture acceptance. Parent owns source inspection, sole-assembler integration and full candidate gates; B1/G1 remain open. No PR push/poll/watch, children, Identity22 duplication or production acceptance claim. No new out-of-scope root appeared.
