# Full-v3 moderation actor prerequisite

Root engineering disposition for #897/#901 and sole integration PR #904, based on read-only source research at `c5f2b50660a6feb976cecbc2e1d7e31e26bcb529`. This resolves the implementation approach for acceptance-matrix U2/M6. It supplies no SQL, HTTP, native or deployed acceptance evidence and authorizes no operational promotion now.

## Existing contract

- Marketplace moderation, reports and audit use `apps/api/src/common/admin.guard.ts`: current admin role, current owned Session, then unexpired TOTP elevation. Staff capabilities do not substitute for that role. The current fixed fifteen-user v3 roster starts as email-only buyers.
- [ADR-0045](../../adr/0045-first-admin-bootstrap-in-signups-disabled-environments.md) requires buyer-only identity creation and privilege changes through `admin:promote`. Normal OTP and TOTP follow; no session, token or enrollment is seeded. Its prohibition is stronger than merely avoiding the reviewer scenario seed.
- `packages/db/scripts/promote-admin.ts` currently selects an existing user by phone only. `packages/db/src/promote-admin.ts` owns validation, dry-run, missing-user and already-admin behavior. The adapter currently performs role update and audit insertion as separate calls, not an atomic transaction.
- [Runbook 86](../../prd/ops/86-admin-bootstrap-runbook.md) owns the command contract. The [admin specification](../../prd/features/40-admin.md#delivery-and-deferred-boundaries) excludes phone-first admin. Existing full-v3 acceptance uses `/api/v1/auth/staff/totp/enroll` and `/verify`, not an admin-only enrollment shortcut.

## Root disposition

1. Keep all bootstrap identities as buyers. Reject the research proposal to seed coordinator as admin and imitate `ADMIN_BOOTSTRAP_PROMOTE` in fixture setup; that would bypass the sanctioned privilege-change command.
2. Select the existing **coordinator** alias for eventual marketplace moderation acceptance. It already owns the fixed bootstrap staff grants. Preserve the other fourteen aliases' role and capability-denial evidence. Do not add a sixteenth alias or invent a moderation capability.
3. The smallest compliant engineering extension is a strict verified-existing-user email selector on the same `admin:promote` command. Exactly one of `--phone` and `--email` must be supplied. Preserve phone behavior, no-user-creation, no enrollment/session/token creation, write-free dry-run, missing-user refusal, already-admin no-op and contact-free audit shape. Email selection must use the existing canonical identity rules and require verification; ambiguous or unverified identities refuse.
4. Make role change and its audit write atomic rather than carrying the existing split-write weakness into reservation acceptance. A failing audit must not leave an elevated role. Update the owning runbook contract and tests with this implementation; no merged ADR needs editing because the sanctioned command and separation of identity creation from privilege grant remain.
5. Extend only the v3 fixture guard to admit the command's one-time recorded coordinator buyer-to-admin transition and its exact audit under the bound reservation. Other aliases, reverse transitions, stale candidates, foreign references and cleaning/disposed mutations refuse. Journal the actual command writes; never manufacture a promotion receipt. Define retained-audit redaction/disposition consistently with the complete graph reset.
6. Ordinary sign-in and TOTP enrollment/verification remain the only session/elevation path. Production `AdminGuard`, staff capability policy, reviewer bypass and operational v3 allowlists remain unchanged by this prerequisite.

This is a bounded tooling/fixture decision needed by already-selected marketplace acceptance, not a new public role or product capability. Source work must follow test-first checkpoints and independent review. Running the command later still needs the valid staging reservation, verified environment/credential scope and runbook procedure; the previously refused scoped Railway token remains blocked and must not be retried or replaced as a workaround. Production promotion remains a separate founder decision.

## Required evidence before use

- Existing phone command behavior plus email success/refusal, mutually exclusive selectors, unverified/missing user, dry-run, already-admin no-op and rollback on audit failure.
- Actual command composition against disposable migrated PostgreSQL, rather than a copied promotion implementation in a test. No service-backed suite against shared staging.
- V3 exact roster/collision/current-candidate guards, only coordinator promotion, role/audit atomicity, unchanged other aliases, foreign-reference refusal and complete disposal with retained-audit checks. V1/v2 behavior remains unchanged.
- Normal HTTP sign-in and TOTP; role and elevation refusal before authorization; capability-gated routes still require explicit grants. Use actual error precedence from the governing policy rather than assuming a particular message for a session that exists but is not elevated.
- Marketplace moderation and protected-video acceptance on the final candidate. The media graph, worker, native/deployed evidence and storage gates remain separate prerequisites.

Implement after the current authentication/disposal slices in the complete staff/owned-graph work. U2 is **planned, not implemented or accepted**. No admin promotion, token creation, source change or provider action occurred during the research or this decision.
