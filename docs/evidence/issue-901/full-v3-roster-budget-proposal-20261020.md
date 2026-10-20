# Full-v3 roster budget versus journal caps: decision proposal

Design and evidence note for #901 under #897 and PR #904. Base `5d4aaa4b`. **This is a proposal; root decides and nothing here is approved.** No runtime or test file changed, nothing was executed, and no acceptance is claimed.

## Root disposition

The demonstrated capacity mismatch is accepted as a full-scope engineering gap. The proposed 269-record cap and per-family allocation are **not approved for implementation**: the extra sign-in/grant allowances and eight content records need criterion-level derivation. A larger v3 capacity must follow a test-only full-roster RED and explicit graph inventory, preserve v1/v2 limits, retain overflow refusal and prove exact cleanup within unchanged timeouts. Retaining a cap that prevents the selected release scope is not a delivery alternative.

The split examples below establish authentication costs only. They do not prove that either group's complete graph exceeds 128; those content counts are still missing. Separate reservations may isolate independent acceptance groups, but cannot substitute for any required joined ownership/lifecycle test. The main journey's admission/grant assertions were still unreached when this proposal was written. No numeric limit, test or runtime rule changes in this note.

## Inputs

These come from the source at `5d4aaa4b`:

- **Caps.** The v3 storage program uses the same caps as v2:
  - **Records:** 128, enforced by the trigger at `scripts/staging-campaign.mjs:432` and by integrity at `:295`. Deleted journal rows still count, because `count(*)` includes `deleted`.
  - **Events:** 2048. The trigger keeps headroom of events + live records + 4 while in `identities` (`:433`). Cleanup requires events + live non-audit records + 2 ≤ 2048 (`:320`).
  - **Deliveries:** 128 (`:516`).
- **Bootstrap: 21 records.** That is 15 Users, 1 Dealership, the owner membership, the coordinator's two grants and their two audits.
- **Sign-in: 2 records each.** Every sign-in adds one OTP record, which is also a delivery, and one Session record. Refresh rotates the Session in place (`PrismaSessionRepository.rotateRefreshToken`), so it adds events but no record.
- **Staff TOTP: 11 records per staff User.** One enrollment plus ten backup codes (`VerifyAdminTotp`, `BACKUP_CODE_COUNT = 10`). The `userId` is unique, and v3 refuses TOTP deletion in `identities`, so there is at most one enrollment per User.
- **Grant: 2 records each.** Each HTTP grant adds one `staff_grants` row and one `STAFF_CAPABILITY_GRANTED` audit (`PrismaStaffAuthority.change`). Revoking or restoring updates the same row and adds one more audit record.
- **Every staff capability needs elevation.** `CheckStaffAuthority` calls `assertStaffElevation`. So every staff alias that uses its own area must enroll TOTP.
- **Roster.** Fixed at 15 aliases (`release-acceptance-matrix-20261020.md` § Fixed inputs). Ten are staff: coordinator, support, history-fulfiller, payment-verifier, reception-steward, technician, independent-reviewer, private-reviewer, aggregate-viewer, investigator.
- **Grants.** `staff.ts` defines 16 capabilities. The coordinator holds `staff.manage` and `founder.control` from bootstrap. `founder.control` cannot be granted, and self-grant is refused (`staffPolicy.ts`). That leaves at least 14 HTTP grants, made by the coordinator to other aliases.

## Minimum full-roster arithmetic (no content)

| Item | Records |
|---|---|
| Bootstrap | 21 |
| One sign-in for each of the 15 aliases | 30 |
| TOTP for 10 staff (10 × 11) | 110 |
| 14 grants plus their audits | 28 |
| **S1 floor, before any business, service, diagnostics or measurement row** | **189** |

That is 189 records against a cap of 128. Bootstrap plus TOTP alone is already 131. Events (about 250, counting OTP binding, verification, elevation and rotation updates) and deliveries (15) are within their caps. **The record cap is the binding constraint, and insufficiency is proven.**

How many staff can fit under 128? Each staff alias other than the coordinator costs 15 records (2 sign-in + 11 TOTP + 2 grant), and the coordinator costs 13. With the 5 customer aliases signed in, the formula is 21 + 13 + 10 + 15k ≤ 128, which gives k ≤ 5. So only five of the nine other staff fit, with no room for any content.

## Distinct reservations versus joined ownership

Each reservation (`cf_<id>`) has its own deterministic 15 Users, its own journal and its own caps. Grants, Sessions and TOTP do not cross reservations, so each reservation must repeat sign-in and S1 for the actors it uses. Each reservation is also a full Reserve → Accept → Reset → Restore cycle (matrix § Staging sequence).

- **Must be joined in one reservation:**
  - **S1/S2.** The matrix asks for auth and grants once, with "each alias reaches only its own area" checked across all aliases ("grant each capability to its matching alias"; "S0 → S1 → S2 … reused by every lane"). That needs the 189-record floor.
  - **Batches within a group.** Business B1–B4 share one admitted business. History C2/C3 share a purchase and its artifact. Diagnostics X1–X4 share one order, its report versions and its readers.
- **Could be split into separate reservations:** the groups B, C, X and A, each with the coordinator plus that group's staff. Their authentication costs are:
  - **X (diagnostics):** coordinator plus 4 diagnostics staff (reception, technician, two reviewers; `diagnostics.templates` must also be held by one of them). Customers buyer-a, buyer-b and owner. 21 + 13 + 4 × 15 + 6 = 100 records before any center, template, order, evidence or report row.
  - **C (support/history):** coordinator plus 3 staff. 21 + 13 + 45 + 4 = 83 records before content.
  - Splitting also multiplies staging cycles, and it cannot satisfy S2 as the matrix defines it.

Splitting lowers the staff share while leaving each group's content graph unbudgeted. It does not resolve the joined full-roster capacity mismatch; whether each independent group fits still requires its content inventory.

## Proposed smallest bounded design (v3 only)

The design rests on one principle: replace the single shared 128 limit with **per-family v3 quotas whose sum is the v3 cap**. Each quota is derived from code-fixed counts. v1 stays at 128/2048/128 and v2 at 128/2048, unchanged.

1. **Proposed authentication family quota: 261 records.** These are proposed allowances; the non-bootstrap headroom still needs criterion-level justification:
   - **Bootstrap: 21, fixed.**
   - **TOTP: at most 110.** Enrollment is admitted only for the 10 staff aliases. That is a tightening: today any roster User may enroll. Each enrollment has at most 10 codes, a guard that already exists.
   - **Grants: at most 32 non-bootstrap `staff_grants` rows**, keyed by unique `(userId, capability)`, and **at most 48 non-bootstrap grant audits**. That covers 14 grants plus S2 revoke and restore.
   - **Sign-ins: at most 25 OTP and 25 Session records.** This covers the 15 first sign-ins plus 10 extra sign-ins (second device, account switch C5, A3 sign-out). It stays within the retained 128-delivery cap.
2. **Proposed content family quota.** It must be derived per graph slice and verified by hosted evidence. The suggested first increment is 8 records for admission, invitation, redemption membership and associated audits, giving **proposed v3 cap = 261 + 8 = 269**. These assertions have not yet been reached, and the eight-record bound is unverified. Each later slice needs its own measured inventory. No unbounded graph.
3. **Events stay at 2048**, as do the existing identities headroom (events + live + 4) and the cleanup budget formula. At 269 records, insert, update and delete events total about 269 + ~150 + 269, well within 2048. The headroom formula still reserves every deletion event.
4. **Unchanged:** lock order, `lock_timeout` 5s and `statement_timeout` 20s; the namespace fence; current-candidate binding; collision, foreign-reference and polymorphic/JSON refusal; the late-worker fence (`cleaning` before Redis, permanent tombstones); private-sink disposal; and the observe-only terminal retry.

### RED assertions and cleanup headroom (to add before implementation)

1. **Quota boundaries** (one disposable reservation per assertion family):
   - the 11th staff enrollment, or any enrollment by a non-staff alias, is refused;
   - the 26th sign-in is refused with no OTP/Session row and no delivery;
   - the 33rd grant row and the 49th grant audit are refused;
   - a content write past its quota is refused;
   - each refusal leaves the digest unchanged.
2. **Full-roster S1.** All 15 aliases sign in normally. The coordinator elevates and grants all 14 capabilities. Every staff alias elevates and is refused outside its own area, and the self-grant is refused. Then one exact reset disposes everything, and a lost-response retry returns the same terminal receipt.
3. **Cap-sized reset within the unchanged timeouts.** Integrity scans each record with `to_jsonb(t) @> key` over a whole table, the FK preflight runs once per record per incoming FK, and every owned write hashes the journal. All three grow linearly with records, and the per-write hash makes the total grow quadratically. Reset of a cap-sized graph must complete within the unchanged 5s and 20s timeouts, while unrelated rows sit in the same tables. If it cannot, the design must change, not the timeouts.
4. **v1/v2 regression.** The 129th record is still refused in v1 and v2.

### Normal re-elevation and lifecycle tests the current support has not exercised

`5d4aaa4b` admits these in source, but no hosted test has reached them:

- **Re-elevation:** after expiry, a new Session (or the stale one) re-elevates with a TOTP code. This should add a Session update only.
- **Backup-code elevation:** consumes exactly one code (`usedAt`), and that code is then refused on reuse.
- **Revocation:** a grant revoked mid-task ends access to that area on the next request (S2), while the elevation on the Session stays.

TOTP reset and re-enrollment stay refused in `identities`. If S2 or another batch needs them, that needs a separately reviewed design. At most one enrollment per User means re-enrollment requires deleting the journaled secret rows before `cleaning`, which v3 forbids today. These tests belong in the full-roster RED above. They do not raise any quota.

## Decision requested from root (not approved)

Derive and test a v3 capacity that supports the selected full scope, using the proposal above as an unapproved starting point. Keep the current limits until that test-first design is ready; do not describe the resulting inability to exercise the full roster as release completion. Independent groups may use separate reservations where their ownership requirements allow it. The root disposition above governs the next assignment.
