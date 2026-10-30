# Full-v3 capacity inventory, derived from the criteria

Planning evidence for #901 under #897 and PR #904. Base `68b9b7f4`, which has the same executable as `67733dbd`. This is documentation only and approves no numeric limit, architecture or test change. It corrects the unsupported headroom in the [roster budget proposal](full-v3-roster-budget-proposal-20261020.md). That proposal's 25 sign-ins, 32 grant rows, 48 audits and 8 content records are **withdrawn as ungrounded**, and the root disposition stands.

The criteria come from [release-acceptance-matrix-20261020.md](../issue-897/release-acceptance-matrix-20261020.md) (rows S/M/V/B/C/X/A) and Engineering gap 2 in [criterion-evidence-index-20261018.md](../issue-897/criterion-evidence-index-20261018.md).

## Root disposition

Independent acceptance groups may use separate reservations. This is an execution choice, not removal of any selected capability or required joined journey. Preserve cross-role refusal, account switching, foreign-reservation preservation and every criterion from the governing specifications. The matrix summarizes those specifications; a capability missing from its rows is not excluded from the release.

The earlier 189 calculation assumes all fourteen non-bootstrap capabilities; the 183 calculation below assumes eleven. Neither is an established minimum for every permitted acceptance arrangement. Per-group authentication figures are lower bounds with unresolved capability assignments and content, not approved quotas. The 60-record main journey is a source-derived estimate pending hosted reach and readback. No cap change is approved. Derive each family's remaining operations and disposal obligations before implementing it.

Root assigned a separate test-only staff lifecycle case from `9fb10b28`. It must preserve existing assertions and use ordinary HTTP, known-job cleanup and legitimate clock boundaries. Its hosted result is UNKNOWN. The admitted-business ownership rule, shared global-state disposition, synthetic diagnostics bootstrap, phone/auth-change support and private-object/general-worker disposal remain explicit design and verification work within the full selected scope.

## Accounting rules (source at base)

| Quantity | Rule | Source |
|---|---|---|
| Records | One per owned row key ever written. Deleted keys stay counted, because the check counts all of `campaign_records`. Limit 128 | `scripts/staging-campaign.mjs` integrity `>128`, trigger `>=128 AND NOT tracked` |
| Events | One per owned row INSERT, UPDATE or DELETE, cleanup deletes included. Limit 2048. While in `identities`, events + live + 4 must stay below 2048; cleanup needs events + live non-audit + 2 ≤ 2048 | same file: trigger headroom; preflight `Campaign cleanup event budget` |
| Deliveries | One permanent ledger entry per owned OTP INSERT. Limit 128; it ends as a permanent Redis tombstone | trigger ledger insert; `campaignQueueMain` `deliveries.length > 128` |
| Retained after reset | Every owned `audit_logs` row, redacted. The delivery ledger and its tombstones | reset redaction; terminal checks |
| Not journaled | Private objects (S3/MinIO keys), BullMQ/outbox work outside the email queue, and global aggregate rows | v3 has no object or general-queue disposal. Engineering gap 2: "scoped private-object disposal", "queued-worker fencing/no late resurrection" |

Per-write cost also matters. Every owned write recomputes the whole journal and event hash, and integrity scans the whole table once per record (`to_jsonb(t) @> key`). Any larger cap therefore needs a measured reset within the unchanged 5s/20s timeouts.

## Authentication lifecycle costs (grounded)

| Operation | Records | Other effects | Source |
|---|---|---|---|
| Fixture bootstrap | 21: 15 users, 1 dealership, 1 member, 2 grants, 2 audits | 21 events | `businessMain` `audit` SQL |
| Email OTP sign-in | 2: OTP and Session | 1 delivery; ≥1 OTP update event. The exact count of verify updates is **UNKNOWN**; measure it from the hosted trace | `RequestOtp`, `VerifyOtp`, `PrismaSessionRepository.create` |
| Refresh | 0 | 1 Session update event | `rotateRefreshToken` |
| First staff TOTP | 11: enrollment and 10 codes | 1 enrollment update + 1 Session update | `VerifyAdminTotp`, `completeFirstVerification` |
| Re-elevation by TOTP code; backup-code elevation | 0 | 1 update; 2 updates | same |
| Grant / revoke / re-grant | 2 / 1 / 1: row and audit, then audit only | 1 grant event each | `PrismaStaffAuthority.change` |
| Phone sign-in (M1), email/phone add (M5) | **Refused in v3** | The OTP guard requires `purpose='sign_in'`, `channel='email'` and a null phone | v3 OTP guard |

## Required joined ownership versus independent groups

Each reservation has its own deterministic roster, journal and caps. Grants, Sessions and TOTP do not cross reservations.

**Correction.** The matrix's "S0 → S1 → S2 … reused by every lane" is an *execution-order* choice. No row requires all ten staff in one reservation. S1 can be satisfied once per group as long as every required capability is granted somewhere. S2 is a per-alias property that can be shown inside that alias's group. Whether S1/S2 must run on one full roster is **root's decision**, not a criterion.

| Must be joined (one reservation) | Why (criterion) |
|---|---|
| Main journey in `CampaignFullV3.e2e.spec.ts` | grant → elevation → admission → redemption → settings → revoke → exact reset |
| Business B1–B4 (+B6) | One admitted business, its invitations, members, stock and enquiries (D1–D4) |
| History C2–C3 | One purchase or hold and its artifact shared by the fulfiller, payment verifier and both buyers |
| Support C1, C5 | One case and its account switch |
| Diagnostics X1–X4 | One order, its report v1/v2 and its readers |
| Measurement A1–A2 | Cohorts and investigation over the same synthetic events |

M1–M5, V3–V7 and the groups above can each use a distinct reservation. A group that needs the business (B3/B4, M3 for business stock) shares B's reservation.

## Main journey: exact current floor

The spec at base has these steps: four sign-ins; two elevations; one grant and one revoke; then admission, owner redemption and settings.

| Table | Records |
|---|---|
| users 15, otp_requests 4, sessions 4 | 23 |
| totp_enrollments 2, totp_backup_codes 20 | 22 |
| staff_grants 3 (2 bootstrap + 1) | 3 |
| audit_logs 7: 2 bootstrap, GRANTED, REVOKED, BUSINESS_ADMITTED, BUSINESS_INVITATION_REDEEMED, BUSINESS_SETTINGS_CHANGED | 7 |
| dealerships 2, dealership_members 2, dealership_invitations 1 | 5 |
| **Total** | **60 ≤ 128** |

Deliveries: 4. After reset, 7 redacted audits and 4 tombstones are retained. These come from `PrismaBusinessRepository.admit`, `redeem` and `settings` (lines 64-122). Two dependencies remain **unresolved for admission**:

- The admitted Dealership is new and is not owned by the root rules. The ownership edge is a design question, and it is already the predicted refusal in the [grants slice](full-v3-staff-grants-source-20261020.md).
- An owner's redemption calls `invalidateInventory`. That deletes a *global* `measurement_state` baseline row (`PrismaBusinessRepository.ts:18-20`), which is shared state outside the journal. Its disposition is **UNKNOWN**: allowing it, journaling it, or refusing it each needs a decision.

## Group floors (auth grounded; content partially UNKNOWN)

The auth floor is 21 (bootstrap), plus 13 for the coordinator (sign-in and TOTP), plus 15 for each staff member (sign-in, TOTP and one grant), plus 2 for each customer sign-in.

| Group | Staff and capability (source) | Auth floor | Grounded content costs | UNKNOWN |
|---|---|---|---|---|
| Full roster in one reservation (only if root requires it) | 10 staff; 11 criterion-grounded grants (below) | 21 + 30 + 110 + 22 = **183**, + 1 per S2 revoke | n/a | 3 capabilities not named by any row; the private-reviewer capability |
| B | support → `founder.admission` | 21 + 13 + 15 + owner/sales-a/sales-b/buyer-a 8 = **57** | admit 3; each invite 2 (`invite`); each redeem 2; revoke-invite 1; member change 1 audit (+ a delete or update); settings 1 | Expired-invitation state (needs a time source); stock Listing with ≥3 photos (`MIN_LISTING_PHOTOS = 3`, `contracts/listings.ts:10`), so ≥1 Listing + 3 `listing_media` + 3 `media_uploads` + private objects; contact proof; enquiry claim/reassign audits; push/FCM rows |
| C | support → `support.operations`; history-fulfiller → `history.fulfilment`; payment-verifier → `history.payment.verify`; refund → `founder.refund.approve` (`PrismaHistoryOperations.ts:155`; holder alias UNKNOWN) | 21 + 13 + 3 × 15 + buyer-a/buyer-b 4 = **83** (+15 if a fourth staff member holds refund) | case open 2 (case or request + conversation); message 2 (message + outbox); staged attachment 1 + object; assignment 2 (audit + outbox); read state 1 per reader (`PrismaServiceMessaging`); history quote, booking, order, payment, intent and refund 1 each, plus 1 audit per command (`PrismaHistoryOperations`) | Number of messages and attachments; artifact, delivery and cleanup rows; **global** `history_capacity_days` and `history_provider_allowances` upserts (shared rows; ownership UNKNOWN); outbox worker fencing |
| X | reception-steward, technician, independent-reviewer → `diagnostics.reception`, `diagnostics.technician`, `diagnostics.reviewer`; `diagnostics.templates` (`PrismaDiagnosticIntake.ts:158`; holder UNKNOWN); private-reviewer capability UNKNOWN | 21 + 13 + 4 × 15 + buyer-a/owner/buyer-b 6 = **100** at minimum | order + audit 2; template version + audit 2 per version (X3 needs v2, so ≥4); assignment upsert 1 per assignee; report record 1 per version (v1, v2) + PDF artifact 1 each + audits; evidence 1 per item + object | **No HTTP path creates `diagnostic_centers` or `diagnostic_center_assignments`.** A synthetic center would be a new bootstrap exception (decision). Evidence item count; audits per transition |
| A | aggregate-viewer → `analytics.aggregate`; investigator → `analytics.investigate` | 21 + 13 + 2 × 15 = **64** | — | Positive metrics need ≥5 contributions and ≥5 distinct measured subjects ([analytics UI](../../prd/ui/analytics-improvement.md) line 37). Measurement principals and visits have no roster edge, so the ownership model is **UNKNOWN**. Collection is closed (HF) |
| M3/V3–V7 | none | 21 + sales-a/buyer-b (×platforms) | Listing ≥1 + 3 media + 3 uploads | Video session, generation, work, cleanup and grant rows per state (V4 has cancel, retry, another video and remove); private parts and posters; worker fencing |
| M1, M4, M5 | none | +2 per sign-in | conversation, participants, messages | Phone/mock-SMS OTP and the M5 email/phone change are **refused by the v3 OTP guard**; FCM devices and notification history rows |

The 11 criterion-grounded grants are: B1 `founder.admission`; C1 `support.operations`; C2 `history.fulfilment`, `history.payment.verify`, `founder.refund.approve`; X1–X3 `diagnostics.reception`, `diagnostics.technician`, `diagnostics.reviewer`, `diagnostics.templates`; A1 `analytics.aggregate`, `analytics.investigate`.

No matrix row names `founder.recovery`, `history.payment.history` or `history.export`, yet S1 says "each capability". Which of these S1 requires is **unresolved**.

**Sign-ins** depend on the device-to-actor plan:

- C5 adds an account switch.
- V3 needs sales-a on iOS and on Android.
- M4 uses two devices.
- A3 needs a sign-out and sign-in.
- Admin-browser and mobile pairs are needed for support and owner.

The count is **UNKNOWN** until that plan is fixed. Each sign-in costs 2 records and 1 delivery.

## Next smallest test-only RED slice (recommendation)

This slice needs no capacity change. Run an **S2 auth lifecycle case in its own reservation**: coordinator plus one staff alias, with an auth floor of 49 records. It asserts only normal HTTP behavior:

- the stale elevation expires (time source permitting; otherwise mark UNKNOWN);
- re-elevation by TOTP code adds 0 records;
- elevation by backup code consumes exactly one code, and reusing it is refused;
- a grant revoked mid-task is refused on the next request;
- a re-grant;
- exact reset.

It should also assert per-table journal record and event counts against this inventory, so hosted traces replace the UNKNOWN OTP-update count. In addition, assert that the main journey's journal totals equal the 60-record table above once admission is reached.

## Eventual bounded capacity design (planning only)

- **Choose groups first.** Root decides between full-roster or per-group S1/S2. The derived cap is then the largest *measured* group floor plus criterion-enumerated operations, never slack.
- **Groups that fit 128 today on auth alone:** B (57), C (83), X (100) and A (64). Each still needs its content inventory measured before anyone claims it fits. X leaves 28 records for a center, orders, two report versions, PDFs and evidence.
- **Profile-specific only.** v1/v2 keep 128/2048/128. v3 keeps exact overflow refusal at its own cap, the same cleanup-headroom formulas, lock order, 5s/20s timeouts, current-candidate binding, collision and foreign-reference refusal, and the late-worker fence.
- **Before any increase:**
  - a cap-sized reset must be measured within the unchanged timeouts;
  - each new family needs its own exact disposal: private objects with a no-resurrection proof, plus outbox and worker fencing;
  - global shared rows (measurement baseline, history capacity and allowance) need an explicit disposition.

## Unresolved decisions

1. Must S1/S2 run on the full roster in one reservation, or per group?
2. Which aliases hold `founder.refund.approve` and `diagnostics.templates`? Which capability does private-reviewer hold? Does S1 require `founder.recovery`, `history.payment.history` or `history.export`?
3. Ownership edge for admitted Dealerships, and the disposition of the global `measurement_state` baseline deleted on redemption.
4. A synthetic diagnostics center and its assignments, which have no HTTP creator: is a bootstrap exception acceptable?
5. Phone sign-in and the M5 phone/email change, which the v3 OTP guard refuses.
6. Ownership of the measurement cohorts (≥5 distinct subjects per positive metric).
7. The device and sign-in plan, which sets the sign-in count.
8. Private-object and outbox/worker disposal design for media, video, service and history artifacts, and diagnostics evidence and PDFs.
