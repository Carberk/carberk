# Identity

Identity owns Users, Sign-in Methods, sessions, admin elevation, account deletion, and identity checks consumed by other contexts. Marketplace Role and Dealership Member role are different concepts. Listing contact verification belongs to Listings and cannot authenticate a User.

Refresh tokens are hashed on Session. Refresh rotates in place with a compare-and-swap check so a concurrent retry cannot reuse the old token. Admin TOTP elevation has its own deadline; ordinary refresh preserves it without extending it. Pending TOTP enrollment is idempotent, including concurrent creation, so returning to setup does not invalidate an already scanned secret.

Phone and email code flows share ownership and one-time-consumption rules. Account-deletion codes bind to the holder at request time; do not replace that with an unbound sign-in lookup. Reviewer bypass is narrower than normal authentication and never authorizes deletion. Inspect the use-cases and integration tests before changing rate limits, verification, or enumeration protection.

A refused Sign-in Code request throws `SignInCodeRateLimitedError`, which carries the `OtpAttemptLedger` reason. The three request endpoints (sign-in, Sign-in Method change, account deletion) answer `RATE_LIMITED` with `details: { reason, retryInSeconds }` (`destination_limit`, `ip_limit` or `backoff`; the wait is nonzero only for `backoff`) so the app can tell "wait a moment" from "no more codes today". The reason comes only from the destination and IP counts and the last attempt, never from whether a User holds the value, and controllers match the error class rather than a message. Keep it that way.

Other modules import identity only through [`identity.public.ts`](identity.public.ts), plus `identity.module.ts` for Nest composition; `apps/api` lint rejects imports of identity internals or `identity.tokens`. It mirrors the providers `IdentityModule` exports: identity check, identity read, identity admin, seller profile read, session repository, and clock.

The exported `SELLER_PROFILE_READ_PORT` gives other contexts a seller's display name and join date from `User.createdAt`. It exposes no Sign-in Method values or verification state.

The identity read port answers lists in one read per question: `findUsersByIds` for display names and `findBlockedUserIds` for which of a set of Users a blocker has blocked. Callers use them instead of one `findUserById` or `isUserBlockedBy` call per row. Neither returns Sign-in Method values.

Suspension blocks marketplace mutations while preserving permitted reads and account deletion. Deletion has a grace period followed by worker purge; inspect both sides and database history-retention rules before changing the lifecycle.

Restoring a User in the grace period is a separate, confirmed step. Verifying a code (normal or reviewer path) signs the User in and answers `user.deletionScheduledAt` without clearing the schedule or republishing Listings. Only `POST /api/v1/me/restore` (`RecoverAccount`) clears the schedule and republishes the Listings the deletion archived; it answers with `/me` and is idempotent for a User with no scheduled deletion. Until then the session cannot change marketplace data: `AccountDeletionPendingGuard` (global, after `JwtAuthGuard`) answers any signed-in non-read request with 403 `details.reason = ACCOUNT_DELETION_PENDING`, except public routes and routes marked `@AllowPendingDeletion()` (restore, logout-all; logout is public). Realtime message sends skip HTTP guards, so `ConversationSendPolicy` repeats the check. A new check that bypasses HTTP, such as another socket event, must call `IdentityCheckPort.isDeletionScheduled` itself.

## Start here

- [Module composition](identity.module.ts)
- [Refresh concurrency and tests](application/RefreshSession.ts)
- [Idempotent TOTP enrollment and tests](application/EnrollAdminTotp.ts)
- [Sign-in method invariants](domain/SignInMethods.ts)
- [Deletion integration tests](presentation/AccountDeletionController.e2e.spec.ts)
- [Cross-context entry point](identity.public.ts)
- [Purge implementation](../../../../worker/src/jobs/PurgeExpiredAccounts.ts)
- [Phone or email decision](../../../../../docs/adr/0054-phone-or-email-sign-in-share-one-user.md)
- [Schema](../../../../../packages/db/prisma/schema.prisma)
