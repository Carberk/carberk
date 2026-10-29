# Reset row admission: source anchor guard checkpoint

Sole reset-row writer, 2026-10-29. Work-in-progress Candidate A checkpoint; it claims no A completion, acceptance or merge. Base is parent `25f80afcc38ecaf2ce370593afacc3d80a8bd999`. The verified reset checkpoint was cherry-picked cleanly: `aba580d8` became `1976863f8d5ace0300d30fb110d36e2755205d21` and `0d943fb89292638ed4169724e84ae5a49defbabe` became `7a172ea74d5ad191657f1006fae5a99fca8ab49f`, with every carried path byte-identical to `0d943fb8`. Source commit `e8987ce02ca8b75b04d2fbf4b9c9f717d38df7e6`, tree `ae908d3eb1a052c2f632e91f5f2e1c16e11415f2`. Hashes are in [the source manifest](reset-row-anchor-20261029/source-sha256.json) and [the log manifest](reset-row-anchor-20261029/log-manifest.json).

## Change

The [accepted row contract](operational-row-contract-review-r1-20261029.md) requires exact sealed-OLD DELETE admission ahead of the parent checks of five owning guards. This checkpoint adds only the one directly reached next: `diagnostic_source_anchor_guard`, in the reserved unpublished additive migration `20261029190000_operational_reset_row_admission`.

The DELETE-only branch precedes the guard's source-receipt and parent checks. It returns OLD only when `current_user` owns `staging_clean_reset_rows` and `allows_old` finds that exact full OLD tuple sealed by this backend's held, unfinished admission in this full transaction. Without an admission it falls through to the unchanged ordinary branches. Under an admission, a different OLD raises `operational_reset_old_tuple_changed`. INSERT and UPDATE are untouched. The rest of the body is byte-identical to `20261024050000` lines 33–76; the diff is exactly the three inserted lines. The certification block still runs after every guard change, so the certified graph includes the new definition.

No historical migration, grant, role, SECURITY DEFINER, trigger disablement, cap, CASCADE, TRUNCATE or generic wipe is added. Sealed OLD tuples remain only in the `ON COMMIT DROP` temporary table; the admission and completion records store no row content. The avatar-cycle refusal is unchanged.

Before editing, a disposable migrated PostgreSQL 16 inspection database showed that the live guard `prosrc` equals the `20261024050000` body. On `diagnostic_source_anchors`, that guard is the only enabled DELETE trigger, `zz_diagnostic_source_purge` is disabled, and the only FK is `orderId` to `inspection_orders` ON DELETE CASCADE. Deleting a raw record UPDATEs an anchor whose `firstRecordId` refers to it through `diagnostic_source_transition`, which is why the fixed order deletes anchors first.

## RED and GREEN

All runs use real PostgreSQL and the real enabled guards; nothing is stubbed. Commands and raw-log digests are in the log manifest.

- **Base RED, rebased checkpoint `7a172ea7`:** the functional executor spec passes 6 of 7. The representative admitted DELETE fails at spec line 403. The complete-state equality at line 400 passes first. The public failure is `Clean reset refused: database operation failed`, and the private envelope is `SQLSTATE=P0001 refusal=diagnostic_source_anchor_receipt routine=exec_stmt_raise stack=diagnostic_source_anchor_guard>staging_clean_reset_rows.dispose`. This reproduces `0d943fb8` on the new base. [Receipt](reset-row-anchor-20261029/functional-base-red.txt).
- **Focused RED, tests first with the migration unchanged:** 2 failed and 10 passed. The admitted anchor DELETE and the post-admission tuple-change cases both fail with `diagnostic_source_anchor_receipt` from the actual guard. [Receipt](reset-row-anchor-20261029/focused-anchor-red.txt).
- **Focused GREEN:** 12/12. The admitted full-OLD anchor DELETE succeeds before its parent order. Ordinary, forged-GUC and non-operator DELETEs still get the original `diagnostic_source_anchor_receipt`; the non-operator case runs inside the same admitted backend and transaction. Admitted INSERT and UPDATE are still refused. A tuple changed after sealing raises `operational_reset_old_tuple_changed`. Fixture arrangement inserts the anchor with replication-role triggers off inside the rolled-back test transaction, then re-enables them before admission. [Receipt](reset-row-anchor-20261029/focused-anchor-green.txt).
- **Functional proof, next genuine refusal:** the spec again passes 6 of 7, including the unchanged avatar-cycle refusal at `staging_clean_reset_rows.prepare`. The representative admitted DELETE now gets through the fixed order's proofs, report evidence and PDF, reports, requests and anchors, then fails at `diagnostic_ownership_components`. The complete-state equality at line 400 passes before line 403 fails. The public failure stays sanitized, and the private envelope is `SQLSTATE=P0001 refusal=diagnostic_ownership_immutable routine=exec_stmt_raise stack=diagnostic_ownership_guard>staging_clean_reset_rows.dispose`. The whole transaction rolls back. [Receipt](reset-row-anchor-20261029/functional-next-refusal.txt).

## Next refusal, not replaced

`diagnostic_ownership_guard` is defined only in `20261023090000_diagnostic_ownership_components` and never redefined. Its DELETE branch raises `diagnostic_ownership_immutable` while the referenced raw record exists. The fixed order must delete components before raw records, because `component.identityRecordId` is a CASCADE child. The accepted contract lists this guard among the five that receive the same branch. This checkpoint stops here, as dispatched. The next lawful step is the same DELETE-only, sealed-OLD, operator-bound branch ahead of its raw-existence check, done RED-first, followed by the functional proof again.

## Preservation

- **Ordinary anchor branches.** `packages/db/tests/diagnostic-source-kernel.e2e.spec.ts` owns the anchor guard's ordinary behavior. It fails 62, 64 and 56 of 216 on parent, checkpoint and this source. The failures are nondeterministic and pre-exist on the parent, so the suite is not a clean signal on this host. Wall-clock fixture timestamps whose milliseconds end in 0 compare as `17.780` against `17.78`, so a varying subset fails each run. About 41–42 further failures recur on the parent too (for example a missing `updatedAt` column, `users_email_verified_check`, `measurement_principal_shape`, `diagnostic_report_valid` and `campaign_preparation_unfinished`). Those are an existing repository gap outside reset ownership.
  - No non-flake failure is exclusive to this source; all 11 exclusive failures are the timestamp flake.
  - All 9 anchor-focused ordinary tests pass on this source: immutable regression refusal, erasure, first-slot claim, sticky ABA, forged INSERT refusal, unsealed-anchor commit refusal and direct-DELETE final effects. Their base-side failures are the same flake.
  - [Comparison](reset-row-anchor-20261029/source-kernel-comparison.json).
- **Admitted Redis path.** The Redis recovery and interrupted specs pass 8/8 through the admitted rows path on this source. [Receipt](reset-row-anchor-20261029/redis-admitted-path.txt).
- **Reset units.** Planner, executor and transport node tests pass 45/45. [Receipt](reset-row-anchor-20261029/node-reset-units.txt).
- **Static checks.** ESLint on the changed spec, the `@auto-tm/db` typecheck and `git diff --check` are clean.
- **Setup.** Setup was limited to a frozen-lockfile install, the contracts build, Prisma generate and the DB build, with an inert `DATABASE_URL`; none changed tracked files.
- **Not run.** API diagnostic e2e specs, broad CI and hosted checks were not run.

Only local disposable containers were used. There were no staging, provider or production services, reservations, deployments, credential reads or shared resets.

## Remaining gates

- **Remaining owning guards.** `diagnostic_ownership_guard` is next, then the evidence and provenance guards. After those, enabled source statement, row, purge and enquiry guards and campaign-preparation DELETE admission, each only as actually reached. Mutual `users.suspendedById`, Listing/video and avatar cycles must be proved or refused.
- **Campaign transition.** The supported obsolete campaign transition and its owning readers still need a parent ownership decision. cf namespaces still refuse at inventory.
- **Minimum GREEN.** The contract's whole set is still required:
  - exact disposal with retained and schema equality;
  - wrong or missing principal and every binding field;
  - forged GUC or JSON;
  - stale, extra or protected tuples;
  - active receipt or backend;
  - unsupported graph;
  - halfway rollback;
  - COMMIT without finish through the executor;
  - killed transaction;
  - lost commit reply;
  - write-free completed replay.
- **Separate reset-owner proofs.** The `packages/db/CONTEXT.md` update for the finished store, provider exclusion, grant lifetime and clock authority, storage drain and restoration all remain.
- **Parent-owned.** Standards and Spec review, applicable CI and staging acceptance.
