# Full-v3 staff TOTP enrollment, verification and elevation source

Source slice for #901 under #897 and sole draft PR #904. Base `0eefa49d37106c7742c482bb62b2c1855bfad203`; branch `agent/issue-901-v3-staff-totp-20261020`, reserved and pushed before edits. The acceptance spec, the worker helper, `scripts/staging-remote.mjs` and all application code are unchanged. This slice does not establish hosted GREEN, deliver auth or release completion, or activate anything operationally.

## Hosted RED and cause

- **`c5f2b506`**, API job `118630137364`: main case `elevate` at spec line 150, `POST /auth/staff/totp/enroll` returned 500, expected 201. API log lines 1794-1812 show `DriverAdapterError: Campaign authentication slice unavailable`.
- **`0eefa49d`**, run `39426922332`, API job `118641828783`: full-v3 is 7/8. The disposal cases and the changed-candidate final reset now pass. The only failure is the same line-150 enroll 500, with the same API error at plain-log line 1836. Log `/tmp/carberk-next-release-20261020/0eefa49d-api-118641828783.plain.log`.

Cause: `EnrollAdminTotp` calls `PrismaTotpEnrollmentRepository.createPending`, which inserts a `totp_enrollments` row for the roster User. In v3, `track_business()` refused every owned write to `totp_enrollments` and `totp_backup_codes` with exactly that message. That was the closed-table branch. No other trigger path raises it during an application write; the integrity inventory that also uses the string runs only in the storage program. The PostgreSQL `ERROR:` line is outside the captured window, so the attribution rests on the API error, the single raise site and the source.

If enrollment had passed, verification would have hit a second refusal. `completeFirstVerification` runs one transaction that does three things: sets the enrollment's `verifiedAt`, inserts ten backup codes, and sets the current Session's `adminTotpExpiresAt`. The Session guard refused every non-null `adminTotpExpiresAt`.

## Change

`scripts/staging-campaign.mjs`, v3 only:

- **Relation, trigger and lock set unchanged.** The same 22 tables, triggers and sorted lock list, with table locks before the namespace fence. Only the closed refusal for the two TOTP tables is removed.
- **Ownership.** Enrollments are owned through the existing journaled roster `userId` edge, and backup codes through the existing `totpEnrollmentId` edge. Both are journaled with exact row hashes and keep these existing guards:
  - current-candidate binding;
  - lifecycle (`cleaning` and `disposed` refuse ordinary writes);
  - key reuse, parent/key transfer and foreign-reference checks;
  - the 128-record and 2048-event headroom.
- **TOTP guard (`Unsupported campaign TOTP`).** The trigger admits only the following:
  - an enrollment INSERT for a roster User, with `verifiedAt` NULL;
  - one enrollment UPDATE from unverified to verified. Only `verifiedAt` and `updatedAt` may change, so the secret is immutable.
  - backup-code INSERTs, with `usedAt` NULL, only under a verified roster enrollment, at most ten per enrollment;
  - one backup-code UPDATE from NULL `usedAt` to non-NULL, with nothing else changing.

  Deleting a TOTP row in `identities` refuses, so TOTP reset and re-enrollment stay unsupported.
- **Session guard (`Unsupported campaign session`).** A Session still may not be created elevated. A change to a non-null `adminTotpExpiresAt` is admitted only if all of these hold:
  - the Session is not expired;
  - the new expiry is at most `now() UTC + 12h5m`, against the application's 12-hour TTL in UTC `timestamp(3)` columns;
  - the User holds an active `staff_grants` row;
  - the User has a journaled, verified enrollment.

  Clearing elevation, and unchanged values, stay admitted.
- **Integrity and collision (`Untracked campaign TOTP`).** These replace the blanket TOTP refusal. Any enrollment of a roster User, or any backup code under such an enrollment, that has no live journal record refuses. At fixture creation this still refuses any pre-existing roster TOTP. The OTP inventory and its message are unchanged.
- **Secret-row disposal order.** The locked disposal transaction now deletes, in order: `dealerships`, then `totp_backup_codes`, then `totp_enrollments`, then `sessions`, then `otp_requests`, then `users`. The `cleaning` commit, the Redis disposal and the terminal observe-only retry are unchanged. The only change to the pending disposal source is this justified TOTP dependency.

v1 `campaignMain`, `campaignQueueMain`, `scripts/staging-remote.mjs` and the five v2 SQL paths are byte-identical. Also unchanged:

- the public authentication and staff policy;
- timeouts and concurrency;
- the budgets: 128 records, 2048 events, 128 deliveries;
- the CLI, controller and Railway allowlists, which stay closed to v3.

## Local checks

These ran offline, with no Docker, database, Redis, staging, provider or CI action.

- `node --check scripts/staging-campaign.mjs`: PASS.
- `node /tmp/issue901-v3-totp-source-check.mjs`: PASS, run against the base with a fake transport and the VM-compiled source. It verifies:
  - the v1, queue and remote paths are identical;
  - the five v2 SQL paths are identical;
  - the v3 trigger statements and lock set and order are identical;
  - the guards and inventory are present in both integrity and collision;
  - the reset order and the observe-only terminal retry.
- `node /tmp/issue901-v3-totp-paren.mjs`: the three new SQL predicates have balanced parentheses.
- `git diff --check`: PASS.
- `node --test` on the four staging suites: PASS, 153/153 with 0 failed or cancelled, exit 0. Log `/tmp/issue901-v3-totp-controls.log`. It uses the fake provider harness.

The PL/pgSQL is **not executed or parsed by PostgreSQL locally**. That covers the jsonb `-` comparisons, the timestamp casts, the per-row backup-code count after `createMany`, and the trigger order inside the verification transaction. The HTTP behavior is also unexecuted. All of these remain unknown until root's hosted lane runs the unchanged spec.

## Next hosted barrier (prediction)

The coordinator enrollment, verification (ten backup codes) and `elevated: true` should pass. The self-grant at spec line 229 should still be refused with 403 by policy. The next failure is predicted at line 230: `grant(coordinator, support, "founder.admission")` should return 500 rather than 204, because `ChangeStaffGrant` upserts a `staff_grants` row that the v3 trigger refuses as `Unsupported campaign grant`. The trigger admits only the coordinator's two bootstrap grants. The `STAFF_CAPABILITY_GRANTED` audit, which would follow in the same transaction, is also unsupported. Grants are deliberately left closed in this slice.
