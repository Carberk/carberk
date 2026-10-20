# Full-v3 coordinator promotion test handoff

Test-only preparation from root `fd26b1ded0c74085530183171d9e09c45ae974ef`, under the [approved actor decision](full-v3-moderation-actor-decision-20261020.md). Reserved and pushed `agent/issue-901-v3-coordinator-promotion-tests-20261020` before editing. The host scaffold `t3/3dd08689` remains at the supplied root. Only `CampaignFullV3.e2e.spec.ts` and this handoff are owned. No PR, children, production edits, services, Docker, database integration, CI inspection, staging or provider operations were performed. Root owns batching; this preparation does not hold the ready owner/moderation source batch.

## Prepared coverage

Four separate cases follow the original seventeen cases. Their complete original block is byte-identical to the supplied root. Test infrastructure adds only the real `AdminController` to the existing Nest composition and local test helpers.

- `b5`: ordinary coordinator OTP sign-in, real staff TOTP enrollment/verification, marketplace role refusal both before and after elevation, exact accounting and reset. No promotion precedes this case.
- `b6`: actual command dry-run, buyer-to-admin commit with discarded successful response, identical no-op retry, unchanged fourteen other Users and unchanged credentials/grants, exact contact-free audit, current-role/elevation HTTP guards, normal TOTP and protected authority success. Admin role still fails admission without `founder.admission`. Reset loses its response, redacts every retained audit, retries identically, removes credentials and rejects refresh and post-disposal promotion.
- `b7` with foreign reservation `b8`: all fourteen other alias promotions refuse without changing Users, auth, audits or journal. A mismatched runtime SHA command also refuses. The foreign reservation remains exactly unchanged. A write-free coordinator dry-run controls command loading and lookup first.
- `b9`: successful dry-run, test-only manifest lifecycle injection to cleaning, real-command refusal with exact unchanged state, reset, terminal refusal and exact disposal. No application guard, role, auth state, receipt or audit is seeded.

`promote` awaits `node --import tsx scripts/promote-admin.ts` in `packages/db`, using the disposable worker's existing `DATABASE_URL` and explicit `AUTOTM_COMMIT_SHA`. This runs the checked-in command and its separate Prisma transaction, rather than reproducing its implementation. It follows the existing DB command test's single-Node convention. Each child callback settles before any assertion; a 30-second process bound kills that Node with SIGKILL and throws on timeout. No concurrent children or database transaction barriers were added. Existing fixture/process transports, known-job-ID finally cleanup and reset finally cleanup remain intact. No provider is mocked and OTP_TEST_MODE is disabled by the existing setup.

## Predicted reach, not observed RED

At the supplied root, assuming fixture and normal OTP setup succeed, `b6` first fails its actual command success assertion. `scripts/staging-campaign.mjs` `track_business` rejects the User UPDATE because `role <> 'buyer'`, raising `Synthetic identity changed`. The checked-in command catches it and exits 1. The transaction rolls back before its `ADMIN_BOOTSTRAP_PROMOTE` INSERT. No new test asserts a setup HTTP 500 as RED. No behavioral test was executed here, so this remains a prediction, not hosted RED evidence.

The command currently does not read AUTOTM_COMMIT_SHA or forward a candidate into its transaction. Its stale-candidate refusal is therefore masked by the general role refusal until a successful current-candidate command is demonstrated. The current generic audit ownership branch recognizes `targetType='User'`; the real command writes lowercase `user`. Exact audit adoption and disposal must be proved after the role barrier is repaired, rather than inferred from the earlier refusal.

`AdminGuard` checks current role before Session elevation. The selected existing `GET /api/v1/admin/authority` route needs no media graph. An elevated buyer receives `Admin role required`; the promoted User's still-buyer JWT resolves the current database role, then its live unelevated Session receives `Admin TOTP elevation expired`. Normal TOTP verification permits authority. The staff policy checks missing capability before elevation, so admission receives `CAPABILITY_REQUIRED` even for an elevated admin with the fixed bootstrap grants.

## Exact bounded accounting

All numbers below are source-derived assertions awaiting hosted readback. Limits remain 128 records and 2048 events per reservation. Cleanup includes one event per deleted non-audit row and one redaction event per retained audit. Terminal retry must add nothing.

- `b5`: 7 HTTP requests, 1 sign-in delivery, 34 records, 38 events before reset, 72 after reset, 2 retained redacted audits and 1 permanent tombstone.
- `b6`: 9 HTTP requests, 1 sign-in delivery, 35 records, 40 events before reset, 75 after reset, 3 retained redacted audits and 1 permanent tombstone. Four command processes include dry-run, promotion with lost response, no-op retry and post-disposal refusal.
- `b7` and `b8`: no HTTP or delivery. Each has 21 records and 21 events before reset, 42 after reset and 2 retained audits. Sixteen command processes comprise one dry-run, fourteen other-alias refusals and one stale-candidate refusal.
- `b9`: no HTTP or delivery, 21 records and 21 events before reset, 42 after reset and 2 retained audits. Three command processes comprise dry-run, cleaning refusal and terminal refusal.

Total added HTTP requests are 16, OTP deliveries 2, promotion processes 23 and ordinary email-worker processes 2. Fixture/reset SQL transport processes continue to use existing conventions. Each reservation asserts per-table record counts and exact ledger/sink request IDs. `b5`, `b6` and `b9` also assert terminal event totals. The auth costs come from `VerifyOtp` consuming then binding the code, and `PrismaTotpEnrollmentRepository.completeFirstVerification`, not extra quota. Maximum per-reservation records/events are 35/75 including cleanup.

## Evidence and remaining gates

Offline checks passed after the final test edits:

- `pnpm install --frozen-lockfile --offline`, disposable-placeholder `db generate`, contracts build and DB build. Initial DB build without DATABASE_URL refused configuration; rerun with an inert loopback port-1 URL passed without opening a service.
- `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit`.
- Focused ESLint with zero warnings and `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --json`.
- Exact original-case block comparison and `git diff --check`.

Docs: not applicable, internal test composition reuses checked-in process/auth conventions; no dependency or service contract changed.

All service-backed outcomes are UNKNOWN. In particular, coordinator promotion, atomic rollback on a refused promotion audit, candidate binding, retained promotion-audit disposal, and foreign-reference audit rejection remain unproved. The sanctioned command accepts no actor/target override and always generates a null-actor audit for its selected User. This test does not forge a promotion receipt or invent a foreign selector to claim foreign-reference coverage. Preserving `b8` is foreign-reservation preservation, not proof of rejecting a malformed audit. Existing DB command tests own injected audit-failure rollback coverage. Reverse-transition rejection and the complete fourteen-alias capability-denial matrix remain deeper criteria for root's final candidate evidence; no role or capability was seeded to reach them. Marketplace mutation, media/video, native and deployed acceptance remain outside this preparation.

Stop after pushing this test-only checkpoint. Root chooses the next hosted disposable execution and source batch; no CI wait is authorized here.
