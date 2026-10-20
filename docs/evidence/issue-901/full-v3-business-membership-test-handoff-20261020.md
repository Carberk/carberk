# Full-v3 B1/B2 business membership: test-only handoff

Test-only checkpoint for #901 under #897 and PR #904. Base `794ac50a`. Plan: `662d4f3a` ([business graph slices](full-v3-business-graph-next-slices-20261020.md), assembled by root). The only file changed is `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`. No source, schema, worker, config, cap, lock, timeout or concurrency change was made. There is no auth shortcut and no direct Session write. The existing 15 cases and their assertions are byte-for-byte unchanged; two cases are appended.

## Cases

**`b3…` membership lifecycle** (separate reservation; never extends the main journey). Roles: buyer-a is the admitted owner; sales-a is the member; sales-b is the wrong account and the revoked invitee. buyer-b stays reserved for the later enquiry. The bootstrap `owner` and root Dealership must stay unchanged; that is asserted against a snapshot taken before admission.

1. **Setup gate.** Admission, owner redemption and settings must all return 201.
2. **Invite, wrong account, duplicate.** Owner invites sales-a: the row matches the response and its journal key is owned. sales-b redeeming that token gets 409 `INVITATION_INVALID`. Owner re-invites sales-a: the first invitation is revoked, and its token then gets 409.
3. **Revoke.** Owner invites sales-b and revokes it (201 `{ok:true}`). Redeeming the revoked token gets 409. A repeated revoke returns 201 and writes no audit.
4. **Sales redemption.** sales-a redeems (201 `{businessId}`); `measurement_state` is unchanged and is only observed. The workspace shows role `sales` with empty owner-only lists. A repeated redemption gets 409. sales-a's invite, revoke, settings and member change each get 403 `OWNER_REQUIRED`.
5. **Suspend and restore.** After suspend, sales-a's `GET /business/current` gets 403 `MEMBERSHIP_REQUIRED`; after restore it gets 200. The owner removing themself gets 409 `SOLE_OWNER`. Suspending a non-member (sales-b) gets 403 `MEMBERSHIP_REQUIRED`.
6. **Foreign roster reference.** An owned invitation naming an ordinary foreign User (a legitimate fixture row) returns 500. That is the fixture refusal `Foreign campaign graph reference` with full rollback. No invitation is created and the foreign User row is unchanged.
7. **Changed candidate.** A reset with the wrong candidate exits 1 and changes nothing. The runtime path has no candidate input; this follows the `b0` precedent.
8. **Audits.** Exactly 10 business audits, in order:
   - `ADMITTED`, `REDEEMED`(owner), `SETTINGS_CHANGED`;
   - `INVITATION_CREATED` ×3 (`{invitationId, role:'sales'}`);
   - `INVITATION_REVOKED` (`{invitationId}`);
   - `REDEEMED`(sales-a, `{invitationId, role:'sales'}`);
   - `MEMBERSHIP_CHANGED` suspend, then restore (`{targetUserId, action}`).

   No audit contains any of the four raw tokens.
9. **Disposal.** Reset with a lost receipt exits 0. Disposal is exact, and the business, invitations and members are all absent. All 10 audits are retained redacted. A retry returns the same digest and a `disposed` receipt. sales-a then gets 403 `SESSION_REQUIRED` and the owner's refresh gets 401.

Every refused step asserts that the full journal digest and `businessState` are unchanged. Cleanup happens in `finally`:
- known job IDs are removed;
- `resetAfter` resets the reservation;
- the foreign User is removed by exact ID.

**`b4…` foreign business inviting a roster User.** A non-reserved User signs in through the ordinary OTP route; its code is read from its own ordinary job, as in `b1`. That User owns an active foreign Dealership, created as legitimate foreign setup. Its invitation of sales-b returns 500. The foreign business state stays exact, sales-b has no invitation, and the digest is unchanged. Exact reset and disposal follow, and the foreign Dealership survives reset. The foreign member, Dealership, OTP rows and User are deleted by exact ID in `finally`. No shared or global state is deleted.

## Expected result on `794ac50a` (prediction; not run)

- **`b3`: RED at its setup gate, owner redemption (expects 201, receives 500).** The cause is `admissionClosed` (`staging-campaign.mjs:297-299`): every non-root `dealership_members` write raises `Unsupported campaign business`. Nothing after redemption has been reached. This supersedes my plan's earlier prediction of `Unsupported campaign audit`. Root must still treat the main journey's and `b1`'s redemption expectations under its own disposition.
- **`b4`: expected GREEN.** The `recipientUserId` edge makes the invitation owned, and its foreign `dealershipId` raises `Foreign campaign graph reference` before any audit.
- **Source that must later change for `b3` to pass.** All of it is in the v3 trigger:
  - admitted-Dealership member INSERT/UPDATE for owner and sales;
  - owner `recovery→active`;
  - name-only settings;
  - invitation `revokedAt` and `redeemedAt` transitions, plus sales invitation INSERTs, where `admissionClosed` refuses `admitting=false`;
  - audits `REDEEMED`, `SETTINGS_CHANGED`, `INVITATION_CREATED`, `INVITATION_REVOKED` and `MEMBERSHIP_CHANGED`, which the audit guard does not admit today.

  The audits must be retained redacted, and none may carry a token. The admission-plan step 5 rules apply. Recovery stays closed.

## Accounting (`b3`)

**Records: exactly 72, all live, none deleted.**

| Table | Records |
|---|---|
| users | 15 |
| sessions | 5 (coordinator, support, buyer-a, sales-a, sales-b) |
| otp_requests | 5 |
| totp_enrollments | 2 |
| totp_backup_codes | 20 |
| staff_grants | 3 |
| audit_logs | 13 (2 bootstrap, 1 GRANTED, 10 business) |
| dealerships | 2 |
| dealership_members | 3 (root owner, buyer-a, sales-a) |
| dealership_invitations | 4 |

**Deliveries:** 5. After reset, 13 redacted audits and 5 tombstones are retained.

**Events: ≥ 89; the exact count is UNKNOWN.**

| Source | Events |
|---|---|
| Bootstrap | 21 |
| Sign-ins | ≥15: 5 × (OTP INSERT, ≥1 OTP UPDATE, Session INSERT). The verify OTP update count is UNKNOWN |
| Elevations | 26: 2 × (enrollment INSERT, enrollment UPDATE, 10 codes, Session UPDATE) |
| Grant | 2 |
| Business | 25 (detail below) |

Business events by operation:
- admission 3 (adopted Dealership, invitation, audit);
- owner redeem 4;
- settings 2;
- invites 2 + 3 + 2;
- revoke 2;
- sales redeem 3;
- suspend 2 and restore 2.

No-op revokes and refusals add 0. Cleanup events come on top. Hosted readback must replace the UNKNOWN.

**Other effects:**
- **Jobs:** one email job per sign-in only.
- **Objects:** none.
- **Shared-state writes:** none; sales redemption has no baseline path.
- **OTP rate limit:** the shared loopback budget is 10 per hour. `b3` uses 5 and `b4` uses 1.

## Gaps kept explicit

- **Invitation expiry (48 h; D1 "expired").** Not exercised. The `b2` backward Date-only window would need the owner, invitation and redemption to straddle a 48 h shift across live sign-ins. That is not straightforward without diluting scope, so it stays a named gap.
- **Not in this slice:** sales removal (moved to the media slice after publish), drafts and enquiries.

## Offline verification

- `pnpm install --offline --frozen-lockfile`, then Prisma generate with a dummy, never-connected `DATABASE_URL`.
- `apps/api` `tsc --noEmit` exits 0.
- `eslint --max-warnings 0` on the spec exits 0.
- `vitest list` collects 17 cases.
- Not run: Docker, services, integration tests and CI.
