# Full-v3 ordinary sign-in session source

Source slice for #901 under #897 and sole draft PR #904. Base `93f158c367240e3864b924ba36fec49eb3aea7b8`; branch `agent/issue-901-v3-session-20261020`. The acceptance spec and worker helper are unchanged. This slice does not establish hosted GREEN, deliver auth or release completion, or activate anything operationally.

## Hosted RED and cause

Root supplied PR Checks `39419437839`, API job `118616495648`. In `CampaignFullV3`, the main and changed-candidate cases got 500 rather than 201 from `/api/v1/auth/otp/verify`, at spec line 142. The logs are `/tmp/carberk-next-release-20261020/93f158c3-api-118616495648.{raw,plain}.log`.

The first rejected mutation was the OTP binding update, not the Session insert. Plain-log lines 2623-2625 come from the PostgreSQL service log:

- `ERROR: Campaign parent or key transfer`
- `CONTEXT: ... cf_a8a8…track_business() line 45`
- `STATEMENT: UPDATE "public"."otp_requests" SET "verifiedAt" = $1, "userId" = $2 ...`

That statement is `PrismaOtpRequestRepository.markVerified`. `RequestOtp` reserves sign-in codes with `userId: null`, and `VerifyOtp` binds the consumed code to the User. The v3 trigger listed `userId` as immutable for every table. Attempt counting and `consumeIfUnused` ran before the binding and passed. The API process logged `DriverAdapterError: Campaign parent or key transfer` twice (lines 1740 and 1962), which matches the two verify 500s.

Confidence in the cause is high for the changed-candidate case (`a8`), where the database trace is direct. It is strong for the main case (`a4`), where the API error is identical but the earlier PostgreSQL log lines are not in the captured window. Had the binding passed, the Session insert would have refused next as `Campaign authentication slice unavailable`.

## Change

`scripts/staging-campaign.mjs`, v3 profile only:

- **OTP binding.** An OTP `userId` change is exempt from the immutability rule only from NULL, and only after `verifiedAt` (consumption) is set. The existing OTP guard still requires that User to be the roster User owning the destination, with the same destination, purpose, channel and null business/phone. Re-binding, clearing, or binding an unconsumed code still refuses.
- **Sessions.** `sessions` leaves the closed set. The relation set, locks, schema fingerprint and 22 triggers are unchanged. Sessions are owned through the recorded roster `userId` edge and journaled with exact row hashes. They keep the current-candidate binding, lifecycle (`cleaning`/`disposed` refuse), key-reuse, transfer-refusal and 128-row/2048-event headroom guards. Insert or update refuses `Unsupported campaign session` for a non-roster User or a non-null `adminTotpExpiresAt`, so no pre-elevated or elevated Session exists.
- **Integrity and collision.** These refuse any `Untracked campaign session` of a roster User. They no longer refuse every Session.
- **Reset.** Reset deletes recorded sessions before users. It still refuses with `Campaign delivery disposal unavailable` before `cleaning` whenever ledger entries exist. It does not claim delivery disposal.

TOTP enrollment and backup codes, elevation, grants, admission, content, queue/sink disposal, the CLI, the controller and Railway all stay closed. The v1/v2 generated paths are byte-identical.

## Local checks

These ran offline, with no database, Redis, services or staging.

- `node --check scripts/staging-campaign.mjs`: PASS.
- `node /tmp/issue901-v3-session-source-check.mjs`: PASS. Compared with `93f158c3`, v1 functions and the four v2 SQL paths are identical. The v3 lock/trigger set is unchanged, the new guards are present, and the disposal refusal comes before `cleaning`. It uses a fake transport; no SQL ran.
- The spec-style source concatenation compiles in a VM: PASS.
- `git diff --check`: PASS.

The SQL and HTTP behavior is not executed locally and remains unknown.

## Expected next hosted barriers (predictions)

- **Main case:** sign-ins should pass. The next barrier is `elevate`'s TOTP enrollment (500 rather than 201), or an earlier non-elevated grant write if one exists.
- **Changed candidate:** sign-in, the binding refusal and the unchanged digest should pass. The final `reset` should exit 1 rather than 0 on delivery disposal.
- **Foreign-queue and active-delivery cases:** unchanged. They still wait on the delivery-disposal slice.
