# Full-v3 synthetic admission creation source

Source slice for #901 under #897 and sole draft PR #904. Base `aa7ae0c8`. Branch `agent/issue-901-v3-admission-create-20261020`, reserved and pushed before edits.

The 14-case spec, the worker helper, application code, schema, dependencies, the CLI, the controller, Railway entry points and the capacity numbers are unchanged. This slice covers **admission only**. It does not establish hosted GREEN, and it activates nothing operationally. The design and its root dispositions are in the [ownership plan](full-v3-admission-ownership-plan-20261020.md).

## Hosted RED and cause

`aa7ae0c8` ran as PR Checks `39436318449`, API job `118674322364`. Full-v3 was 10/14. The S2 lifecycle, slug-collision and pre-existing foreign-recovery cases passed.

Four cases returned 500 where 201 was expected, at spec lines 261, 558, 587 and 617. Each failed on ordinary admission, with `Foreign campaign graph reference`. The logs are `/tmp/carberk-next-release-20261020/aa7ae0c8-api-118674322364.{raw,plain}.log`: file outcomes at lines 2435-2450, failures at 2454-2538.

**Cause.** `PrismaBusinessRepository.admit` (`:64-71`) INSERTs a new Dealership, then its owner invitation, then `BUSINESS_ADMITTED`, all in one transaction.
- The Dealership matches no root ownership rule.
- The invitation is owned through its roster `recipientUserId`, but its `dealershipId` was unjournaled, so the edge guard refused it.

## Change (`scripts/staging-campaign.mjs`, v3 only; v1/v2 text byte-identical)

1. **Creation slot.** A non-owned `dealerships` INSERT runs `set_config('cf_<id>.created_dealership', id, true)` before the existing early return.
   - It holds a single value, local to the transaction, and is never persisted.
   - It reverts on rollback, including a rolled-back subtransaction.
   - UPDATE never writes it.
2. **Adoption.** An owned owner-role `dealership_invitations` INSERT adopts only the Dealership in that slot. It runs after the journal-hash check and before the edge and limit checks. The Dealership must not already be journaled in this namespace. The Dealership row must be:
   - `recovery`, synthetic, with no `admittedAt`;
   - a non-root slug, a name of 2-120 characters, `checkedEvidence` of 3-2000 characters;
   - null in every other column (contact, logo, city, address and so on).

   The invitation must be the Dealership's only invitation; it must be unredeemed and unrevoked, for a roster User, with no members yet. Otherwise the INSERT refuses `Unsupported campaign admission`. On success, the trigger clears the slot and journals the Dealership's INSERT event (exact row hash), then the invitation, both in this namespace's single journal. The unchanged 128-record, 2048-event and headroom checks then count both rows, so an overflow rolls back the whole admission.
3. **`BUSINESS_ADMITTED` audit guard.** INSERT only, targeting the adopted, journaled Dealership. The actor must:
   - be a roster User other than the owner-invitation recipient;
   - hold active `founder.admission`;
   - have a journaled live elevated Session.

   `details` must have exactly the keys `evidence`, `mode`, `reason` and `verifiedScope`, with `mode='synthetic'`, the fixed synthetic `verifiedScope`, `evidence` equal to the Dealership's `checkedEvidence`, and a `reason` string of 3-1000 characters. There must be exactly one such audit per Dealership. The exact key set excludes any token field; the raw token is generated outside the database and only its hash is stored.
4. **Admission only.** In `identities`, these refuse `Unsupported campaign business`:
   - any other INSERT or any UPDATE of an admitted Dealership's invitation;
   - any membership row in it.

   An admitted Dealership UPDATE still hits the unchanged root-identity guard. So owner redemption refuses at its first owned write, the invitation `redeemedAt` UPDATE (`:92`), before `invalidateInventory` (`:95`). It can therefore never reach the global baseline DELETE. Settings and recovery also stay refused. **No `measurement_state` trigger is added.**
5. **Integrity.** In `identities` only, `Campaign admission audit mismatch` fires unless every non-root journaled Dealership meets all three conditions:
   - its version is 1;
   - it has exactly one owned, unchanged owner invitation;
   - it has exactly one owned `BUSINESS_ADMITTED` audit.
6. **Reset.** The unchanged child-first order deletes the invitation, then the Dealership. Unchanged redaction retains the admission audit as `SyntheticCampaign`, which removes the evidence and reason text. No admission path enqueues work, so there is no late creation. The terminal retry stays observe-only.

**Unchanged:** locks and their order, `lock_timeout`/`statement_timeout`, concurrency, the trigger set (22), the schema and journal hashes, and the record, event and delivery budgets. Current-candidate binding, the lifecycle rules, the collision and foreign-reference preflight and the key-reuse rule are also unchanged.

**Refusal paths** (both expected to keep their observable results):
- **Recovery of a pre-existing foreign Dealership.** An UPDATE leaves the slot empty, and the invitation still refuses `Foreign campaign graph reference`.
- **Cross-reservation.** Rosters are disjoint, so only the recipient's namespace owns the invitation. The other reservation's committed Dealership is never in this transaction's slot. Recovery of it hits the owning namespace's root-identity guard.

**Threat model.** The guards defend ordinary code paths, concurrent traffic, rollback and bugs. Same-role SQL can set the slot, as it can write the journal or disable triggers (`scripts/staging-remote.mjs:17-25`).

## Verification (offline only)

- `node --check scripts/staging-campaign.mjs`: PASS.
- `node /tmp/issue901-v3-admission-source-check.mjs`: PASS against `aa7ae0c8`, using a VM fake transport. It verifies:
  - `campaignMain`, `campaignQueueMain` and `staging-remote.mjs` are identical;
  - all five v2 SQL paths are identical;
  - every v3 fixture and reset statement differs only by the admission fragments;
  - there are 22 triggers and no `measurement_state` reference;
  - the order: slot before the early return; adoption after the journal check and before the edge and limit checks;
  - the fragments have balanced parentheses.
- `node --test` on the four staging suites, run once: 153/153 PASS, exit 0. Log `/tmp/issue901-v3-admission-controls.log`.
- `git diff --check` and `pnpm check:agent-docs`: PASS.

**Not executed:** PostgreSQL parsing and execution of the new trigger code, including `set_config`/`current_setting` placeholder behavior, the enum comparison `i.role='owner'`, and jsonb key ordering. HTTP, real rollback and concurrency are also not executed.

The clock assumption for the elevated-actor check is unchanged and carried forward: database time against the UTC `timestamp(3)` values the API stores.

## Predicted hosted outcomes (prediction, not evidence)

- **`ae` and `b0`** (lines 558 and 587): should now pass. Admission returns 201 with both rows journaled; the cross-reservation and stale-candidate refusals hold; exact resets complete.
- **Main case:** should now pass admission (261) and the refusals at 266-268. It should then fail at **line 269**: owner redemption returns 500 rather than 201, with `Unsupported campaign business`.
- **`b1` baseline case:** its first refusal check should pass, because redemption returns 500 and is rolled back. It should then fail in its race section with `Reserved redemption never waited on the collector row lock`, because redemption now refuses before taking the collector lock. That follows from this slice deliberately excluding redemption and the baseline guard.
- **Other cases:** unchanged.

## Residual risks

- Placeholder GUC behavior and the position of the slot write inside unrelated transactions are verified only in hosted PostgreSQL.
- Every v3 namespace's dealership trigger, including disposed namespaces, now performs one `set_config` per non-owned Dealership INSERT. The cost is O(1) per namespace.
- A transaction that creates two Dealerships before the invitation adopts only the last one. The application never does this.
