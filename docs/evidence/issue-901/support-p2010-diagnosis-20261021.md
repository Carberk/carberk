# Support cleanup P2010 diagnosis, 2026-10-21

## Scope and provenance

Test sub-agent only, isolated from the #914 writer. Base `0298f1a043c3b3a78f8b58695b2acc432d2a6c15`, parent published candidate `83742f07223ffb21b13d11bec479bf19a5e7ee63`. Reservation `agent/issue-901-support-p2010-diagnosis-20261021` was pushed at the base before editing. Root alone assembles. No children, PR, GitHub API request, CI polling/rerun, integration service, Docker, staging, Railway or credential action occurred. Only the spec and this evidence change.

RED is the already executed hosted API job `119128357106`, run `39572013158`, from `/tmp/carberk-next-release-20261021/83742f07-api.log`, SHA-256 `37e1c232303bbc2de0c8ff5373f356092ae43d290139a4853f7d5243b1c19520`. No local runtime reproduction was attempted under this assignment's service prohibition. The hosted symptom remains RED; this checkpoint is diagnostic, not a green source repair.

## Observed evidence and missing distinction

Saved log lines 1053 and 1060 report `deadline-worker` and `owned-support-worker`, respectively, with `errorType: Error`, `codes: [P2010]`, and empty classifications. Lines 1056, 1063 and 1065 report SQL-call-4 reset refusals with `P0001` and the fixed `Disposable database query refused` classification. The primary/foreign f5/f7/f8 reset failures leave campaign state behind. The snapshot diff records committed purge changes, epoch 1 and a pending empty-key fence. The later sign-in failures explicitly show `RATE_LIMITED`, `ip_limit`, loopback hourly rows 10 and max 10. The selected-worker race cases fail in contaminated setup before their barriers. They provide no ordering verdict.

The worker's failed statement, nested SQLSTATE, driver category and exact authority/refusal phase are missing. P2010 alone cannot distinguish a SQL name-resolution defect, an explicit authority exception or a raw-query lock failure. The separate audit-refusal DriverAdapterError traces earlier in this log belong to other tests; they are not evidence of this worker's cause.

## Call path and concrete source finding

- Both embedded children in `CampaignFullV3.e2e.spec.ts` construct the real worker `ExpireServiceContent` with `PrismaService` and `S3RetiredObjectStore`, then call `execute(now)`.
- `apps/worker/src/jobs/ExpireServiceContent.ts` discovers due closed cases, calls `CampaignSupportRetention.run(..., "purge", ...)`, and commits its transaction before querying due attachments, artifact work and pending erasure fences. The observed purge writes rule out an atomic purge rollback as the current failure. They do not prove which subsequent raw query failed.
- For each pending fence, `run(..., "cleanup", ...)` discovers namespace claims through `campaign_records`. It takes tracked-table and dependent-table locks, then the namespace advisory lock, rereads ownership, and calls the generated `campaign_support_lifecycle_authority(text,text,text,text,text)` using a parameterized raw query. Only after admission does it reread the fence, verify/delete the exact keys and update `cleanupCompletedAt`.
- `scripts/staging-campaign.mjs` generates that authority. Its cleanup branch selects a `public.service_erasure_fences` composite into `f`, then uses `currentRow('service_erasure_fences','f')`. The helper at line 357 always generates an `id` journal key and accesses `<alias>.id`. Here that becomes `f.id`. `ServiceErasureFence` in `packages/db/prisma/schema.prisma` has only the primary key `conversationId`, with no `id` field. The generator elsewhere explicitly treats fence keys as `conversationId`.

This is a concrete key/field mismatch in the cleanup branch. It predicts SQLSTATE 42703 and Prisma's `ColumnNotFound` category when PostgreSQL reaches that expression. It is the leading explanation for the post-purge failure, but the saved log does not uniquely attribute P2010 to it. Discovery, locks and generated integrity/preflight checks precede that expression; due-attachment selection and later cleanup writes also remain possible failure points. Worker selection is global within the disposable database, so the owned-worker failure does not identify which surviving namespace it reached first. No product source is changed. A source repair requires a separate authorized assignment after root evaluates this finding and the missing runtime distinction.

## Diagnostic transport change

Prisma 7.8.0 is resolved in the lockfile and installed locally. Its client runtime source map, `client-engine-runtime/src/user-facing-error.ts`, shows `rethrowAsUserFacingRawError` wrapping driver errors as P2010 with `meta.driverAdapterError`. The adapter-pg implementation at `dist/index.js:436` preserves `cause.originalCode`; `mapDriverError` maps 42703 to `ColumnNotFound`, 40001 to `TransactionWriteConflict`, and otherwise can use `postgres`. This explains why inspecting only `meta.code` and a truncated message loses the distinction.

The existing test-only `cleanupFailure` now reads `meta.driverAdapterError.cause.originalCode/kind`, with direct `cause` support for an unwrapped DriverAdapterError. It emits only fixed allowlisted codes and driver categories. The compact record is emitted in the child catch before execFile wraps the error; the parent re-filters that record through the same fixed vocabulary within its unchanged 8,192-character inspection bound. Added codes are 42703, 42702, 42P01 and 22P02. Unknown fields remain absent. The deadline child's raw error dump is replaced by a fixed refusal string, matching the owned worker's existing approach. No message, stderr, SQL, stack, identifier, credential, token, body or value is serialized by the added observation. Existing fixed classifications remain.

Reset already enables `STAGING_TEST_SQL_DIAGNOSTICS=1` at `scripts/testing/query-disposable-postgres.cjs`, which emits SQLSTATE separately before the remote SQL wrapper discards stderr and throws a bare error. That bridge reports the actual pg code, but the message allowlist can only see its fixed refusal. This change also lets the parent retain the newly allowlisted name-resolution code if the bridge emits it. No bridge or operator behavior changes.

Docs: installed `@prisma/client@7.8.0` runtime source map and `@prisma/adapter-pg@7.8.0` implementation/types verify the exact error shape; no external API or dependency change.

## Offline verification

All commands below passed. The dependency install used the frozen lockfile and disabled lifecycle scripts. Contracts built locally. The first DB build stopped because Prisma config requires DATABASE_URL; generation/build then passed with a synthetic loopback port-1 URL, without connecting to a service.

- `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/synthetic pnpm --filter @auto-tm/db build`
- `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit`
- In `apps/api`: `pnpm exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0`
- In `apps/api`: `AUTO_TM_TEST_DATABASES=off pnpm exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`. Static collection only, not executed passes.
- `node /tmp/issue-901-p2010-verify.cjs`: actual installed PrismaClientKnownRequestError and DriverAdapterError instances preserve 42703/P0001/40P01/40001 and their fixed categories through source reduction and parent reduction despite a large sensitive message. A real Node subprocess emits only a short sanitized record and fixed refusal. Unknown/malformed fields and sensitive values do not escape. All five embedded worker/reset programs and emitted JS parse. Undoing only the helper replacement and fixed refusal replacement restores the entire base spec byte for byte. AST comparison retains all 2,058 selected expect-related call nodes and all 32 plain case declarations in order. The existing two-value media parameterization remains unchanged; no test execution count is inferred.
- `pnpm check:agent-docs` and `git diff --check`

All assertions, operations, order, test data literals, counts, caps, deadlines, timeouts, signals and concurrency remain unchanged. Only diagnostic vocabulary/metadata extraction and the raw diagnostic dump change. Owning context ownership and constraints are unchanged; no overview update is needed. Broad unchanged suites were not run.

## Ranked remaining hypotheses and handoff

1. Generated fence-key mismatch. Prediction: a future authorized execution reports 42703/ColumnNotFound; correcting only the fence key/field would let that authority branch progress. Another SQLSTATE would falsify attribution to this defect, even though the source mismatch still exists. A 42703 result alone still needs statement attribution if multiple name-resolution defects remain.
2. Generated authority integrity/preflight or lifecycle refusal. Prediction: the child reports P0001/postgres and possibly an existing fixed classification, rather than 42703. The source records several explicit refusal gates before fence validation. A confirmed 42703 at the fence expression falsifies this as the first cause.
3. Raw-query lock, cancellation or transaction failure before cleanup admission. Prediction: 40P01, 55P03, 57014, 40001 or a fixed transaction/connection category. A deterministic 42703 or P0001 authority result would disfavor it.

Exact original SQLSTATE, failing statement, successful fence completion, successful f5/f7/f8 reset, clean downstream setup, and both selected-worker race orderings remain UNKNOWN. This checkpoint does not repair budgets, media, drafts or #914, and does not authorize root to claim runtime green. Root must assemble the checkpoint and decide whether to authorize a bounded source repair or obtain a future hosted diagnostic observation. No CI wait is pending.
