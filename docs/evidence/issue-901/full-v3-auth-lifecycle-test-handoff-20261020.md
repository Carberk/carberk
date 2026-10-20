# Full-v3 auth lifecycle test handoff

This is a test-only checkpoint for #901 under #897 and PR #904. Base `9fb10b28a8a91114d1ef8bdc837632b259efb4e1`, branch `agent/issue-901-v3-auth-lifecycle-tests-20261020`. Root batches it with the independent source work. Nothing here changes application, `scripts/staging-campaign.mjs`, `scripts/testing` helpers, capacity, locks, timeouts, concurrency or entry gates.

## Added case

There is one case, `re-elevates a granted staff alias, consumes one backup code once, refuses a revoked grant on the next request and disposes exactly`, in `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`. Its reservation is `"ab".repeat(16)`. The actors are coordinator and the distinct roster alias `support`. The eight existing cases and every helper are unchanged; the diff only adds lines. The case runs inside `withKnownJobs`, so `finally` removes only the request IDs that `signIn` learned. It never enumerates a queue.

The protected request is `POST /api/v1/business/<random absent UUID>/recovery` under `founder.recovery`. `PrismaBusinessRepository.recover` checks Session, elevation and capability before it looks up the business. An authorized caller is therefore refused with 409 `RECOVERY_REQUIRED` and nothing is written. A caller without the capability gets 403 `CAPABILITY_REQUIRED`. The case does not use admission, so the unresolved admitted-Dealership ownership and `measurement_state` questions are out of its path.

## Exact assertions, in order

1. Before any grant, `GET /staff/capabilities` for support returns 403 with `details` `{ reason: "CAPABILITY_REQUIRED" }`.
2. The coordinator runs `elevate` and grants `founder.recovery` to support (204).
3. Support enrolls (201). The first TOTP verify uses a code derived only from the enrolled secret: 201 with 10 backup codes. Recovery returns 409 `RECOVERY_REQUIRED`.
4. Ordinary refresh returns 201. With the refreshed token, capabilities equal `{ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: <first deadline> }`. Refresh does not extend the deadline.
5. Re-elevation by TOTP code returns 201. The body keys are exactly `["adminTotpExpiresAt"]`, the deadline is later than the first, and capabilities report it.
6. Elevation by `backupCodes[0]` returns 201. The body keys are exactly `["adminTotpExpiresAt"]` and the deadline is later again. Reusing the same code returns 400 `INVALID_TOTP`, and the deadline stays unchanged. Storage then shows exactly 1 used and 9 unused backup codes for support. No route reports remaining codes, so this is read from storage.
7. Revoke returns 204. On the next request, recovery, capabilities and TOTP verify each return 403 `CAPABILITY_REQUIRED`. Support still has exactly 1 Session, so the refusal is per-request grant checking, not Session loss.
8. Re-grant returns 204. Capabilities equal `{ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: <backup deadline> }` and recovery returns 409 `RECOVERY_REQUIRED`.
9. The `User` audits for support are exactly GRANTED (`previouslyActive: false`), then REVOKED (`true`), then GRANTED (`false`). Each has the coordinator as actor, capability `founder.recovery` and the shared reason.
10. Owned live records per table are exactly `{ users: 15, sessions: 2, otp_requests: 2, totp_enrollments: 2, totp_backup_codes: 20, staff_grants: 3, audit_logs: 5, dealerships: 1, dealership_members: 1 }`, 51 in total. The delivery ledger holds exactly the two learned sign-in request IDs.
11. Reset with a lost receipt exits 0 with no receipt. `assertDisposed` then confirms every owned non-audit row is absent. That covers the TOTP enrollment (the secret), backup codes, Sessions, OTP rows, grant row and sink. Audits are retained redacted, and each delivery has a permanent tombstone with no job.
12. A repeated reset returns the full disposed receipt with `queueJobs: 0` and `sinkRecords: 0`. The digest is unchanged and `assertDisposed` passes again.
13. After disposal, support's capabilities return 403 `SESSION_REQUIRED`, both refresh tokens return 401, and re-fixturing the id exits 1.

## Expired elevation: exact gap

Elevation expiry is not covered. `VerifyAdminTotp` and `GetAdminTotpStatus` inject the concrete `SystemClockAdapter` class, and `CheckStaffAuthority` injects `IDENTITY_TOKENS.ClockPort`, which `identity.module.ts:201` binds `useExisting: SystemClockAdapter`. That adapter returns `new Date()`. No environment or configuration time source exists in the composed module. The only ways to observe expiry would be a provider override (this spec forbids it), a direct Session `adminTotpExpiresAt` write (forbidden), global fake timers (they also move JWT, BullMQ and Prisma time, and the 15-minute access token would expire first), or a 12-hour wait. Closing the gap needs a source decision on a legitimate injectable clock in real composition.

A second gap is a fresh-Session re-elevation, that is, sign out and sign in again before re-elevating. It is not covered because a second ordinary OTP request to the same destination meets the 60 s `SIGN_IN_CODE_RATE_POLICY.baseBackoffSeconds` backoff. Re-elevation is therefore proved on the same Session.

## Predicted cost (inventory-grounded, unreviewed)

The case writes 51 records: bootstrap 21, two sign-ins 4, two first TOTPs 22, one grant row and three audits. It makes 2 deliveries. Event counts are **UNKNOWN** until the hosted trace. The current main journey is unchanged and is not adjusted to the inventory's unreached 60-row estimate.

## Local verification (offline only)

| Command | Result |
|---|---|
| `DATABASE_URL=<placeholder> pnpm -s build` in `packages/db` (Prisma generate, no connection) | pass |
| `pnpm -s typecheck` in `apps/api` | pass |
| `pnpm -s lint` in `apps/api` | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm exec vitest list …/CampaignFullV3.e2e.spec.ts` | 9 cases collected (8 existing + 1) |

No Docker, local database, service-backed test, staging, CI dispatch, issue or PR mutation was used. The hosted result is **UNKNOWN**. It is not predicted here.
