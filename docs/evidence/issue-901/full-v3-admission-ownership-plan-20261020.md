# Full-v3 admitted-business ownership: implementer brief (design only)

Planning evidence for #901 under #897 and PR #904. Base `07be7658`. This brief edits no source or test and approves nothing. Root authorizes source only after the hosted run reaches admission. Hosted reach is still UNKNOWN: at `67733dbd` the main journey stopped at the grant, and the result for the grants candidate is pending.

## Root disposition after hosted reach

API job `118661971095` at `9fb10b28` now passes the grant, support's pre-elevation refusal and support TOTP, then fails admission at line 235 with `Foreign campaign graph reference`. Later redemption, settings and cleanup remain unreached. This establishes admission RED, not the proposed mechanism's correctness.

The same-transaction creation proof is an implementation candidate for the fixture only, subject to test-first collision, foreign-adoption, cross-reservation and rollback evidence. It must be bounded, cannot persist observations of unrelated rows, and must not treat an ID/slug prefix or an update of a pre-existing row as creation. No application auth shortcut or fixture-only business endpoint is authorized. Independent review is still required.

Only synthetic admission is allowed. `checked` mode stays refused. Use the existing contract's evidence/reason bounds and synthetic test values; retained audits must redact them. No real provider or business facts are introduced.

Invalidating a pre-existing shared inventory baseline is **not authorized**. A before/after observation alone cannot protect against a concurrent baseline write. The next design/test slice must either prove atomic refusal of the reserved transaction while preserving the baseline and all business state, or keep redemption closed and record the unresolved mechanism. Do not claim ownership of global rows, restore a stale baseline or change ordinary production business behavior. Baseline-absent behavior must preserve unrelated collector state; concurrency and rollback remain required evidence. This supersedes the observational recommendation below.

Next: retain the reached main assertion, add bounded test-only ownership/refusal cases, then implement only the supported fixture rules after their hosted result. No cap, lock, timeout, concurrency or operational gate change is authorized by this disposition.

## Follow-up: baseline race and bounded provenance (design only, base `9f8b83cf`)

This section supersedes the earlier "observe and halt" baseline recommendation and the multi-ID "created set" below. No source is authorized.

### Root disposition of this follow-up

The proposed baseline guard is eligible for the next fixture implementation after the test-only preservation cases have a hosted result. This is a bounded extension of the existing trigger mechanism to protect shared state during the selected synthetic journey, not permission to mutate or own that shared state. A fixture refusal may return 500, with complete transaction rollback and unchanged unrelated rows. Live operational entry points remain closed.

The permitted extra table interaction is a v3-only `measurement_state` trigger installation with explicit setup lock ordering and exact trigger-definition integrity verification. Do not change existing lock modes, timeouts, reset lock targets, record/event/delivery budgets, v1/v2 behavior or ordinary application semantics. Preserve the canonical ordering of existing setup targets; the added DDL target must have a documented position, bounded failure and rollback evidence. Do not claim deadlock freedom. If that limited change cannot enforce preservation, return the conflict instead of broadening locks or suppressing the refusal.

Use the single bounded creation slot only within the documented ordinary-code/concurrent-traffic threat model. The same-role SQL limitation must remain explicit. Require negative evidence for pre-existing-row updates, rolled-back creation and cross-reservation references. Neither prefix matching nor observing an updated row's transaction ID establishes creation.

**Threat model and privilege limits.** The storage program runs `psql` with the API's own `DATABASE_URL` (`scripts/staging-remote.mjs:17-25`). The namespace triggers and functions are therefore created by, and writable by, the application role. Any SQL running as that role can disable a trigger, write `cf_*` tables or set a custom setting. Any role can set a dotted placeholder GUC in its own session; another session cannot. So no trigger mechanism is a security boundary against arbitrary same-role SQL.

These guards defend only against:
- ordinary application code paths;
- concurrent unrelated traffic;
- rollback;
- bugs.

Application code sets no custom settings: it uses only `SET LOCAL` timeouts (grep of `apps/api/src`, `apps/worker/src`, `packages/db/src`).

### Root implementation disposition after 794ac50a

Hosted API118683953780 now passes admission and cross-reservation admitted disposal, then reaches owner-redemption refusal and the blocked collector-lock race. The baseline behavior remains unproven. Implement the bounded owner-redemption/name-or-city settings/audit/reset rules and planned atomic baseline refusal against the unchanged fifteen tests. Sales membership, recovery, contact/media and operational entry points remain later slices.

Place the extra v3 setup-only `measurement_state` ShareRowExclusive lock after the existing fixed-table locks and before the namespace advisory lock. Preserve the canonical existing target order and all reset targets/modes/timeouts. The extra target can contend or deadlock with ordinary traffic; PostgreSQL must abort and roll back completely. No retry or deadlock-freedom claim is authorized. Exact trigger-definition integrity, present/absent baseline behavior, the collector-lock race and unrelated ordinary deletion remain required hosted evidence.

The stale-candidate case also reaches a distinct no-SQL violation in the wrapper: namespace existence is read before the fixture candidate/target mismatch is refused. A v3-only early wrapper check may repair that boundary without weakening the assertion or altering v1/v2 behavior.

### Creation provenance: a single transaction-local slot

- **On INSERT.** On a non-owned `dealerships` INSERT, each v3 namespace trigger does `set_config('cf_<id>.created_dealership', NEW.id, true)`, then returns as it does today.
  - The slot holds one value, overwritten by each insert, so it stays O(1) per namespace per transaction even for bulk imports.
  - It is never persisted and never read by unrelated rows.
  - UPDATE never writes it.
- **On adoption.** An owned owner-role `dealership_invitations` INSERT adopts only if all of these hold:
  - `current_setting('cf_<id>.created_dealership', true)` equals `NEW."dealershipId"`;
  - the row is still synthetic, `recovery`, has no `admittedAt` and no `contactPhone`.

  The trigger then journals the Dealership INSERT, clears the slot, and journals the invitation.
- **Foreign UPDATE exclusion: `recover()` is the real counterexample.** `PrismaBusinessRepository.ts:125-141` UPDATEs an existing Dealership and then INSERTs an owner invitation for a recipient who may be on the roster. An xmin or "visible in this transaction" proof would adopt that foreign Dealership. The slot does not, because UPDATE never sets it. The invitation then refuses `Foreign campaign graph reference`, and the whole recovery rolls back, including its baseline deletion.
- **Rollback.** A local GUC set inside a transaction, or a released subtransaction, ends with it. A rolled-back subtransaction reverts it together with the journal writes it made. Business paths use no savepoints; the only one is `PrismaConversationRepository.ts:507-533`.
- **Cross-reservation.** Each namespace has its own slot, but only the namespace whose disjoint roster contains `recipientUserId` treats the invitation as owned. A Dealership created in an uncommitted transaction cannot already be journaled elsewhere. After commit, the existing edge rules refuse every cross-namespace member or invitation from either side, so scanning other namespaces' journals is unnecessary.
- **Limit.** Code in the same transaction could set the slot to a foreign ID. Ordinary code never does.

### Atomic baseline preservation (refuse the reserved transaction)

- **Trigger.** `CREATE TRIGGER "cf_<id>_baseline" AFTER DELETE ON public.measurement_state FOR EACH ROW WHEN (OLD.key LIKE 'inventory_baseline:%')`. It calls a first branch in the same `track_business()` function, so `tracking_hash` covers it.
- **Predicate.** It raises `Campaign shared baseline preserved` only if this backend holds the namespace's transaction advisory lock:
  - `pg_locks`, `locktype='advisory'`, own `pid`, `granted`, `objsubid=1`;
  - the key reassembled from `classid`/`objid` equals `hashtextextended('<ns>',0)`.

  That is the pattern the cleaning rule already uses at `staging-campaign.mjs:436`. The predicate takes no lock and writes nothing.
- **Why the predicate is "this transaction wrote owned rows".** Every owned write takes that lock before journaling (`:407`). Redemption makes owned writes before `invalidateInventory` (`:92-95`): the invitation UPDATE, the member INSERT and the Dealership UPDATE. Unrelated transactions never take a namespace's lock, so their baseline deletions (other businesses, account deletion or restore) are unchanged.
- **Tamper direction.**
  - A transaction advisory lock cannot be released early; `pg_advisory_unlock` does not release xact locks.
  - Taking the lock spuriously only adds refusals.
  - A subtransaction abort that released the lock would also discard the owned writes.

  So the direction is fail-safe either way. The exact behavior on subtransaction abort is to be verified, not assumed.
- **Race with concurrent baseline creation.** `deleteMany` is a single READ COMMITTED `DELETE … WHERE key = …`.
  - A baseline committed before that statement is seen; deleting it fires the trigger; the whole redemption rolls back. Nothing is redeemed, there is no member, the Dealership stays `recovery`, the journal is unchanged and the baseline is preserved.
  - A baseline inserted but uncommitted, or committed after the statement's snapshot, is not deleted, so it is preserved.
  - With no baseline, 0 rows are deleted, the trigger does not fire, and `collector` is only row-locked (`FOR UPDATE`), never written.

  No preflight dependence remains, so a baseline created between preflight and redemption is covered.
- **Surface.** The application returns 500, like other fixture refusals. Reset never deletes baselines, so reset is unaffected.

### Boundary: a bounded decision is needed (not a workaround)

This trigger sits on a global table **outside** the fixed 22-table set. Reset's lock set and order, and ordinary owned writes, are unchanged. The fixture transaction, however, would take `ShareRowExclusive` on `measurement_state` for `CREATE TRIGGER`. That has two consequences:

- baseline and collector *writes* block for up to the fixture's 20s;
- a deadlock is possible against a concurrent account deletion that holds `measurement_state` and then wants `users`. PostgreSQL aborts one side; the fixture can be retried and leaves no partial state.

Integrity must also verify this trigger's exact definition. It has a `WHEN` clause, so it cannot pass the existing `tgqual IS NULL` count.

**Root decides:**
1. May the fixture add this trigger and lock on `measurement_state`, and where in the fixture lock order?
2. Is a 500 acceptable as the refusal surface?

If the answer to (1) is no, keep owner redemption closed. No safe atomic alternative exists inside the fixed set, because the only write is to an unjournaled global table.

### RED cases for the test writer (expected behavior, labelled prediction)

- **Baseline present.** Owner redemption returns 500. The baseline row is unchanged, the invitation is unredeemed, there is no membership, the Dealership stays `recovery`, and the journal digest is unchanged.
- **Baseline absent.** Redemption returns 201, and the `collector` row is unchanged.
- **Unrelated deletion.** An unrelated reservation-less transaction still deletes a baseline normally.
- **Foreign recovery.** A roster recipient in a foreign `recover()` is refused, the foreign Dealership is unchanged, and the baseline is preserved.
- **Rollback.** A rolled-back admission leaves no journal rows and no adopted ID.

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
