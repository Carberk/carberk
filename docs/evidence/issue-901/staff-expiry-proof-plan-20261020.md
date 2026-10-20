# Staff elevation expiry proof plan (design only)

For #901 under #897, PR #904, base `aa7ae0c8`. Design only: no source, test or config edit, and nothing is approved. It resolves the S2 gap recorded in the [lifecycle handoff](full-v3-auth-lifecycle-test-handoff-20261020.md).

## Source facts

- **API clock.** Elevation decisions read JS `Date`:
  - `SystemClockAdapter.now()` returns `new Date()`. It is the only `IDENTITY_TOKENS.ClockPort` binding (`identity.module.ts:201`) and is injected directly into `VerifyAdminTotp`, `RefreshSession`, `RequestOtp`, `VerifyOtp` and `GetAdminTotpStatus`.
  - `InMemoryTotpThrottleAdapter` and `PrismaSessionRepository.deleteExpiredByUserId` call `Date.now()` / `new Date()`.
  - otplib 13 `generateSync`/`verifySync` default `epoch` to now.
- **Lifetimes.** Elevation is 12 h (`VerifyAdminTotp` `ELEVATION_TTL_MS`). The refresh Session is 30 days (`VerifyOtp`/`RefreshSession` `REFRESH_TTL_DAYS`). Refresh preserves `adminTotpExpiresAt` and rotates `expiresAt`.
  - Production signs JWTs with `JWT_ACCESS_TTL` (default `15m`, `app.module.ts:51`).
  - **Correction to my earlier S2 claim:** `CampaignFullV3.e2e.spec.ts` registers `JwtModule` with no `signOptions`, so its access tokens have no `exp`. Even with an `exp`, ordinary `/auth/refresh` checks the Session's own `expiresAt` and mints a fresh token. JWT lifetime is therefore not the blocker.
- **Refusal paths.** `assertStaffElevation` (`domain/staffPolicy.ts`) uses the API `now`. `CheckStaffAuthority.summary` reports `elevated: false` together with the stored deadline. `PrismaBusinessRepository.founder` checks elevation before the capability, so `founder.recovery` gives 403 `ELEVATION_REQUIRED`.
- **Fixture database-clock guards** (`scripts/staging-campaign.mjs`):
  - `:424`: a changed `adminTotpExpiresAt` needs `expiresAt > now()` and a deadline `<= now() + 12 h 5 min`, using PostgreSQL time. There is no lower bound.
  - `:271`: a grant/revoke audit needs the actor's Session elevated in database time.
  - The OTP, TOTP and delivery guards have no time terms. `process-campaign-email.cjs` reads no time.
- **Existing coverage is insufficient for the fixture.**
  - `CheckStaffAuthority.spec.ts:39-42` and `staffPolicy.spec.ts` use fake snapshots.
  - `StaffAuthority.e2e.spec.ts:118` writes `adminTotpExpiresAt` directly.
  - Neither runs ordinary elevation through the v3 trigger.

## Forward Date advance (rejected for re-elevation)

Under `vi.useFakeTimers({ toFake: ["Date"] })` with the clock 12 h ahead, read-only requests would show the stale refusal. They take no Session write. The re-elevation that follows, on the same or a fresh Session, would write a deadline of about real + 24 h. That exceeds `:424`'s database `now() + 12 h 5 min`, so the trigger refuses it with 500 `Unsupported campaign session`. A refresh under the advance also stores future `expiresAt`/`lastSeenAt`. So forward advance can prove refusal only. Moving back to real time makes the old deadline current again.

## Recommended proof: one backward Date-only window (existing boundary, no seam change)

Time is a system boundary the standards allow tests to control. The composition reads it through `SystemClockAdapter`. Only in-process `Date` is faked. `setTimeout`, PostgreSQL, Redis and child processes keep real time. Use `S = 12 h + 2 min`, and restore real timers in `finally`.

1. **Real time.** Seed. The coordinator signs in, elevates and grants `founder.recovery` to support. This satisfies `:271` in database time.
2. **Window `Date = real − S`.** Run support's ordinary `signIn`: request, worker sink, verify. Then run enroll and first verify with an authenticator code derived from that window's epoch. Stored deadline = real − 2 min. That passes `:424`, which has no lower bound, and needs no Session write.
3. **Real time, stale refusal.** Make the protected recovery request and assert 403 `ELEVATION_REQUIRED`. Assert capabilities equal `{ capabilities: ["founder.recovery"], elevated: false, adminTotpExpiresAt: <step 2 deadline> }`. Refresh, and assert the deadline is the same and still not elevated. Both decisions use the API clock only, so database clock skew cannot affect them.
4. **Re-elevation on the same Session.** Verify with a real-time TOTP code: 201, a new deadline later than real time, then recovery returns 409 `RECOVERY_REQUIRED`.
5. **Fresh Session.** Log out (204); the old token then returns 403 `SESSION_REQUIRED`. Run `signIn` again: the 60 s backoff counts from the step-2 request, now 12 h old. Its count-1 Session assertion holds. The new Session's capabilities show `elevated: false` with no deadline, and recovery returns 403 `ELEVATION_REQUIRED`. TOTP verify then returns 201 without backup codes, and recovery returns 409. Use a backup code here instead to also cover consumption on a new Session.
6. **Teardown.** Exact reset and `assertDisposed`, with cleanup through `withKnownJobs`.

Cost: about 21 + 13 + 13 + 2 = 49 records and 3 deliveries; event counts are UNKNOWN. No sleeps, TTL or timeout changes, seeded tokens, Session writes, fixed codes or provider overrides.

## Limits and residual risk

- **Assumptions.**
  - The proof relies on the API reading JS `Date`. If identity later moved to a database clock, step 3 would fail loudly, not pass vacuously.
  - The `Date` fake affects only this Vitest worker, which runs the file's cases sequentially. BullMQ job timestamps and Prisma-serialized `createdAt`/`updatedAt` in the window are past values. The fixture checks none of them. This is inferred from source and **UNKNOWN until hosted**.
- **What it does not prove.**
  - Expiry under database time.
  - A real 12 h wall-clock passage.
  - Production JWT TTL interplay.
  - The forward-advance path.
- **If root rejects faking `Date`.** The minimal proper seam is *not* a fixed clock or a test config. Every identity use-case and adapter would inject `IDENTITY_TOKENS.ClockPort` (replacing the concrete `SystemClockAdapter` imports and the raw `Date` in the throttle and `deleteExpiredByUserId`). A test could then provide an offset clock as an ordinary Nest provider. That is a repo-wide auth change and conflicts with this spec's no-override rule. It is **not recommended**, because the backward window already exercises the actual composition.
