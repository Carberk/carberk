# Prelaunch clean reset: first executable slice, 2026-10-21

Design checkpoint for #901 under #897, sole integration PR #904. Base `120a1d92865a810559d2e7f773a8bfc105fe2bb9` (docs-only beyond published `a43ee64e`). Branch `agent/issue-901-clean-reset-executable-design-20261021`. This is a documentation-only checkpoint. No source, test, CI, staging, production or credential change was made, nothing live was read, and the earlier token refusal was not retried. This note implements the [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) using the [reference inventory](prelaunch-reference-inventory-20261021.md). Root dispositions Q1/Q4/Q5/Q7 stand. Q2 (D2/D3) remains founder policy, and nothing below depends on it. Line numbers refer to the base commit.

## 1. Selected approach

There is one new target-bound operation, `clean-reset`. It does **not** extend the full-v3 graph. It reuses the existing adapters, adds pure guards and a phase planner, and works in three steps: verify quiescence, delete the inventoried disposable tables, then reseed through ordinary routes. Reference catalog tables are **retained in place** in the early slices. That leaves reseed risk (Generations, admin logos, rate edits) out of the deletion set until the separate OT-SEED catalog work lands. Every proof comes from a fresh authoritative read. Caller JSON only names the target. It can never assert state.

What the existing adapters can already revalidate:

| Fact | Existing trusted source |
|---|---|
| Operator | `gh api user` re-read before every ledger write (`staging-control.mjs:81,159`) |
| Credential scope, project/env/services, origins, mock transports, predeploy migration owner | `RailwayPlatform.attest` GraphQL `projectToken`/`variables`/`domains`/`serviceInstance` (`staging-railway.mjs:48-82`) |
| Exact deployment, SHA, readiness, worker boot log | `runtime()` (`staging-railway.mjs:187-203`) |
| In-container identity, DB/media/Redis origins, migrations | remote preamble and probe (`staging-remote.mjs:15-22,122-129`) |
| Reservation, CAS, latest `main`, schema plan | `GitLedger` (`staging-ledger.mjs:41-94`) |
| Ingress closed, API producers and worker consumers stopped | **existing** `PHOTO_CONVERSION_MAINTENANCE=true` on API and worker. The API runs only a 503 listener: no AppModule, no Socket.IO and no outbox/push/measurement producers (`apps/api/src/main.ts:19-25`, `common/media-conversion-maintenance.ts:4-9`). The worker starts no Nest/Bull consumers (`apps/worker/src/main.ts:10-13`, `media-conversion-maintenance.ts:3`). Runbook: `packages/db/scripts/convert-photos-webp.md:7-9` |

Maintenance is the tool. Proof is a fresh observation (§3). Setting the variable and redeploying are done by the operator under the existing procedure. Early slices add no Railway variable-write capability.

## 2. Exact `cf_*` coupling (source only, no runtime claim)

- **v1 identities.** Row triggers `"<ns>_auth"` fire AFTER INSERT/UPDATE/DELETE on users, sessions, otp_requests, totp_enrollments, totp_backup_codes, staff_grants and audit_logs (`staging-campaign.mjs:13,147`). Disposal redacts the bootstrap audits and retains them, `NOT deleted`, in `campaign_records` (`:174,179`). Later, a write to a row that is neither tracked nor a campaign identity returns early (`:107`). A `DELETE` of a still-tracked retained audit, or any write that touches a `@campaign897.invalid` identity, raises `Disposed campaign cannot be resurrected` (`:110`).
- **v2/v3 business.** `"<ns>_business"` covers 18 tables, and v3 adds auth, service, media and diagnostics tables (`:246-258,1264`). An owned row (retained redacted `audit_logs`, v3 `service_audits`) raises `Campaign graph disposed` (`:1215`). The v3 deferred `"<ns>_promotion"` triggers act only in `identities` (`:644-650,1265-1266`). `phoneGuard` acts only when not `disposed` (`:477-479`). `"<ns>_baseline"` raises only while that namespace's advisory lock is held (`:1153-1156,1267`). On a non-owned non-delete write, `foreignMediaFence` raises only when a key matches a recorded directory (`:943-952`).
- **Non-terminal namespaces** (`identities`/`cleaning`, or a listing-v1 `manifest`) refuse deletes of their roots (`:1210`, remote `:61-71`). They are not inert.
- **TRUNCATE.** No `TRUNCATE` or statement-level trigger exists in these sources. Row triggers therefore do not fire, so TRUNCATE is not blocked, but it leaves the triggers attached and the journals pointing at rows that no longer exist.
- **Runtime readers.** Support retention scans every `^cf_[a-f0-9]{32}$` schema's `campaign_records` on each job (`apps/worker/src/jobs/CampaignSupportRetention.ts:17-30`; called from `ExpireServiceContent.ts:20`). A schema without that table makes the job throw. Email, SMS, Support, diagnostics and promotion admissions activate only for campaign emails or roster grammar (`packages/db/src/campaign-email-delivery.ts:19`, `PrismaOtpRequestRepository.ts:77-97`, `campaignServiceAdmission.ts:24`, `campaignDiagnosticAdmission.ts:28`, `promote-admin.ts:72`). Ordinary users never reach them.

**Answer.** A `DELETE`-based full reset cannot coexist with retained terminal triggers. A `TRUNCATE`-based reset can, but it would accept clean acceptance on a database carrying non-migration triggers and stale journals.

**Disposition (manifest rule `cf`).** First, refuse unless every `cf_<32hex>` schema is a terminal v1/v2/v3 namespace (`state='disposed'`) with `campaign_records`. Next, write a receipt containing the schema name, the manifest row and journal/event/tracking hashes, and counts. Then, in one transaction, `DROP TRIGGER` every `pg_trigger` on `public.*` whose function lives in a `cf_` schema. Retain schemas, functions and tables as inert restricted inventory (Q1). Retain the `bull:email-code:de:campaign-cf_*` dedup tombstones and exclude them from Redis deletion. Dropping the schemas is a later reviewed disposal, done after the v1 CLI fixture path (`staging.mjs:37`) and the v2/v3 code are removed. Do not preserve test rows.

## 3. Q6 launch cutoff and guards (decided; routine)

**Staging.** The existing reservation is required: `owned()`, `STAGING_MUTATIONS_AUTHORIZATION=<id>:<candidate>` and `attest`, which refuses non-staging at `staging-railway.mjs:49`. The new command is `pnpm staging:control clean-reset POLICY.json CLAIM.json`, with no other argument. It is a separate operation kind, so existing `operate … reset` behavior is unchanged.

**Production** must pass all of the following, checked fresh, before any application read. Absence of any one refuses.
1. A committed code constant, `PRELAUNCH_PRODUCTION_RESET = { open: true, environmentId: 'c628b9bf-08ef-45f6-976f-3d646e0ebfbd' }`. The launch-checklist PR sets `open:false`, which is the code-level refusal after launch.
2. `PRODUCTION_RAILWAY_PROJECT_TOKEN` is present, the staging token is **absent**, and the reverse holds for staging. GraphQL `projectToken.environmentId` equals the constant.
3. Authoritative API-service variables (fresh `variables` query) show `APP_ENV=production` and `CARBERK_PRELAUNCH_DATA_DISPOSABLE=true`. The founder sets this variable. The launch checklist deletes it. The remote preamble re-checks both from the container env.
4. The local `PRODUCTION_PRELAUNCH_RESET_AUTHORIZATION=<operationId>:<environmentId>` is present, and `gh` operator identity is unchanged across phases.

Policy and claim JSON are exact-key validated, as `validPolicy` already does (`staging-control.mjs:61`). Keys such as `workersStopped`, `publicLaunch` or `quiesced` refuse before any platform call. In the first slices, once production passes its guard it still refuses with `Production executor not implemented`.

**Quiescence observation** (fresh, all required; unknown refuses):
- API `/readyz` returns `status:"maintenance"` with the candidate `commitSha`.
- Each service's latest deployment is the only active one and is `SUCCESS` at the candidate.
- The worker deployment log contains the pause line and no `Worker started (BullMQ consumer)` line.
- In-container BullMQ `getWorkers()` is 0 for each of the 12 queues (`watchdog.main.ts:13-14`).
- The heartbeat `operations:<scope>:worker` (45 s PX, `worker-heartbeat.module.ts:27`) is absent.
- `pg_stat_activity` shows 0 other client backends on the database.

`closedAt` is the PostgreSQL `now()` at the first passing observation, and is written to the ledger.

**Q7 window.** Re-observe when PostgreSQL `now() − closedAt ≥ 900 s`. Every PUT-grant TTL is a source constant ≤ 900: `PresignUpload.ts:102`, `MinioMediaStorageAdapter.ts:87`, `PresignChatAttachmentUpload.ts:39`, `PresignBrandLogoUpload.ts:13`, `S3VideoObjectStorage.ts:58`. A pin test makes a larger TTL fail. Multipart uploads are aborted during object deletion.

## 4. Q3 synthetic actors, center and qualifications

Actors come from ordinary email OTP sign-in. Staff grants come from `staff:bootstrap` (an exact active verified User plus an actorless audit, `bootstrap-staff.ts:16-24`) and ordinary `POST /api/v1/staff/grants`. Admin comes from `admin:promote`. TOTP enrollment and elevation are ordinary, and nothing is seeded.

**Coupling.** The bounded v3 center bootstrap cannot be kept alone. The center insert (`staging-campaign.mjs:903`) sits inside the v3 setup transaction and is journaled by `track_business`. Its admission requires a live `identities` manifest and contract hashes (`campaignDiagnosticAdmission.ts:28-42`). No product route creates `diagnostic_centers` or `diagnostic_center_assignments`: the only writers are tests and v3. A clean environment does not need reservation admission, because the ordinary gate `DIAGNOSTIC_SYNTHETIC_ENABLED` + `DIAGNOSTIC_SYNTHETIC_USER_IDS` is limited to staging/test (`diagnosticRuntime.ts:7-14`). `DiagnosticAuthority.center` still requires a current grant and a qualified, unrevoked assignment (`DiagnosticAuthority.ts:38-43`).

**Smallest replacement.** Add `packages/db/scripts/bootstrap-synthetic-diagnostic-center.ts` (`diagnostics:bootstrap-synthetic`), modeled on `bootstrap-staff`, run with `--center-code synthetic-<slug> --user-id --capability [--dry-run]`.
- It refuses unless `APP_ENV` is staging or test, `DIAGNOSTIC_SYNTHETIC_ENABLED=true`, and the User is in `DIAGNOSTIC_SYNTHETIC_USER_IDS`.
- The User must be active and verified, and must already hold the matching active staff grant. The capability must be in the diagnostics set.
- The center is created or reused with `operationalApproval=null` and synthetic names. If an existing code has non-null approval, the script refuses.
- `qualifiedUntil` is PostgreSQL `now()+2h` (the root-approved window). It writes actorless `CENTER_SYNTHETIC_BOOTSTRAPPED` / `CENTER_QUALIFICATION_SYNTHETIC` diagnostic audits.
- It is idempotent. It mints no Session, TOTP, elevation or approval.

## 5. First slice (S1): offline, fail-first

Files:
- `scripts/staging-clean-reset.mjs` (pure, no I/O): `guardTarget`, `evaluateQuiescence`, `planTables`, `nextPhase`.
- `scripts/staging-clean-reset.tables.json`: every `public` table mapped to `retain-reference | retain-protected | delete | refuse-if-nonempty`, plus the rule `cf`.
- `scripts/staging-clean-reset.test.mjs`; `package.json` `test:staging-control` adds this file.
- `scripts/staging.mjs`: `clean-reset` argument shape only, ending at `Clean reset executor not implemented` after the guard.

Table disposition:
- **Retain-reference:** brands, models, generations, regions, cities, the five lookup tables, exchange_rates.
- **Retain-protected:** `_prisma_migrations`, `measurement_state` (preserve-or-rotate is unresolved, so the slice neither deletes nor rotates it).
- **Refuse-if-nonempty:** `blog_posts` (its author FK cascades from users), `market_knowledge_*`, and `diagnostic_centers` with non-null `operationalApproval`.
- **Delete:** everything else.

Phases: `attested → quiesced → window → inventoried → cf-detached → rows → redis → objects → reseeded → reopened`.

Write RED first, record it, then GREEN:

| Test | Asserts refusal or result, with zero executor calls on refusal |
|---|---|
| OT-GUARD-1 | Wrong project/env/service, name-only target, staging policy while the production token is present, and the reverse |
| OT-GUARD-2 | Extra JSON keys (`workersStopped`, `publicLaunch`, `quiesced`) or extra CLI args |
| OT-GUARD-3 | Production: closed constant; variable absent or `false`; `APP_ENV≠production`; both tokens present; authorization mismatch; actor changed. If all pass, still `not implemented` |
| OT-QUIESCE-1 | Each observation field failing or `undefined`: readyz `ready`, SHA mismatch, consumer log, any queue workers > 0, heartbeat present, other backends > 0, two active deployments |
| OT-QUIESCE-2 | Window 899 s refuses, 900 s passes, DB clock regression refuses; the pin test finds every presign TTL ≤ 900 |
| OT-INV-1 | `schema.prisma` `@@map` set equals the manifest (a new model fails). An unknown live table, a retained table with an FK into the delete set, or a non-empty refuse-if-nonempty table refuses |
| OT-INV-2 | `cf_` rule: non-terminal state, listing-v1 `manifest` or missing `campaign_records` refuses. Terminal namespaces yield the detach list and the tombstone exclusion |
| OT-RETRY-1 | Phases strictly ordered. Resume only with the same operation ID, owner and candidate; a completed phase is replayed observe-only; a change refuses |

Commands: `node --test scripts/staging-clean-reset.test.mjs`, `pnpm test:staging-control`, `pnpm check:agent-docs`, `git diff --check`.

**What S1 proves:** guard and quiescence semantics, the table/`cf` inventory contract and phase ordering. It does not prove execution, data deletion, reseed, product behavior or any live fact.

## 6. Next source slices and remaining readiness

1. **S2 executor:** `cleanResetMain` remote program plus `StagingControl.cleanReset` (ledger receipts per phase). It performs the observe probe, then one transaction for trigger detach plus `TRUNCATE <exact delete list> RESTRICT`, with the FK closure checked first. It deletes Redis by exact `bull:<queue>:` prefixes, excluding the tombstones, and deletes object versions and multipart uploads per in-scope bucket, keeping `catalog-assets/brands/**`. Hosted test: `packages/db/scripts/staging-clean-reset.e2e.spec.ts` (Testcontainers Postgres, Redis and MinIO, following `staging-reserved-fixture.e2e.spec.ts`) seeds v1/v2/v3 terminal namespaces and proves that a DELETE fails and the plan succeeds. Covers OT-INV/RETRY/RESTART.
2. **S3:** `bootstrap-synthetic-diagnostic-center.ts` with a hosted test: ordinary template publish returns 201 and the cross-audience refusal holds. Then add OT-SEED (semantic hashes) as in [inventory §8](prelaunch-reference-inventory-20261021.md).
3. **S4:** production adapter behind §3 (a separate class; `attest` is not relaxed), plus the reviewer App-access reseed.
4. **Retire** the reset tails of v3 rows 28/33/34 only after NP-3, NP-4 and S1–S2 are green on the same assembled candidate.

**Live permissions needed later** (not requested now):
- **Staging:**
  - a working environment-scoped project token for `652abc79-…` with read access to `projectToken`, project, `variables`, `domains`, `serviceInstance`, `deployments`, `deploymentLogs`, plus `serviceInstanceDeployV2`;
  - `railway ssh` to the API service;
  - push to `ops/staging-lease`;
  - operator rights to set and unset the maintenance and `DIAGNOSTIC_SYNTHETIC_*` variables;
  - a database role able to `TRUNCATE` and `DROP TRIGGER` on `public` tables (UNKNOWN).
- **Production:** a founder-held production-environment token with the same set, plus the founder setting and later deleting `CARBERK_PRELAUNCH_DATA_DISPOSABLE`.
- **Both:** a restricted export destination for receipts and for unresolved rows.

**Still open:**
- Live origins, the live table set, `cf_` presence, the database role's privileges, and whether Railway shows exactly one active deployment per service. All are UNKNOWN.
- The production executor, reviewer reseed and deployed acceptance are not started.
- Q2 is untouched.
