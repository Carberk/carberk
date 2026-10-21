# Full-v3 B2 draft context source handoff, 2026-10-21

Implementation writer under #901 / #897 / PR904. T3 checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-eb96ab98` at exact base `4dd1ecfeb13dfa8a5e5b56b46b142870ee9e8be7`, a docs-only successor to published `45a5be4cb43c6c61873117bf2201135efb763ec2`. Branch `agent/issue-901-v3-draft-context-source-20261021` was reserved and pushed at that base before edits. Root alone assembles, pushes integration and updates GitHub execution records. No PR, child agent or reviewer was used.

## Reached RED

Root supplied hosted evidence on `45a5be4c`, API job `118967370288`, run `39521844904`. Full-v3 passed 21/24, including all original seventeen and all four coordinator cases. The [draft context case](../../../apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts) reached its first owner personal draft POST at line 1478 and received 500 instead of 201. `/tmp/carberk-next-release-20261020/45a5be4c/api.plain.log` lines 2452–2462 show `DriverAdapterError: Campaign business required`; lines 2533–2554 show the failing assertion. This writer read that local log copy and did not rerun the hosted suite. The [test handoff](full-v3-draft-context-test-handoff-20261020.md) predicted the next two barriers: the same root-only guard on the admitted-business INSERT, then `Unsupported draft payload` on the first PATCH because [UpdateDraft](../../../apps/api/src/modules/listings/application/UpdateDraft.ts) always writes `validatedSteps: []`.

## Source change

Only [staging-campaign.mjs](../../../scripts/staging-campaign.mjs) and this handoff change. Every edit is gated by `bootstrapV3`; identities-v1 and business-v2 serialize byte-identical SQL.

- The shared `Campaign business required` guard no longer names `listing_drafts` in v3. Listings and conversations stay root-only.
- New v3 `draftContext`: a draft with `businessId` NULL or the root ID passes. Other businesses require a journaled, live, `active`, synthetic dealership with a current version-one owner (existing `activeOwner`). An INSERT also requires the creator `userId` to hold an active `owner` or `sales` membership in that business, journaled with a current row hash. UPDATE needs no current creator membership, so the owner keeps access to suspended sales work. The existing immutable-key rule keeps `userId` and `businessId` fixed, which forbids silent context transfer.
- The v3 draft payload guard additionally accepts `validatedSteps` only when it is exactly `[]`. Description remains a string and media remains exactly `[]`. Any other key, including contact, photos, publication or wizard fields, or non-empty steps still refuses.

Unchanged: parent-edge ownership, `Foreign campaign graph reference`, key reuse, `Campaign parent or key transfer`, untracked mutation, current candidate binding, journal/event hashes, 128/2048 caps and cleanup headroom, lifecycle `cleaning`/`disposed` refusals, disposal order and lost-response retry. SMS binding/ledger/function fingerprints, delivery fences, coordinator deferred triggers, audit pairing and baseline preservation are also unchanged. No app behavior, schema, migration, spec, contact/coordinator source, handoff or operational entry point changed.

## Criterion table

| Criterion | Source basis | Status |
|---|---|---|
| Personal text draft, businessId NULL, reservation-owned | `draftContext` excludes NULL; `userId` edge to a journaled User makes it owned; the parent check rejects foreign Users | Source admits; runtime unproven |
| Admitted-business draft by active owner/sales | INSERT requires journaled active membership (owner/sales) in active journaled synthetic business with live owner | Source admits; runtime unproven |
| Creator ownership preserved; no silent transfer | Existing immutable `userId`/`businessId` raise `Campaign parent or key transfer`; app returns 403 first | Unchanged |
| Foreign/cross-reservation parents refused | Existing parent-edge check; NULL edges are skipped | Unchanged |
| Suspension preserves owner access and saved work | UPDATE needs no creator membership; owner edit passes; app refuses suspended sales before write | Source admits; runtime unproven |
| `validatedSteps: []` exactly, closed otherwise | Payload guard adds one key with exact `[]` value | Source admits; runtime unproven |
| Personal-root v1/v2 behavior preserved | v1/v2 generated SQL and receipts are byte-identical for fresh, retry and reset | Offline proven |
| Accounting 68/91, 159; control 24/26, 50 | Guard adds no writes; draft INSERT +1 record/+1 event, UPDATE +1 event, as in the handoff table | Prediction |
| Disposal, retry, foreign draft survival, no late resurrection | Journal-driven deletes; `listing_drafts` precedes `dealerships`/`users`; disposed lifecycle refuses owned writes | Unchanged; runtime unproven |
| Member removal, creator deletion, published stock/media, native D2/D3 | Not admitted; suspension certifies none of these | Later obligations |

## Offline receipts

All commands passed in this checkout. No service, SQL, Redis, Docker, integration suite, CI dispatch or staging/provider action was run.

- `node --check scripts/staging-campaign.mjs`; `git diff --check`.
- `node --test scripts/staging-campaign.test.mjs scripts/staging-control.test.mjs`: 45/45 passed, 0 skipped.
- `pnpm install --offline --frozen-lockfile --ignore-scripts` for local tooling; `pnpm check:agent-docs`.
- `node /tmp/issue901-draft-generated-comparison.mjs`, adapted from the earlier source-capture approach. It evaluates base `4dd1ecfe` and current source in a VM with stubbed `sql`/`uuid`. Identities-v1 and business-v2 SQL and receipts are byte-identical for fresh fixture, existing-fixture retry and reset. In v3 fixture and reset captures, removing exactly the changed table list, the `draftContext` block and the `validatedSteps` additions restores the base text byte for byte. The v3 fixture differs by 10 added and 2 removed lines. Captures are `/tmp/issue901-draft-v3-generated.sql` and `/tmp/issue901-draft-v3-reset-generated.sql`. This is serialization evidence only; no SQL was executed and PL/pgSQL compilation is unproven.

Docs: no external dependency or service contract changed. No owning overview or runbook currently describes v3 draft admission, so no overview edit was needed.

## Unproven runtime risks

- PL/pgSQL compilation and the guard's interaction inside Prisma's draft transaction remain unproven until hosted readback.
- The INSERT membership row-hash check assumes the member row is unchanged within the draft transaction; ordinary authority reads only lock it.
- Later assertions (inventory reads, refusals, suspend/restore audits, exact 68/91/159 and 24/26/50 accounting, lost-response reset) were masked by the RED and are predictions.
- UPDATE relies on the app for actor authorization because the trigger cannot see the actor. The fixture only guarantees same-business, same-creator, live-owner state.

## Handoff

Root runs the unchanged same case on an assembled candidate including this checkpoint. No hosted GREEN is claimed. Stop here.
