# Staff elevation expiry test handoff

This is a test-only checkpoint for #901 under #897 and PR #904. Base `ff9a6496`, which implements the [expiry proof plan](staff-expiry-proof-plan-20261020.md). Branch `agent/issue-901-staff-expiry-tests-20261020`.

Only `CampaignFullV3.e2e.spec.ts` changed: 81 lines added, 1 changed. The changed line is the `vitest` import, which now includes `vi`. All 14 existing cases are untouched. No source, guard, TTL, timeout or concurrency changed.

## Case

The new case is `refuses an elevation that expired by the API clock, keeps it through refresh, and re-elevates the same and a fresh Session`, reservation `"b2".repeat(16)`.

It runs inside `withKnownJobs` and `resetAfter`. Real timers are restored in a nested `finally` that wraps only the time window, so they are real before any assertion outside it and before any cleanup.

1. **Real time.** Coordinator signs in, elevates and grants `founder.recovery` to support (204).
2. **Window.** `vi.useFakeTimers({ toFake: ["Date"], now: Date.now() − (12 h + 2 min) })` fakes only in-process `Date`, frozen. Inside it, support does an ordinary `signIn` (OTP request, the real worker child writing the sink, verify) and enrolls. The first verify uses `generateSync` on the returned secret at the window's own time. Assertions: 10 backup codes, and capabilities equal `{capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt}`, so the elevation was valid when issued.
3. **Real time, stale.**
   - The server-issued deadline is `< Date.now()` and `> Date.now() − 10 min`, an ordinary 12 h deadline that has already passed.
   - Recovery of an absent business returns 403 `ELEVATION_REQUIRED`.
   - Capabilities equal `{…, elevated: false, adminTotpExpiresAt: <same deadline>}`.
   - Refresh returns 201. With the new token, capabilities are identical and recovery is still `ELEVATION_REQUIRED`.
4. **Same Session.** A real-time TOTP code returns 201 with body keys exactly `["adminTotpExpiresAt"]` and a future deadline. Capabilities are elevated with that deadline, and recovery returns 409 `RECOVERY_REQUIRED`.
5. **Logout.** Logout returns 204. The old token gets 403 `SESSION_REQUIRED` on both capabilities and recovery, and the old refresh token gets 401.
6. **Fresh Session.**
   - An ordinary real-time `signIn` succeeds, so the window's request is outside the 60 s backoff. It has a new request ID, and the helper's one-Session check holds.
   - Capabilities equal `{capabilities: ["founder.recovery"], elevated: false}` with no deadline key, and recovery returns `ELEVATION_REQUIRED`.
   - The returned `backupCodes[0]` gives 201 and a future deadline. Reusing it gives 400 `INVALID_TOTP`.
   - Capabilities are then elevated, and recovery returns 409.
7. **Exact reset.**
   - Owned live rows per table are exactly `{users 15, sessions 2, otp_requests 3, totp_enrollments 2, totp_backup_codes 20, staff_grants 3, audit_logs 3, dealerships 1, dealership_members 1}`, 50 in total.
   - The ledger holds exactly the three learned request IDs.
   - The lost-receipt reset, then `assertDisposed`, then a repeat reset with the full receipt and unchanged digest, then `assertDisposed` again.
   - After that, support gets `SESSION_REQUIRED`, and both refresh tokens get 401.

## No assertion passes by construction

- **Stale refusal comes from time.** Every refusal names the exact reason. The stale-elevation refusal cannot come from a missing Session (that would be `SESSION_REQUIRED`) or a missing grant (`CAPABILITY_REQUIRED`). Step 2 proves the same Session was elevated inside the window.
- **Expected values are server-issued or literal.** The deadline compared is the one the server issued, checked against the real clock. Counts and reasons are literals.
- **Setup failures fail visibly.** A window setup failure fails at its own `expect(201)`/`toHaveLength`, never silently. Expired-elevation coverage remains the only use of `vi` in the file.

## Inference limits (UNKNOWN until hosted)

- **Assumed clock-free during the window:** the worker child (real time), BullMQ job timestamps, and Prisma-serialized `createdAt`/`updatedAt`/`verifiedAt`/`lastSeenAt` values set about 12 h in the past. Source shows the fixture and child read none of them.
- **Database-clock bound.** The fixture's `staging-campaign.mjs:424` bound (`≤ now() + 12 h 5 min`) passes because the deadline is in the past. The two real-time re-elevations depend on runner-to-PostgreSQL skew staying under 5 minutes. The coordinator elevation and the S2 case already depend on that.
- **Frozen clock.** `Date` is frozen, not ticking, inside the window. Nothing in that path requires time to advance.
- **Not proven.** Expiry measured by database time, a real 12 h passage, and the production 15 min JWT TTL. This spec's `JwtModule` has no `exp`.

## Local verification (offline only)

| Command | Result |
|---|---|
| `apps/api`: `pnpm -s typecheck` | pass |
| `apps/api`: `pnpm -s lint` | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm exec vitest list …/CampaignFullV3.e2e.spec.ts` | 15 cases collected (14 + 1) |

No Docker, services, database integration, CI, GitHub or nested agents were used. The hosted result is **UNKNOWN**. The admission source scope and its four admission-setup failures belong to another writer and were not touched.
