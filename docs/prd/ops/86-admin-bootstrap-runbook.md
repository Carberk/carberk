# 86 — Admin bootstrap runbook

Status: Implemented in #177. This runbook is executable via the checked-in `packages/db/scripts/promote-admin.ts` script.

## Purpose

Create the first usable admin path without adding staff-management UI or relying on ad hoc SQL.

The bootstrap script promotes an existing OTP-verified user to `role = admin`. That role is only a pending admin assignment until the user logs into `apps/admin`, completes TOTP enrollment/verification, and receives a current `Session.adminTotpExpiresAt` elevation.

S7 moderation is not admin-account management. Admin accounts cannot be suspended or unsuspended through the report queue, and S7 ships no admin demotion/deprovision UI. Compromised or abusive admin accounts require operator session revocation / follow-up outside this MLP runbook until post-MLP admin-account management is shaped.

## Invariants

- The target user must already exist. The script must not create users or bypass OTP.
- The script must not create a `TotpEnrollment`, set `Session.adminTotpExpiresAt`, mint tokens, or bypass `AdminGuard`.
- Direct SQL is break-glass only, not the normal bootstrap path.
- The promotion is auditable. The script writes `ADMIN_BOOTSTRAP_PROMOTE` with `actorId = null`, `targetType = "user"`, `targetId = promotedUserId`, and an operator-supplied `details.reason`. The reason follows the S7 internal admin-reason text rules: plain text, trimmed before validation/storage, non-empty after trim, capped at 1000 chars after trim, and stored with internal line breaks preserved.
- Role change and audit insertion commit in one transaction. Audit failure rolls back both the role and `updatedAt`. The selected User is locked until commit; a racing invocation sees the committed admin role and writes no duplicate promotion receipt. No automatic retries are performed.
- The bootstrap audit row records `details.before.role` and `details.after.role`; it does not store phone or email snapshots in `AuditLog.details`.
- `apps/api` must start with a valid 32-byte base64 `TOTP_SECRET_ENCRYPTION_KEY`; missing/invalid key fails startup before any admin TOTP enrollment can happen.
- `TOTP_SECRET_ENCRYPTION_KEY` is generated before first production deploy, stored only in the production secret store plus the offline operator password manager, backed up with deployment secrets, and never committed, logged, pasted into issues, or stored in audit details. Startup failure because the key is missing/invalid is fixed by correcting the secret, not by bypassing TOTP.
- Bootstrap must be drilled once in staging or a prod-like environment before the first production admin promotion.
- Lost TOTP device plus lost backup codes remains manual operator recovery per ADR-0006; no self-service recovery UI ships in the MLP.

## Command

```bash
pnpm --filter @auto-tm/db admin:promote -- --phone +9936XXXXXXX --reason "bootstrap first admin"
pnpm --filter @auto-tm/db admin:promote -- --phone +9936XXXXXXX --reason "bootstrap first admin" --dry-run
pnpm --filter @auto-tm/db admin:promote -- --email staff@example.test --reason "bootstrap existing email admin" --dry-run
```

Implementation (checked in):

- `packages/db/scripts/promote-admin.ts` — CLI wrapper that creates a Prisma client and calls the core logic.
- `packages/db/src/promote-admin.ts` — testable core logic (`runPromoteAdmin`) with a fake-port unit-test suite.
- `packages/db/package.json` command: `admin:promote`
- Required `--reason` and exactly one of `--phone` or `--email`; optional `--dry-run`. Both selectors, neither selector, duplicate selectors and missing values refuse.
- Email uses the existing identity canonical form, trimmed and lowercased without provider-specific rewriting. Exactly one existing User must hold that canonical email, including legacy case/whitespace variants, and that holder must have `emailVerifiedAt`. Missing, unverified or ambiguous holders refuse without writes. A pending sign-in code is not an existing User.
- Phone validation using the same E.164 Turkmenistan format as identity (`+993[6-7]XXXXXXX`)
- Idempotent zero exit if the user is already `admin`; this no-op does not write another audit row
- Non-zero exit if the selected contact has no existing `User`; no audit row is written
- `--dry-run` validates input and reports the planned action without mutating `User` or writing `AuditLog`
- Audit log action `ADMIN_BOOTSTRAP_PROMOTE` with `actorId = null`, `targetType = "user"`, `targetId = promotedUserId`, `details.reason`, `details.before.role`, and `details.after.role`; no phone or email snapshot stored in `details`

## Reviewer-era exception — environments where signups are disabled

Step 4 below ("ask the intended admin to complete normal OTP login once") is the
normal path and assumes the target user can create itself through OTP. That
assumption does not hold in an ADR-0039 reviewer-era environment: staging and
reviewer-only production run `SIGNUPS_ENABLED=false`, so `VerifyOtp` refuses to
create a new user, and this script refuses to create one too. Reviewer accounts
cannot fill the gap either — the ADR-0030 bypass returns no session for any user
whose role is not `buyer` or `seller`, precisely so it can never elevate an
admin. The first admin in such an environment therefore has no non-break-glass
route, which was observed during the issue #279 staging drill.

Resolve it by break-glass inserting **only the identity** (role `buyer`, no
session, no privilege), then using this script for the privilege change so the
promotion stays audited. The exact commands are in
[80 — deployment runbook](80-deployment-runbook.md), under *Prerequisite — the
first admin identity in a signups-disabled environment*. Never turn
`SIGNUPS_ENABLED` on to work around this; the reviewer-era posture depends on
being able to state that public signup was never enabled. Locked in
[ADR-0045](../../adr/0045-first-admin-bootstrap-in-signups-disabled-environments.md).

## Procedure

1. Generate and store `TOTP_SECRET_ENCRYPTION_KEY` in the production secret store and offline operator password manager before deploy.
2. Confirm `apps/api` starts in staging or a prod-like environment with the configured key, and fails fast when the key is missing/invalid during the drill.
3. Run the bootstrap command with `--dry-run` in staging or a prod-like snapshot before the production promotion.
4. Ask the intended admin to complete normal OTP login once, so the `User` exists. **Not possible where signups are disabled** — follow the reviewer-era exception above instead, then continue from step 5.
5. Verify the selected phone or email out of band.
6. Confirm a recent DB backup exists.
7. Run the planned command with the selected phone or email and reason.
8. Ask the admin to open `admin.auto.tm`.
9. Admin completes OTP, TOTP enrollment or verification, and copies the 10 backup codes. The codes are returned by the **first successful** `POST /auth/admin/totp/verify`, not by `enroll` — `enroll` returns only `secret` and `qrCodeUrl`. An operator who records the enrollment response and stops there has no backup codes.
10. Confirm `GET /api/v1/auth/admin/totp/status` reports enrolled and currently elevated.
11. Confirm an AdminGuard-protected route succeeds only after TOTP elevation.

## Failure handling

- No user found: stop; the target person must log in through OTP first. Where `SIGNUPS_ENABLED=false` makes that impossible, do not lift the flag — use the reviewer-era exception above, which is the only sanctioned break-glass here and is limited to creating the identity.
- Wrong contact promoted: revoke sessions/refresh tokens for the promoted account, use a reviewed operator fix path, and record an incident/operator note; there is no S7 admin demotion UI.
- TOTP enrollment fails: do not grant temporary admin access; fix the TOTP flow or recover manually.
- Compromised admin: revoke sessions/refresh tokens, rotate admin cookies or affected secrets if needed, record an incident/operator note, review recent audit rows, and do not try to suspend the admin through the report queue.
- Direct DB edit: break-glass only. Record an incident note, include the exact reason and affected ids, and create a follow-up audit/operator record once the system is stable. Do not use manual DB edits as the normal bootstrap or recovery path.

## References

- [Sprint 7 — Minimal admin + moderation](../sprints/sprint-07-minimal-admin.md)
- [Feature 30 — Identity](../features/30-identity.md)
- [Feature 40 — Admin](../features/40-admin.md)
- [ADR-0006 — Auth](../../adr/0006-auth.md)

## Full-v3 acceptance limitation

The full-v3 fixture guard admits only the reservation coordinator's buyer-to-admin transition through this command. The command carries `AUTOTM_COMMIT_SHA` into its transaction and requires the exact current reservation candidate and identities lifecycle during synthetic lookup, including dry-run and already-admin retry. Other aliases and reverse role transitions refuse. Ordinary phone/email Users outside the fixed campaign address grammar need no campaign candidate.

The role update and exact null-actor, lowercase `user` promotion audit are journaled together. A deferred constraint rejects an unpaired role or audit at commit. Reset redacts the retained promotion audit through the existing synthetic audit disposition; a lost-response retry writes no second promotion audit. Promotion creates no Sessions, TOTP enrollment, tokens or staff grants. Normal sign-in, TOTP elevation and explicit capability checks still apply.

This source support authorizes no operational promotion. Hosted command, disposal and normal sign-in/TOTP evidence and deployed moderation acceptance remain gates under the [moderation actor decision](../../evidence/issue-901/full-v3-moderation-actor-decision-20261020.md).
