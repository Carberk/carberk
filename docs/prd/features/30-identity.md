# 30 — Identity

## Summary

Code-based sign-in by phone or email, with no passwords, and basic user profiles. The MLP beta uses identity for "who is this person and what can they do?" Dealership memberships and Garage remain target capabilities, but are post-MLP bets per [ADR-0027](../../adr/0027-mlp-beta-scope.md).

## Why it exists

Every gated action (contact seller, sell, later favorite/save search) needs identity. Anonymous browsing is the default; auth is triggered on action with deferred-action replay. TM users are phone-rooted (most don't use email reliably), so phone is the main sign-in path. Email sign-in reaches store reviewers abroad and people without a working SIM. Both are Sign-in Methods on the same User ([ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md)). Admin UI exposure requires TOTP on top of OTP per ADR-0006 / ADR-0012.

## What it does (user-visible behavior)

### Sign in flow

1. User taps a gated action (e.g., ♥ on a listing)
2. Bottom sheet uses action-specific copy, for example "Sign in to save listings", plus "Continue with phone"
3. Full-screen auth route `(auth)/phone`: user enters phone number (+993 prefix locked; mobile prefix validated)
4. Phone entry shows implicit legal agreement copy with Terms and Privacy links; no checkbox in S2
5. Backend issues 6-digit OTP, dispatches via SMS gateway
6. Full-screen auth route `(auth)/otp`: 6 visual pin cells backed by one actual input, paste/SMS autofill support, auto-submit on 6th digit
7. Resend after 60s timer
8. On success: JWT issued, user returned to the original action they tapped; if no deferred action exists, route to the tab app

The same flow works with an email address instead of a phone. A confirmed code for a phone or email that no User holds creates a new User with only that Sign-in Method, unless `SIGNUPS_ENABLED=false`. Requesting a code never reveals whether the value is registered.

### Sign-in Methods

Per [ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md):

- A User has an optional, unique, verified phone (`+993` only) and an optional, unique, verified email (trimmed and lowercased). A live User has at least one.
- A signed-in User adds the missing method, or replaces one, by confirming a code sent to the new value. A value held by another User, including one in the deletion grace period, is refused after the code is confirmed, with `SIGN_IN_METHOD_TAKEN`. Users are never merged.
- Sign-in Methods can be replaced but not removed. Replacing frees the old value immediately and leaves sessions and Listings alone.
- Listing contact is owned by the Listings capability, not by Sign-in Methods. Per [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md), publishing, republishing, or editing a Listing needs a verified contact phone for that Listing; email-only Users verify one in the Sell wizard and do not need to add an account phone. Listing contact does not add an account-phone prerequisite or a per-Listing phone-verification badge.
- Codes: 6 digits; 5 wrong attempts; 5 requests per destination per 24 hours; `60 × 2^N` backoff; expiry 5 minutes for phone and 10 minutes for email; 10 requests per IP per hour shared across channels. Sign-in, add/change and deletion codes share these budgets.
- API: `POST /api/v1/auth/otp/request` and `/verify` accept `{ phone }` or `{ email }`. `GET /api/v1/me` returns nullable `phone` and `email` plus `phoneVerified`. `POST /api/v1/me/sign-in-methods/request` and `/verify` add or replace a method. Shapes are Zod schemas in `@auto-tm/contracts`.
- Email codes are sent by `apps/worker` through Resend's HTTPS API, with Amazon SES as the fallback. The API only enqueues. In the TM era email sign-in is best-effort through the TM Proxy PC, and phone stays primary ([ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md)). The worker side has shipped: the `email-code` queue consumer, the Resend and mock adapters, the RU/TK/EN message and the 80-a-day cap. The API enqueues email codes for sign-in, for adding or changing a Sign-in Method, and for account deletion.

### Admin TOTP enrollment

1. After OTP success, if user has `role='admin'`, the API creates a normal non-elevated Session and returns tokens with `sid`.
2. Admin app calls `GET /api/v1/auth/admin/totp/status` server-side to decide whether enrollment or code entry is needed. The response contains only `enrolled`, `elevated`, and `adminTotpExpiresAt?`; it never returns secret material, QR material, backup codes, or backup-code counts.
3. If not enrolled, `POST /api/v1/auth/admin/totp/enroll` returns QR enrollment material (Google Authenticator-friendly URI) with issuer label `auto.tm Admin`. Verified enrollment cannot be repeated in S7 (`TOTP_ALREADY_ENROLLED`); pending unverified enrollment is idempotent and returns the same secret/QR across calls and sessions until first verification, so a scanned authenticator entry remains usable if the admin leaves and logs back in (see ADR-0038 for the security tradeoff).
4. User scans, enters 6-digit TOTP code.
5. `POST /api/v1/auth/admin/totp/verify` verifies the code, completes enrollment, returns `adminTotpExpiresAt` plus 10 backup codes exactly once, and sets `Session.adminTotpExpiresAt`. TOTP verification accepts the current 30-second step plus one adjacent step for small clock skew.
6. Backup codes are shown in a screen-only panel with copy-to-clipboard; user must check "I saved them" before continuing. From now on, admin-only APIs require OTP + current TOTP elevation.
7. On later admin logins, the same verify endpoint accepts either a TOTP code or one backup code for elevation and returns `adminTotpExpiresAt` only, never backup codes again.

### Profile screens

Cabinet is a menu, and Profile is one screen below it ([20 — Information architecture](../20-information-architecture.md#tab-5--cabinet-menu)). There is no Settings screen.

- **Cabinet** holds the profile row that opens Profile, plus Language and Theme (system / light / dark, as bottom-sheet pickers). Language and theme are not edited on Profile.
- **Profile (own)** shows the avatar, the display name, and the two Sign-in Methods (a masked value, or Add). It also holds **Log out** and **Delete account** at the bottom.
- **Display name and profile photo.** Every User gets a randomly assigned display name, and the User can edit it on Profile. The User can set a profile photo; until then the User shows a car-themed avatar from a small library that AutoTM assigns. Profile shows and edits both, including a saving state. Their screens (name format, editor, photo picker and upload, avatar library) follow the #353 profile identity update, which is still being prototyped; this PRD does not design them.
- **Sign-in Methods** are added or changed on Profile. Changing one asks for confirmation in a sheet first, because the old value stops working. A value already used by another User is refused, and Users are never merged ([ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md)).
- **Log out** lands on Cabinet, signed out.
- The release Profile has no tenure ("member since") and no Listings count. The My listings row on Cabinet carries the total.
- **View other user:** avatar, name, tenure, public listings
- **Block user** from a Conversation is recorded in the `BlockedUser` table.

Post-MLP profile additions: public Garage entries, blog posts, richer trust stats, and per-category notification preferences ([36 — Notifications](36-notifications.md#preferences-screen)).

### Dealership (post-MLP bet)

- A user can apply to create a Dealership (form: name, city, logo upload, description, working hours)
- Admin reviews and verifies → sets `verifiedAt` → PRO badge appears
- Dealership owner can invite other users as members (role: `sales`)
- A dealership has a public showroom page (see Feature 38)

### Account deletion (App Store hard requirement)

Apple App Store policy requires every app with account creation to offer in-app account deletion. This is non-negotiable.

- Cabinet → Profile → Delete account. The screen states the 30-day grace period instead of "This can't be undone": what happens to the User, Listings and Conversations, then an "I understand" tick, a confirmation dialog, and a scheduled screen. Deleting from the app uses the signed-in session and asks for no code and no re-entered phone or email.
- Finishing deletion signs the User out everywhere and lands on Cabinet, signed out.
- Soft-delete: `User.deletionScheduledAt` set; the User's active Listings → `archived`, tagged `archivedByDeletion` ([ADR-0032](../../adr/0032-account-deletion-grace-period.md)); Conversations → closed system message; refresh tokens revoked
- 30-day grace period: signing back in with either Sign-in Method asks whether to restore the User. Only confirming the restore prompt clears `deletionScheduledAt` and republishes the Listings that the deletion archived, to their pre-deletion active state with their original publish dates ([#871](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/871)); Listings the User had archived earlier stay archived ([ADR-0032](../../adr/0032-account-deletion-grace-period.md)). Cancelling leaves the deletion pending and the User signed out. An unrelated sign-in gets no prompt and does not touch the deleted User.
- After 30 days: hard-delete personally identifiable data, including nulling `phone`, `email` and both verified-at times; preserve listings, messages, moderation reports, and audit rows as "Deleted user" / historical attribution for audit trail
- API endpoint: `DELETE /api/v1/me`
- Web deletion page (Google Play requirement): the person enters a phone or email, confirms a code sent to it, and the same 30-day grace period starts. Backed by public `POST /api/v1/account-deletion/request` and `/confirm`, and served at `https://auto.tm/<locale>/account/delete` (linked from the privacy policy). The page's wording is the same whether or not a User holds the value.
- Admin can see deletion requests in the audit log; cannot reverse them after the 30-day window
- S8 deletion must preserve S7 moderation history: `ContentReport` rows survive reporter/reviewer deletion with nullable user references, no reporter/reviewer PII snapshots are stored on reports in the MLP, and reporter deletion or suspension does not invalidate existing reports.

MLP beta decision: keep the 30-day grace period. The S2 hard-delete endpoint is not the final legal/account-deletion behavior; S8 must align implementation and support docs with this section before private beta.

## Screens / states

| Screen | State | Notes |
|---|---|---|
| Phone entry | Empty | Default — phone field focused, +993 prefix shown |
| Phone entry | Invalid format | Inline error: "Введите номер в формате +993 6X XXX XX XX" |
| Phone entry | Rate-limited | Error: "Too many attempts. Try again in 10 minutes." |
| OTP entry | Empty | Auto-focus on first pin |
| OTP entry | Wrong code | Shake animation + clear, "Wrong code, try again" |
| OTP entry | Expired | "Code expired. Request a new one." |
| OTP entry | Dev test mode | Non-production only: show "Dev code: 123456" if API returns `testCode` |
| OTP entry | Locked | Inline countdown / request-new-code state; no separate error route |
| OTP entry | Daily limit | The person has used up the day's codes and cannot reach Cabinet → Help. The code screen shows a Contact support link that opens Help (email and phone). This is the only support link on the code screen (founder decision, [#353](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353#issuecomment-5947334041), answer 1). |
| Sell contact step | Email-only or different phone | Verify the Listing contact phone in the Sell wizard; no account phone is required |
| Profile (own) | Loading | Profile is being fetched |
| Profile (own) | Error | Profile failed to load; Retry |
| Profile (own) | Phone only | Masked phone, Add email |
| Profile (own) | Email only | Masked email, Add phone |
| Profile (own) | Both | Masked phone and masked email |
| Profile (own) | Confirm sheet | Changing a Sign-in Method asks for confirmation first, because the old value stops working |
| Profile (own) | Value refused | The value is already used by another User; Users are never merged |
| Profile (own) | New user | Randomly assigned display name and a car-themed library avatar, each editable (design follows the #353 profile identity update) |
| Profile (own) | Saving | Display name or photo save in progress (design follows the #353 profile identity update) |
| Profile (own) | Suspended | Banner: "Your account is suspended. Contact support." Auth/session/account-deletion still work; marketplace mutations are blocked. |
| Profile (other) | Default | Show public info only |
| Profile (other) | Blocked | "You blocked this user. Unblock?" |

## Data references

- `apps/api/src/modules/identity/CONTEXT.md`
- Entities: `User`, `Session`, `OtpRequest`, `Dealership`, `DealershipMember`, `OwnedVehicle`, `BlockedUser`, `TotpEnrollment`

## Decisions

- [ADR-0006](../../adr/0006-auth.md) — Phone OTP + custom SMS gateway + TOTP for admins
- [ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md) — Phone or email sign-in share one User (supersedes ADR-0006's phone-only rule)
- [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md) — Listing contact phones are verified; supersedes ADR-0054's publishing and seller-trust phone requirements
- Mobile S2 auth routes are `(auth)/phone` and `(auth)/otp`. Historical `login` / `login/otp` route names are superseded for the mobile implementation.
- Legal agreement in S2 is implicit copy under the phone CTA: "By continuing, you agree to the Terms and Privacy Policy." Add a checkbox only if legal review requires explicit recorded acceptance. Legal pages remain canonical on web.
- OTP login does not ask for native notification permission. Notification prompts are tied to later user actions that need notifications.
- OTP SMS bodies must be formatted for iOS and Android autofill. The API/SMS gateway owns formatting; the phone-agent sends the body unchanged.
- `apps/api` remains bearer-token only for the MLP. Admin web cookies are owned by `apps/admin`; its server actions / route handlers forward bearer tokens to the API.
- Admin token cookies are HTTP-only, `Secure`, `SameSite=Lax`, `Path=/`, max-age aligned to token/session lifetimes, and use production names `__Host-auto_tm_admin_access` and `__Host-auto_tm_admin_refresh` with no `Domain` when admin runs on its own host. Local dev may drop the prefix only when `__Host-` constraints cannot be satisfied. Browser client code never receives admin tokens and does not call `apps/api` directly.
- Admin server actions / route handlers refresh once on API 401, rotate cookies on success, retry the original API call once, and clear cookies + redirect to login if refresh fails. Refresh preserves but never extends `adminTotpExpiresAt`.
- S7 does not add a separate CSRF-token system for admin auth because admin mutations stay behind same-site server actions / route handlers. Any browser-posted public route handler must validate `Origin` against the configured admin origin, with no `Referer` fallback.
- Admin logout attempts API logout server-side with the refresh token but clears both admin cookies locally even if API logout fails; logout-all attempts the bearer-protected API logout-all endpoint and clears local cookies even if revoke fails.
- Admin `returnTo` after TOTP re-verification accepts only relative internal admin paths; absolute URLs, protocol-relative URLs, and cross-host redirects are rejected. S7 has no multi-tab heartbeat; tabs discover expired TOTP on their next protected action/load.
- If OTP succeeds on the admin host for a non-admin user, `apps/admin` clears admin cookies and shows generic "Admin access required" copy without exposing normal-user account details.
- Admin OTP verification uses the normal Session path. TOTP enrollment/verification upgrades the same Session by setting `adminTotpExpiresAt`; no temporary challenge-token system ships in the MLP.
- Normal OTP/refresh response contracts stay unchanged. Admin TOTP status/enroll/verify use separate authenticated endpoints under `/api/v1/auth/admin/totp/*`.
- TOTP enrollment/verification routes are authenticated identity routes, not `AdminGuard` routes. They require `role = admin`, valid `sid`, and ownership of the current Session.
- First admin bootstrap uses the S7 operator path in `docs/prd/ops/86-admin-bootstrap-runbook.md` plus `packages/db/scripts/promote-admin.ts`. The script requires `--phone` and `--reason`, supports optional `--dry-run`, promotes an existing OTP-verified user by phone to `role = admin`, exits non-zero with no audit row if no user matches, and exits zero as a no-op if the user is already `admin`; it must not create users, create TOTP enrollment, set `adminTotpExpiresAt`, mint tokens, or bypass `AdminGuard`. Its audit row is `ADMIN_BOOTSTRAP_PROMOTE` with `actorId = null`, `targetType = "user"`, `targetId = promotedUserId`, required operator reason, and role before/after in details; no phone snapshot is stored.
- `role = admin` before TOTP verification is treated as a pending admin assignment, not usable admin access. Existing S2 OTP/Session/refresh behavior stays; S7 adds `sid`, `adminTotpExpiresAt`, and `TotpEnrollment`.
- `TotpEnrollment` stores the TOTP shared secret encrypted and recoverable with `TOTP_SECRET_ENCRYPTION_KEY`; TOTP verification needs the original secret, so it is not hashed.
- `TOTP_SECRET_ENCRYPTION_KEY` must be a 32-byte base64 value validated at API startup. Missing/invalid key fails startup; there is no silent fallback and no runtime key rotation in the MLP. Rotation is post-MLP operator work because existing `TotpEnrollment` rows must be decrypted and re-encrypted.
- Admin TOTP elevation is enforced at the `AdminGuard` boundary for every admin-only API. Access JWTs carry `sid`; `AdminGuard` loads the Session and requires `adminTotpExpiresAt > now`. A plain bearer token for a `role = admin` user is not enough to mutate admin surfaces.
- Expired TOTP elevation returns HTTP 403 from `AdminGuard`; the admin app sends the admin back to TOTP verification and preserves the intended destination.
- Admin TOTP elevation lasts 12 hours per session. Refresh-token rotation preserves the same Session id and existing `adminTotpExpiresAt`; it never extends admin elevation.
- `GET /auth/admin/totp/status` returns only `enrolled`, `elevated`, and `adminTotpExpiresAt?`. `POST /auth/admin/totp/enroll` returns only QR/enrollment material; verified enrollment returns `TOTP_ALREADY_ENROLLED`, while pending unverified enrollment is idempotent and returns the same secret/QR. `POST /auth/admin/totp/verify` completes enrollment, stores one-way hashed backup codes, returns `adminTotpExpiresAt` plus 10 backup codes exactly once, and elevates the current Session. After enrollment, the same verify endpoint accepts either a TOTP code or one backup code for elevation and returns `adminTotpExpiresAt` only; backup codes are not returned on later logins.
- TOTP/backup-code verification uses explicit attempt throttling in addition to the global API throttler: max 5 failed attempts per admin user/session per 10 minutes. Wrong TOTP and wrong backup code return the same generic failure; throttled attempts return the standard rate-limit error. Successful verification resets the failure counter.
- Backup-code consumption is atomic: mark a backup code used only after a successful match. Failed TOTP/backup-code attempts go to structured API security logs, not moderation `AuditLog`; no permanent lockout, account suspension, or self-service recovery ships in S7.
- TOTP enrollment QR / otpauth URI uses issuer label `auto.tm Admin`.
- Admin backup codes are displayed once after successful TOTP verification and handled through manual operator recovery if both TOTP device and backup codes are lost or backup codes are exhausted. No printable PDF, download flow, regeneration UI, self-service recovery, admin demotion/deprovision UI, or moderation-based admin suspension ships in the MLP.
- Future admin account management belongs jointly to Identity and Admin, not to the S7 report queue. Deprovision, role hierarchy, read-only support accounts, emergency lockout, and admin session review require a shaped post-MLP admin-account-management bet with explicit operator recovery and audit rules.
- S7 user suspension is simple current state on `User`: `identity/` owns `suspendedAt`, `suspendedById?`, and internal `suspensionReason?` behind `IdentityAdminPort.suspendUser` / `unsuspendUser`; `admin/` orchestrates report resolution and audit around that port. Suspend sets those fields from the normalized internal admin action reason, and unsuspend clears them. S7 suspension is not admin account management: `role = admin` targets and self-targets are rejected before mutation, report resolution, or audit. AuditLog carries full history. Suspended users may still log in, browse, log out, view the generic suspension state, and delete their account, but cannot create/edit/publish listings, contact/message sellers, submit reports, or perform other authenticated marketplace mutations. Blocked authenticated mutations return HTTP 403 `FORBIDDEN` with `details.reason = "USER_SUSPENDED"` and generic client copy. Pending reports do not block account deletion in S7; if a reported user is deleted before review, the report remains visible to admins with target unavailable and report-backed suspend is no longer actionable. Suspended users can still be report targets only while they remain reachable through a public surface; visible admin users can also be reported without public staff-role leakage, though report-backed suspend stays forbidden; missing, deleted, or hidden users return `NOT_FOUND`. User suspension does not auto-ban, hide, archive, or delete the user's listings; listing visibility remains governed by listing status/admin bans. Existing conversations remain readable, but new contact/messages are blocked when either participant is suspended. Successful state changes may emit internal `UserSuspended` / `UserUnsuspended` events after commit, but S7 ships no user-facing consumers, notifications, system messages, or worker jobs from those events. No suspension duration, automatic expiry, warning ladder, public admin-reason exposure, target lock, legal hold, admin suspension via moderation, or separate suspension-history table ships in the MLP.
- Account deletion keeps a 30-day grace period before PII purge. This is required for the MLP beta legal posture unless legal review explicitly supersedes it.

## Phase

**Phase 1 MLP beta for phone or email code sign-in and basic profile.** Dealership membership, Garage, notification preferences, and rich public profile surfaces are post-MLP bets.

## Out of scope

- Email-based password recovery (no passwords in MVP)
- Social login (Google / Apple)
- Biometric (Face ID / Touch ID) — could add in Phase 1.5 as a session-unlock convenience
- Device management UI for revoking a specific other device — multi-device sessions are allowed per ADR-0012
- Magic links, merging Users, and removing a Sign-in Method
- An OTP "Having trouble?" support/help link on every code screen — revisit after real delivery data; S2 keeps the flow minimal. The one exception is the Contact support link at the daily limit (see the OTP entry "Daily limit" state).
- Printable backup-code PDF / download, backup-code regeneration UI, and self-service admin recovery
- Admin deprovision, role hierarchy, read-only support accounts, and emergency admin lockout UI

## Open questions

- (none for MLP identity scope)
