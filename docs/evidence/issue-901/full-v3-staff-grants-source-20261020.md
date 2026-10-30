# Full-v3 ordinary staff grant and revoke source

Source slice for #901 under #897 and sole draft PR #904. Base `2b8f5b39`, root's docs-only successor of `67733dbd`, so the source is identical. Branch `agent/issue-901-v3-staff-grants-20261020`, created, reserved and pushed before edits. Earlier branches are untouched.

The acceptance spec, worker helper, `scripts/staging-remote.mjs`, application code and every capacity number are unchanged. The [roster budget disposition](full-v3-roster-budget-proposal-20261020.md) still governs capacity. This slice does not establish hosted GREEN, auth or release completion, or any operational activation.

## Hosted RED and cause

- **Run.** `67733dbd`, run `39429724767`, API job `118651408104`. Full-v3 is 7/8.
- **What now passes.** Coordinator enrollment, verification with ten backup codes, `elevated: true`, and the self-grant 403.
- **What fails.** The main case at spec line 230: `grant(coordinator, support, "founder.admission")` returned 500 where 204 was expected. Plain-log line 1804 shows `DriverAdapterError: Unsupported campaign grant`; the logs are `/tmp/carberk-next-release-20261020/67733dbd-api-118651408104.{raw,plain}.log`.

**Cause.** `PrismaStaffAuthority.change` runs the following in one transaction:

1. `SELECT … FOR UPDATE` on both Users and on the Session. The trigger does not fire on these locks.
2. A `staff_grants` write, as one of two forms:
   - **Grant:** an upsert, either an INSERT of `{userId, capability, grantedAt}` or an UPDATE that sets `revokedAt` to NULL and `grantedAt` to now.
   - **Revoke:** `updateMany` setting `revokedAt` to now, which only matches an active row.
3. One `audit_logs` INSERT with `actorId` = the manager, `action` = `STAFF_CAPABILITY_GRANTED` or `STAFF_CAPABILITY_REVOKED`, `targetType` = `User`, `targetId` = the target, and `details` = `{capability, reason: trimmed, previouslyActive}`. A no-op change returns early and writes nothing.

The v3 trigger shared v2's grant guard, which admits only the coordinator's two bootstrap rows. The `support` grant row is owned through its roster `userId` edge, so it was refused. The audit would have been refused next: the shared audit guard admits only the two bootstrap audits.

## Change (v3 only; v2 text byte-identical)

`scripts/staging-campaign.mjs`:

- **Grant guard.** The row's User must be on the roster.
  - The coordinator's two bootstrap rows may only be inserted, active, by the fixture. Any later update of them refuses, which is stricter than before.
  - Any other row must have a capability from the finite contract. That is `StaffCapabilitySchema` less `founder.control`, which is never grantable.
  - INSERT must be active.
  - UPDATE is admitted only as exact revocation (only `revokedAt` goes from NULL to set) or exact re-grant (`revokedAt` back to NULL plus a new `grantedAt`).
  - The existing composite key, immutable `userId`/`capability`, key-reuse and foreign-reference rules apply unchanged.
- **Audit guard.** It now also admits a grant audit, INSERT only, when all of these hold:
  - `action` is GRANTED or REVOKED, and the target is a roster `User`;
  - the actor is a different roster User;
  - `details` has exactly the keys `capability`, `previouslyActive` and `reason`;
  - `capability` is in the contract, `reason` is a string of 1-1000 characters, and `previouslyActive` equals (action = REVOKED);
  - the target's grant row already shows that transition;
  - the actor holds an active `staff.manage`, plus `founder.control` for the founder-controlled set from `staffPolicy.ts`;
  - the actor has a journaled live Session whose elevation has not yet expired.

  Grant audits cannot be updated in `identities`. Arbitrary details, actions and targets still refuse, and so does any foreign actor or target, through the existing foreign-reference guard.
- **Integrity: `Campaign grant audit mismatch`.** This runs only in `identities`, before redaction. Each bootstrap grant must have version 1. Each other live grant's event count must equal the number of owned GRANTED/REVOKED audits for that User and capability. So every transition carries exactly one audit.
- **Reset and audit disposition.** Grants are deleted with the existing child-first order. Every owned audit, grant audits included, is redacted by the existing step to `actorId NULL`, `SyntheticCampaign` and `{profile, disposition}`. The audits are retained, and the existing terminal check verifies them. Locks, lock order, timeouts, the 128-record/2048-event/128-delivery budgets, current-candidate binding, collision and fences are unchanged. No admission, redemption or content support is added.

## Verification (offline only)

- `node --check scripts/staging-campaign.mjs`: PASS.
- `node /tmp/issue901-v3-grants-source-check.mjs`: PASS against `2b8f5b39`, using a VM fake transport. It verifies:
  - v1 `campaignMain`, `campaignQueueMain` and `staging-remote.mjs` are identical;
  - all five v2 SQL paths are identical;
  - every v3 fixture and reset statement (`identities`, `cleaning`, `disposed`) differs only by the three fragments above;
  - there are still 22 triggers;
  - the capability lists equal the contract enum and the `staffPolicy.ts` founder-controlled set, each less `founder.control`;
  - the new fragments have balanced parentheses.
- `node --test` on the four staging suites, run once: PASS, 153/153 with 0 failed or cancelled, exit 0. Fake provider harness. Log `/tmp/issue901-v3-grants-controls.log`.
- `git diff --check` and `pnpm check:agent-docs`: PASS.

These are **not executed** here: real PostgreSQL parsing and execution of the trigger, Prisma's upsert form (native `ON CONFLICT` UPDATE versus separate statements; the guard admits both), HTTP, and concurrency.

**Clock assumptions (carried forward for final review).** The TOTP elevation cap of `now() UTC + 12h5m` from the [TOTP slice](full-v3-staff-totp-source-20261020.md), and the new live-elevation check on audits, both compare the database transaction clock with timestamps the API computes and stores as UTC `timestamp(3)`.

## Residual risks

- **Lock-order deadlock.** A grant writes `staff_grants` then `audit_logs`, while reset locks tables in sorted order (`audit_logs` before `staff_grants`). A reset that runs concurrently with a grant can therefore deadlock. PostgreSQL then aborts one side: the app write returns 500, or the reset exits 1 before `cleaning` and can be retried. TOTP verify has the same class of risk (`totp_enrollments` before `totp_backup_codes`/`sessions`). The lock order is deliberately not changed.
- **Grant deletion in `identities`.** The application has no grant-delete path, and User deletion refuses there. If a grant row were deleted, the existing journal would record it, but the audit-correspondence check skips deleted rows.
- **Elevation check is not session-specific.** The audit has no `sessionId`, so the check proves that *some* journaled Session of the actor is elevated, not the specific request's Session. The application still checks the exact Session under row locks.
- **Capacity.** Full-roster capacity is still unresolved, per root's disposition.

## Next hosted barrier (prediction)

Expected to pass: the 204 grant, the support Session's pre-elevation admission 403, and support's enrollment and elevation, which the active `founder.admission` grant now permits.

The predicted next failure is spec line 235, `POST /api/v1/business/admission` by support, returning 500 rather than 201. The admitted Dealership has a new ID and slug, so it is not journaled. The following `dealership_invitations` INSERT is owned through `recipientUserId` (the roster owner), but its `dealershipId` points to that unjournaled Dealership. The existing guard should therefore refuse it with `Foreign campaign graph reference`. Admission stays closed in this slice by design.
