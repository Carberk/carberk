# Full-v3 business graph: next slices after admission (design only)

Planning evidence for #901 under #897 and PR #904. Base `763b411e`; `main` `9fde309c`. Documentation only; no source, test, cap, lock, timeout, concurrency, auth or architecture change is approved. Admission provenance and the baseline guard stay as decided in [the admission ownership plan](full-v3-admission-ownership-plan-20261020.md) and are not rederived. Criteria: matrix rows B1–B4, B6 ([D1–D4, D7](../issue-897/release-acceptance-matrix-20261020.md)) and Engineering gap 2. Counts follow the [capacity inventory](full-v3-capacity-inventory-20261020.md) accounting rules; the main journey's 60 records are still an unmeasured estimate.

## Root disposition at 794ac50a

Use buyer-a as the admitted owner, sales-a/sales-b for sales membership, and buyer-b for later customer enquiries. Bootstrap alias owner remains bound to the root business. These aliases identify synthetic actors, not exclusions from any role or account-switch criterion.

Prepare membership proof as a separate case with its own reservation, preserving all fifteen existing cases and their assertions. Batch it with the next eligible source checkpoint. At794ac50a the admission-only guard refuses further admitted-business invitation writes before their audit; the unsupported-audit prediction below applies only after that earlier guard is extended. No deeper behavior is established until setup reaches its assertions. Phone contact proof and enquiry-audit disposition remain separate decisions. No media, worker or capacity change is authorized here.

## Source facts that bound every slice

| Fact | Source | Consequence |
|---|---|---|
| Root Dealership is bootstrapped `recovery`, owned by alias `owner`; `dealership_members.userId` is unique | `staging-campaign.mjs:483-484`, `PrismaBusinessRepository.ts:43-46` | The spec admits a second Dealership owned by **buyer-a** (`CampaignFullV3.e2e.spec.ts:247,254`). B4's buyer must then be a non-member alias (buyer-b), or root re-maps aliases. Root decides; no criterion is dropped |
| `listings`, `listing_drafts`, `conversations` must carry `businessId = rootId`; root must stay `recovery` with no `contactConfirmedAt` | `:447`, `:446` | All B2–B4 stock/enquiries on the admitted business refuse `Campaign business required`; personal drafts (null `businessId`) refuse too. Root can never publish (inactive) |
| Audits allowed: bootstrap, grant/revoke (+ADMITTED/REDEEMED/SETTINGS once admission lands) | `:262`, `:453` | `BUSINESS_INVITATION_CREATED`, `_REVOKED`, `BUSINESS_MEMBERSHIP_CHANGED` refuse `Unsupported campaign audit` |
| Drafts: payload keys only `description`, `media = []`; messages text-only, no metadata | `:457-458` | Photo drafts (≥3, `MIN_LISTING_PHOTOS`) and private chat images refuse |
| Messages/participants sender must be buyer or `sellerId` | `:450`; `SendMessage.ts:36` | A reply by owner/sales-b (not the creator) refuses `Campaign participant mismatch` |
| OTP rows must be `sign_in`/email/null phone/null business; contact proof only `rootContact` | `:124,418`, `:452` | `/me/contact-phones/request|verify` (phone OTP, `businessId`) refuses; staging phone delivery is a scaffold (UNKNOWN sink) |
| Not journaled: `media_uploads` (FK `businessId` **Restrict**), `listing_media` (cascade), `media_upload_cleanups`, `notification_history`, BullMQ `direct-message-push`, S3 public media and `business-chat-private` objects | `schema.prisma:539-611,950`; `BullMqPushQueueProducer.ts:30`; `MinioBusinessChatFileStore.ts` | Reset's Dealership DELETE fails on leftover uploads (blocked, not silent); objects/jobs survive reset |

## Per-operation graph (ordinary HTTP; refusals write nothing)

| Op (route) | Writes, in order | Records / audits | Jobs, objects, global | v3 at base + admission plan |
|---|---|---|---|---|
| Invite sales (`POST /business/:id/invitations`) | lock users+Dealership; revoke prior pending to same recipient (UPDATE); invitation INSERT; audit CREATED | 1 + 1 audit | none; token only in HTTP | refuses: audit action |
| Revoke invite (`…/invitations/revoke`) | invitation `revokedAt` UPDATE; audit REVOKED (only if count=1) | 0 + 1 | none | refuses: audit; `revokedAt` transition unlisted in admission step 5 |
| Redeem sales (`/invitations/redeem`) | invitation UPDATE; member INSERT; audit REDEEMED. **No** `invalidateInventory` | 1 + 1 | none | supported only once member/REDEEMED rules allow role `sales` |
| Suspend/restore/remove (`…/members`) | member UPDATE or DELETE; audit MEMBERSHIP_CHANGED | 0 + 1 each | none | refuses: audit |
| Business draft / edit | `listing_drafts` INSERT/UPDATE | 1 | none | refuses: business required |
| Contact proof | `otp_requests` INSERT/UPDATE; `verified_contact_phones`; Dealership `contactPhone` UPDATE | ≥2 | phone delivery | refuses (OTP guard; admitted-Dealership guard allows only name/cityId) |
| Upload ×3 + publish | `media_uploads` ×3, prepare/adopt UPDATEs; listing INSERT; `listing_media` ×3; draft DELETE | 1 listing (+1 draft) journaled; 6 unjournaled | 3 × 5 public objects (original + 4 variants); worker media maintenance | refuses: draft media, business required |
| Adopt media after publish (`/listings/:id/media/attach`) | upload row; `listing_media` +1 | 0 journaled; 2 unjournaled | 5 objects | refuses |
| Enquiry (buyer message) | conversation INSERT; 1 participant (buyer only for business); message; conversation pointer UPDATEs; `notification_history` | 3 journaled; ≥1 unjournaled per recipient | push job per recipient; socket emit | refuses: business required |
| Claim/reassign/close (`/conversations/business/:id/:cid/:action`) | conversation UPDATE (version); `business_enquiry_audits` INSERT | 1 each | none | supported only after the business rule changes |
| Private image | message kind image + metadata; `business-chat-private` PUT | 1 | 1 private object | refuses: message media |

Statuses: `INVITATION_INVALID`, `MEMBERSHIP_CONFLICT`, `SOLE_OWNER` → 409; other business denials → 403; P2002/P2003/P2025/P2034 → 409 (`BusinessController.ts:22-30`). Fixture refusals surface as 500 with full rollback.

## Joined journey floor (one reservation; journaled records only)

Main journey 60 (estimate) + B1/B2 membership slice 13 (below) + sales drafts 2 + publish 2 (listing, consumed draft) + contact proof ≥2 (UNKNOWN OTP rows) + enquiry 3 + member reply 1 + private image message 1 + claim/reassign audits 2 + buyer-b sign-in 2 = **≥ 88**. If `media_uploads`/`listing_media` join the journal: +8 (4 uploads, 4 media) = **≥ 96**. UNKNOWN: OTP verify update events, account-switch/second-device sign-ins (device plan), native device and `notification_history` rows, contact-proof row count, claim-loser effects. No headroom is added; no cap change is proposed.

## First bounded test-only slice: B1/B2 membership on the admitted business

Extend the main journey after settings and before reset (same reservation, joined to the admitted Dealership). Add sales-a sign-in (+2 records, +1 delivery). Assert the full digest is unchanged after every refusal:

1. owner invites sales-a → 201 `{invitationId, token, expiresAt}`; journal gains invitation + CREATED audit.
2. sales-b redeems sales-a's token → 409 (wrong account).
3. owner re-invites sales-a (duplicate) → 201; old token → 409; old invitation `revokedAt` set, one new CREATED audit.
4. owner invites sales-b, then revokes → 201/201; sales-b redeem → 409; second revoke → 201 with **no** audit.
5. sales-a redeems → 201 role `sales`; repeat → 409; sales-a invites/edits settings → 403 `OWNER_REQUIRED`; `measurement_state` unchanged (no baseline path for sales).
6. owner suspends sales-a → 201; sales-a `GET /business/current` → 403; restore → 201; owner removes owner → 409 `SOLE_OWNER`.
7. A foreign Dealership (fresh, outside any reservation) invites sales-b → fixture refusal; foreign row unchanged.
8. Changed candidate refuses invite and leaves the digest unchanged (a8 pattern).
9. Reset: invitations/member deleted; 7 new audits retained redacted (no token/invitation text).

Records: invitations 3, member 1, audits 7 (3 CREATED, 1 REVOKED, 1 REDEEMED, 2 MEMBERSHIP_CHANGED), sign-in 2 = **13**. Sales removal (+1 audit) is deferred to slice 4, where D3 needs it after publish. Expired invitation (48h, `InviteBusinessMember.ts`) needs a legitimate clock boundary: **UNKNOWN**, kept as a named gap; the separate expiry writer's approach must not be reused by editing its files. Expected RED at base: step 1 refuses `Unsupported campaign audit` (after the admission writer's guard lands). Later source extends only audit actions and invitation/member transitions for the adopted Dealership.

## Later slices, in order (each test-first, own hosted result)

2. **B2 drafts:** generalize the `businessId` rule from root to root-or-adopted; personal drafts stay refused unless root decides personal context is in scope of this reservation (B2 requires it).
3. **B3 contact proof:** blocked on decision 5 of the capacity inventory (phone OTP and its delivery sink).
4. **B3 media/publish/adopt; creator removal:** needs journaled uploads, object disposal with no-resurrection proof and worker media-maintenance fencing before Restrict-FK reset can succeed.
5. **B4 enquiries:** member-sender rule, enquiry audits, push-job fencing, socket/push/private-image revocation receipts; private bucket provisioning is a release gate.
6. **B6:** surfaces only; no new graph.

## Obligations for every slice

- **Collisions:** slug unique; `dealership_members.userId` unique; roster users already bound to root cannot join the admitted business.
- **Cross-reservation/foreign:** a foreign owner inviting, a foreign buyer enquiring, or a foreign user favoriting/reporting published synthetic stock must refuse and leave foreign state unchanged; reports follow the existing foreign-reporter rule (`:400`).
- **Current candidate:** each new write path refuses on candidate change.
- **Audit retention:** new `audit_logs` actions are retained redacted; `business_enquiry_audits` are deleted by reset (`:506`). Whether that satisfies enquiry-history retention is unresolved and needs root's confirmation, not a change.
- **Late workers:** push jobs and media maintenance may run after reset; only the email queue is fenced today.
