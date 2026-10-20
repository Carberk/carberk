# Full-v3 admitted-business ownership: implementer brief (design only)

Planning evidence for #901 under #897 and PR #904. Base `07be7658`. This brief edits no source or test and approves nothing. Root authorizes source only after the hosted run reaches admission. Hosted reach is still UNKNOWN: at `67733dbd` the main journey stopped at the grant, and the result for the grants candidate is pending.

## Root disposition after hosted reach

API job `118661971095` at `9fb10b28` now passes the grant, support's pre-elevation refusal and support TOTP, then fails admission at line 235 with `Foreign campaign graph reference`. Later redemption, settings and cleanup remain unreached. This establishes admission RED, not the proposed mechanism's correctness.

The same-transaction creation proof is an implementation candidate for the fixture only, subject to test-first collision, foreign-adoption, cross-reservation and rollback evidence. It must be bounded, cannot persist observations of unrelated rows, and must not treat an ID/slug prefix or an update of a pre-existing row as creation. No application auth shortcut or fixture-only business endpoint is authorized. Independent review is still required.

Only synthetic admission is allowed. `checked` mode stays refused. Use the existing contract's evidence/reason bounds and synthetic test values; retained audits must redact them. No real provider or business facts are introduced.

Invalidating a pre-existing shared inventory baseline is **not authorized**. A before/after observation alone cannot protect against a concurrent baseline write. The next design/test slice must either prove atomic refusal of the reserved transaction while preserving the baseline and all business state, or keep redemption closed and record the unresolved mechanism. Do not claim ownership of global rows, restore a stale baseline or change ordinary production business behavior. Baseline-absent behavior must preserve unrelated collector state; concurrency and rollback remain required evidence. This supersedes the observational recommendation below.

Next: retain the reached main assertion, add bounded test-only ownership/refusal cases, then implement only the supported fixture rules after their hosted result. No cap, lock, timeout, concurrency or operational gate change is authorized by this disposition.

## Ordinary write trace (`PrismaBusinessRepository.ts`)

| Step (spec line) | Transaction writes, in order | Owned by today's v3 trigger? |
|---|---|---|
| admit (235), `:64-71` | FOR UPDATE on both Users. Then `dealerships` INSERT (new UUID; caller slug; `recovery`; `admissionMode`; `admittedAt` only if `checked`; `checkedEvidence = evidence`). Then `dealership_invitations` INSERT (owner role, `tokenHash`, +48h, from `AdmitBusiness.ts`). Then `audit_logs` `BUSINESS_ADMITTED`: target `Dealership`, details `{mode, evidence, reason, verifiedScope}` | The Dealership is **not** owned: its new ID and slug match no root rule (`staging-campaign.mjs:394-395`). The invitation is owned through `recipientUserId`, so it **refuses** with `Foreign campaign graph reference`, because `dealershipId` is unjournaled |
| redeem (239), `:82-98` | FOR UPDATE on the User and the Dealership. Owner role: `deleteMany` of the recipient's sales membership. Invitation `redeemedAt` UPDATE. `dealership_members` INSERT. Dealership `status` → `active`. **`invalidateInventory`**. Audit `BUSINESS_INVITATION_REDEEMED` `{invitationId, role}` | The Dealership update would refuse `Synthetic root identity changed` (`:446` requires `id = rootId` for *every* owned Dealership) |
| settings (241), `:118-123` | Dealership `name`/`cityId` UPDATE, then audit `BUSINESS_SETTINGS_CHANGED` `{fields}` | Same `:446` refusal |
| refusals: 233, 237, 238, 240, 243, 245 | None. Each is denied before any write: `owner()`, `recipient()`, the invitation-state checks, `founder()` | — |

None of these steps enqueues any job (`AdmitBusiness.ts`, `BusinessController.ts:55-60`). So no late-worker work arises beyond the existing auth email fence. The raw invitation token is returned only in HTTP; the database stores `tokenHash`, which is already immutable in v3. The spec asserts the audit omits the token (line 249).

## Ownership rule for a new Dealership (bounded, v3 trigger only)

**Rejected:** a slug prefix or name match, which would be prefix-only admission. Also rejected: adopting any Dealership that existed before, or was merely updated in, the transaction (foreign adoption). Also rejected: a fixture-only business path.

**Proposed: same-transaction creation proof.**

1. On any non-owned `dealerships` INSERT, the v3 trigger appends `NEW.id` to a transaction-local setting, for example `set_config('cf_<id>.created', …, true)`. That makes no persistent write and touches no foreign row.
2. On an owned `dealership_invitations` INSERT whose `recipientUserId` is a roster User, adoption is admitted only if every one of these holds:
   - `dealershipId` is in that transaction's created set;
   - the Dealership row is `status='recovery'`, `admissionMode='synthetic'`, `admittedAt` NULL and `contactPhone` NULL;
   - the role is `owner`, and the invitation is unredeemed and unrevoked;
   - no other `cf_*` journal records that ID.

   The Dealership's INSERT event is journaled first, then the invitation's. Updates never append, so a foreign row cannot qualify.
3. **`BUSINESS_ADMITTED` guard.** The actor must be a roster User other than the owner. It must hold active `founder.admission` and have a journaled elevated Session (the same pattern as the grant audit). The target must be the adopted Dealership with exactly one owner invitation. Details must have exactly the keys `{mode:'synthetic', evidence, reason, verifiedScope:'Synthetic fixture; no real business verified'}`, with strings bounded to the `AdmitBusinessSchema` limits (`packages/contracts/src/schemas/business.ts:5-6`: evidence 3-2000 characters, reason 3-1000). `checked` mode refuses, because it would claim real verification.
4. **Admitted-Dealership guard** (separate from the root's `:446`):
   - only `recovery → active` with an owned owner membership in the same transaction (redeem);
   - `name`/`cityId` changes by an active owner member (settings);
   - every other column is immutable.

   The root's guard is unchanged.
5. **Membership, invitation and audit transitions.**
   - The invitation may only go from unredeemed to `redeemedAt`.
   - The member INSERT must be owned, with role `owner` and status `active`, for the invitation's recipient.
   - `REDEEMED` requires `{invitationId, role}` with an actor equal to the member, and `invitationId` must be an owned redeemed invitation.
   - `SETTINGS_CHANGED` requires `{fields ⊆ ['name','cityId']}` with an actor who is the active owner.
   - **Integrity** (identities only): every adopted Dealership has exactly one `ADMITTED` audit; every owner redemption has one `REDEEMED` audit; every settings event has one `SETTINGS_CHANGED` audit.
6. **Collision and foreign data.** A Dealership with the same slug (from any reservation or outside one) fails the ordinary unique `slug` constraint. That gives an application error and no adoption. Foreign members, invitations, reports or JSON referencing the adopted Dealership refuse through the existing preflight (`:347-365`).
7. **Reset.** The existing child-first order already deletes `dealership_invitations` and `dealership_members` before `dealerships` (`:506`). The existing redaction step replaces every owned audit with `actorId NULL`, `SyntheticCampaign` and `{profile, disposition}`. This removes the evidence, reason and fields text. `checkedEvidence` is deleted together with its row. A lost-response retry from `disposed` stays observe-only. Unchanged: v1/v2, the 128/2048/128 caps, locks, 5s/20s timeouts, concurrency and the closed operator entry points.

## `invalidateInventory` and global `measurement_state`

- **Contract.** `inventory_baseline:<epoch>` holds an ISO timestamp marking when inventory became complete. `RecomputeImprovement.ts:19,47` sets `inventoryAvailable` only if that row exists and predates the window.
- **What deletes it.** Owner redemption (`PrismaBusinessRepository.ts:18-20`), account deletion (`PrismaAccountDeletionUnitOfWork.ts:36-39`) and account restore (`PrismaAccountRestoreUnitOfWork.ts:23-24`). Each takes `collector` FOR UPDATE and then deletes the baseline. Deletion only ever makes the metric *unavailable*, never wrong.
- **What creates it.** No production code creates it; only tests do (`Improvement.e2e.spec.ts:79`, `BusinessMembership.e2e.spec.ts:52`). On staging, then, it is normally absent and `deleteMany` affects 0 rows. That is a **fact to observe, not assume**.
- **Recommendation.** Keep normal application behavior. Do **not** journal, refuse, adopt or restore the global row:
  - restoring it would republish a stale baseline;
  - refusing it would change normal redemption;
  - journaling it would claim shared state.

  Instead, the reservation record would read the presence and value of `collector` and `inventory_baseline:<epoch>` (read-only) before acceptance and after reset. A run that finds a baseline present is a **halt for a root/founder decision**, not silent approval. `measurement_state` is outside the v3 table set and has no FK, so reset locks are unaffected. Redemption's `collector` FOR UPDATE does not conflict with reset's lock set.
- **Classification.** This needs a **material decision**: whether an acceptance run may invalidate a live inventory baseline. It is not a fixture-ownership change.

## Required RED assertions (hosted spec, before source)

Extend the existing main journey; another writer owns the S2 lifecycle file.

1. **Admission journals the expected rows.** The owned journal contains the adopted Dealership, its owner invitation, the `ADMITTED`, `REDEEMED` and `SETTINGS_CHANGED` audits, and the owner membership. A full digest is unchanged across the refused steps 233, 237, 238, 240, 243 and 245.
2. **Foreign adoption refuses.** In the same reservation:
   - an ordinary admission whose slug collides with a pre-existing foreign Dealership fails, and the foreign row stays unchanged;
   - a foreign Dealership referenced by a later invitation stays foreign and makes the write refuse;
   - a second reservation's adopted Dealership is never adopted by the first, and its digest is unchanged after reset.
3. **Stale or wrong candidate refuses.** A changed candidate refuses the admission write and leaves the digest unchanged, as the existing `a8` pattern does.
4. **Reset and retry.** Exact reset removes the Dealership, invitation and membership. Retained audits match the redacted shape, with no `evidence`/`reason`/token text. The lost-response retry receipt and digest are identical.
5. **Measurement baseline.** `measurement_state` `collector` and `inventory_baseline` are observed before and after. This is an assertion of the application's normal effect; the spec creates no baseline unless root decides to.

## Smallest next slice and open decisions

**Next slice (after hosted reach at line 235).** Make the RED assertions 1-4 test-only. Then the v3 trigger source covers steps 1-7 above, still with no capacity change. The main journey's measured journal total should replace the 60-record estimate.

**Open decisions (root):**

- **(a)** Is the transaction-local creation proof acceptable as the adoption mechanism?
- **(b)** May an acceptance run invalidate a present live `inventory_baseline`? If not, should it halt before redemption?
- **(c)** Should `checked` mode stay refused in v3?
- **(d)** Is there an evidence/reason length and content policy for audits before redaction?
