# Fresh full100 ownership-expiry readiness

29 October 2026. #897 / PR904 Milestone A. Parent `fc77bc55cd83fdaa502aba236697d4b3c5260659`. This is preparation evidence, not acceptance. It started no Postgres, Redis or MinIO, no producer, no bootstrap and no native test, and it made no timing claim. Hashes are in [receipt.json](receipt.json); runner and self-test are in [scripts](scripts). The prior finite decision ([receipt](../worker-width-decision-20261029/receipt.md)) and the accepted [60 s per-test budget](../worker-verification-budget-decision-20261029.md) are unchanged and not repeated. Production worker, SQL guards, budgets, partition width, caps, closure and every assertion are untouched.

## Verdict

READY for the fixture and setup, with one product defect that belongs to the parent: `pnpm --filter @auto-tm/api build` exits 1 at this parent (see Findings). Nothing else is missing.

## What changed in the two fixture scripts

Both scripts required exactly 98 migrations ending at `20261026016000`, so they would have refused the 102-migration chain on first contact. That was a stale setup pin, not a product defect. Each now takes a `migrationPin {manifestPath, manifestSha256}` and requires three things to be equal: the pinned manifest bytes, every finished `_prisma_migrations` row (name and checksum), and the checked-out `packages/db/prisma/migrations` directory. It also refuses any unfinished or rolled-back row. The bootstrap writes the pin into `bootstrap.json` and the private producer config, so the producer checks the same chain. Nothing else changed: `dependency`, namespace prefixes, roles, 102 Orders, 100 due grants, five API cohorts, 120 s producer deadline, 5 s request bound, 45 s rights horizon, ordinary routes only.

`scripts/pin-selftest.mjs` exercises the inline pin in both files with no database: exact chain passes; a changed row, a missing newest row, an extra row, a wrong manifest hash and a missing pin all refuse (12/12). `node --check`, worker ESLint on both files, worker TS7 and TS6 pass.

## Pins

| Item | Value |
|---|---|
| Migrations | 102, manifest SHA-256 `feb38a1b8e8c9c7cc4fffb701ff0d0e90c49a446409eb6804dd5a5aa4cf49555` ([manifest](migration-manifest.json)) |
| Prior chain | the first 101 equal the decision manifest `62c0801e…` by name and checksum; the only addition is `20261029190000_operational_reset_row_admission` (`4c709daa…`) |
| 162 / 163 / 164 | `aebf91d7…` / `e6447a2c…` / `fe7358f9…` |
| Reset-row SQL | unpublished and root-owned. It adds sealed-OLD DELETE branches to `diagnostic_identity_record_immutable` and `diagnostic_source_anchor_guard`; the INSERT/UPDATE branches the producer uses are unchanged. If this file changes before START, run `pin` and refresh only the manifest |
| Bootstrap / producer | `bfaa1e66…` / `8ada8f01…` |
| Expiry spec / Batch spec | `4fc9ad84…` / `1a2d9b3a…` |
| Caller source + compiled | eight files in receipt.json (`DiagnosticOwnershipGrants`, `DiagnosticOwnershipCapture`, `PrismaDiagnosticIntake`, `PrismaDiagnosticContinuityProofs`, `.ts` and `dist .js`) |
| Others | `vitest.config.mts` `3a2a5df7…`, compose file `bff8f1a8…`, `pnpm-lock.yaml` `175aeafe…`; 35 files pinned in total |

Historical `bootstrap.json`, `loaded-bytes.json` and the r6c evidence are not edited; the fresh run writes new files in a new directory, with the migration pin added.

## Task-only namespace

| Resource | Choice |
|---|---|
| Compose project | `auto_tm_ci_897_r6c_fresh102_20261029` (keeps the `auto_tm_ci_897_r6c_` prefix the bootstrap guard requires; distinct from the retained `…candidatea_1`) |
| Compose file | `infra/compose/docker-compose.ci.yml` (postgres:16-alpine, redis:7-alpine, pinned Chainguard MinIO), host ports left to Docker on `127.0.0.1`, never 5432/6379/9000 |
| Databases | `ownership_fresh` (provisioned and produced); `ownership_attemptN` clones for attempts |
| Runtime dir | `/tmp/897-r6c-fresh102-20261029` (mode 700; `runtime.json`, `config.json`, `caller-env.private.json` and fixtures mode 600); evidence under `bootstrap/` |
| Tools | `/tmp/897-r6c-fresh-ready-20261029` (`fresh-full100.mjs`, `pins.json`, logs) |

Retained resources (`…candidatea_1`, `r7g164_pg`, `issue901_reset_a_recovery…`, ownership7 and the shared compose stack) are never named by a mutating command; read-only `preflight` only lists container names. Every compose command carries `-p auto_tm_ci_897_r6c_fresh102_20261029`.

## Finite command plan

Every phase is `node /tmp/897-r6c-fresh-ready-20261029/fresh-full100.mjs <phase>` from the worktree root. `pin`, `preflight` and `plan` change nothing. All other phases refuse without the parent's START token (`FRESH_FULL100_START`, stored in `pins.json`) and accept `--dry-run`. `plan` prints every exact command with no side effect.

1. `provision`: `docker compose up -d --wait`, `CREATE DATABASE ownership_fresh`, `pnpm --filter @auto-tm/db run migrate:deploy`, then `runtime.json` and the bootstrap `config.json` (resource identity with the real dynamic ports, migration pin).
2. `bootstrap`: detached `node …/bootstrapOwnershipExpiryFixture.mjs serve config.json`. It creates the restricted `r6c_ownership_{api,worker,readback}_*` roles, 102 visits, five in-process API cohorts (100/100/100/100/4 principals, own-admitted/foreign-refused before and after all compositions, original first pair shared), the 101 template routes, and `api-cohorts.json`, `bootstrap.json`, `caller-env.private.json`.
3. `producer`: `node …/produceOwnershipExpiryFixture.mjs` as the restricted readback role: original 120 s deadline, 5 s request bound, five in-flight at most, 45 s declared rights end, real comparative proof, then waits for the actual end. Writes `producer.json`, `producer-retained.json`, `fixture.json`.
4. `drain`: SIGTERM the bootstrap, no SIGKILL; requires zero connections to the task database and receipts 0/0.
5. `template`: `CREATE DATABASE ownership_attempt1 TEMPLATE ownership_fresh`; both get a per-table row-hash fingerprint that must match before the native run.
6. `native`: one run of `DiagnosticWorkerOwnershipExpiry.e2e.spec.ts --maxWorkers=1` with `AUTO_TM_TEST_DATABASES=off`, worker URL and owner URL both pointed at the attempt database, the unchanged 60 s per-test budget.
7. `cleanup` (after evidence is retained, `--evidence-retained`): drop attempt databases, bootstrap `cleanup` (trigger restoration, role removal, refuses nonzero receipts), `docker compose down -v` for the task project only.

Side-effect limits: loopback only; no direct protected-row writes (the producer uses production routes only); no guard disabled; no shared staging, provider, EAS or device. MinIO objects are not part of a database clone, so a repeat attempt needs a storage snapshot. That is not implemented and is not needed for the one scheduled run.

## Expected first proof

At `bootstrap`: `bootstrap.json` carries `migrationPin` and 102 migrations equal to the manifest; guards enabled and `diagnostic_source_guards_ready()` and `campaign_preparation_ready()` both true; `api-cohorts.json` shows five instances with distinct ConfigService objects. At `producer`: `loaded-bytes.json` shows the restricted nonowner role, then `fixture.json` with 100 due grants. A first-contact refusal at either point names exactly which check failed. If the producer refuses only because setup exceeds the original 75 s before declaration, that is a timing RED to preserve, not a reason to change the horizon.

## Zero workload state

At the end of this work: no container for the fresh project, no `/tmp/897-r6c-fresh102-20261029`, no bootstrap, producer or vitest process of this task; the 14 other containers were only listed. Read-only `preflight` passes (head descends from the parent, chain equals the manifest, zero drift, empty namespace). Host load average was about 6 from other tasks. Install and builds ran with `nice`.

## Findings

1. **API build is RED at the parent (product/type defect, not setup).** `nest build`, `tsc` (TS7) and `tsc6` all report three errors in `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts` (lines 39, 109, 214: the `intent` shapes `receptionQualificationIds` and `campaignAdmission` do not fit the stricter `DiagnosticSourceCommand` in `packages/db/src/diagnostic-source-command.ts`). `01b42a0f5` changed that type; the API caller was not updated. The compiler still emits `dist`, and these are type-only errors, so I pinned the emitted files; the bootstrap loads that `dist`. The API log is in [scripts/build-api.log](scripts/build-api.log). I did not touch API source. Whether to fix it before START is the parent's decision; a plain build step in any later gate will fail until it is.
2. **Remaining ten restricted cases need other fixtures.** The Batch spec reads `ownerUrl`, `workerUrl`, `multiComponentGrantId`, `newerGrantId`, `race` and similar fields this producer never writes, one distinct ordinary fixture per case. No producer for those exists yet; they are separate setup work.
3. **Session lifetime.** Bootstrap Sessions last one hour. The one scheduled run must start within that, and a clone made later is only valid inside it.

## Not established

No behavior of the 102-migration chain under the producer or the worker is observed. The runner's provision, bootstrap, producer, drain, template, native and cleanup phases were exercised only as `--dry-run` command printing and the START refusal; their live behavior (compose flags, `docker compose port`, the fingerprint query) is unproved until START.
