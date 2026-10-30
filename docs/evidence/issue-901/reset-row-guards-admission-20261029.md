# Reset row admission: remaining owning diagnostic guards checkpoint

Sole reset-row writer, 2026-10-29. Work-in-progress Candidate A checkpoint; it claims no A completion, acceptance or merge. Base is the exact assembled parent `fc77bc55cd83fdaa502aba236697d4b3c5260659`, which already carries the anchor checkpoint (child `a20c7da4`, assembled as `e4c4d45b` with source `c0bb885b`); that work is not repeated here. Source commit `4ed39fc229ff1714fdb2416ab43085b6e56a98e2`, tree `02108d2a04d31c8c087884a438dc2e630b08b9b9`. Hashes are in [the source manifest](reset-row-guards-20261029/source-sha256.json) and [the log manifest](reset-row-guards-20261029/log-manifest.json).

## Change

Only the reserved unpublished migration `20261029190000_operational_reset_row_admission` and `packages/db/tests/operational-reset-rows.e2e.spec.ts` changed. Each guard below received the anchor's three-line DELETE-only branch only after the serialized executor actually refused at it and its focused tests were RED. They are listed in the order reached:

| Guard | Sole historical definition | Ordinary DELETE check kept after the branch |
|---|---|---|
| `diagnostic_ownership_guard` | `20261023090000` lines 67–109 | raw record exists → `diagnostic_ownership_immutable` |
| `diagnostic_identity_evidence_guard` | `20261021130000` lines 148–179 | order exists → `diagnostic_identity_evidence_immutable` |
| `diagnostic_identity_provenance_guard` | `20261021130000` lines 118–141 | order exists → `diagnostic_identity_provenance_immutable` |
| `diagnostic_ownership_grant_guard` | `20261023120000` lines 42–58 | order exists → `diagnostic_ownership_grant_immutable` |

The branch returns OLD only when `current_user` owns `staging_clean_reset_rows` and `allows_old` finds that exact full OLD tuple sealed by this backend's held, unfinished admission in this full transaction. Without an admission it falls through to the unchanged ordinary branch. Under an admission, a different OLD raises `operational_reset_old_tuple_changed`. INSERT, UPDATE and parent-absent DELETE branches are untouched.

Each replacement keeps its historical header: plain `LANGUAGE plpgsql`, volatile, no `search_path`, not SECURITY DEFINER. Each body is its historical body plus exactly the three lines. All four definitions precede the certification block, so the certified graph includes them.

**Contract note for Spec review.** The [accepted row contract](operational-row-contract-review-r1-20261029.md) names five guards for this branch and omits the grant guard. The grant guard has the same order-existence DELETE check, and `diagnostic_ownership_grants.orderId` is an `ON DELETE CASCADE` child of the order. This dispatch named the grant guard explicitly, and it was the executor's actual next refusal. It received the identical branch and nothing else.

No historical migration, grant, role, SECURITY DEFINER, cap, CASCADE, TRUNCATE or generic wipe was added, and no trigger was enabled or disabled. The `zz_diagnostic_source_*` and `zzzz_campaign_preparation` triggers remain disabled and were not exercised. Sealed OLD tuples stay only in the `ON COMMIT DROP` temporary table, and the avatar-cycle refusal is unchanged. Executor, planner, table manifest, transport, the functional and Redis specs, registry helpers, worker, staff/admin and source-performance code are byte-identical to the parent.

## RED and GREEN

All runs used real PostgreSQL with every enabled guard live; nothing was stubbed. At each intermediate refusal:

- the functional spec passed 6 of 7, including the avatar-cycle refusal;
- the complete-state equality at spec line 400 passed before line 403 failed, so the whole transaction rolled back;
- the public failure stayed `Clean reset refused: database operation failed`.

Every private envelope below is `SQLSTATE=P0001 … routine=exec_stmt_raise`, with the stack `<guard>>staging_clean_reset_rows.dispose`.

| Step | Focused RED (migration unchanged) | Focused GREEN | Serialized executor afterwards |
|---|---|---|---|
| Base `fc77bc55` | — | — | [refuses](reset-row-guards-20261029/functional-base-red.txt) `diagnostic_ownership_immutable` |
| Ownership | [2 failed, 14 passed](reset-row-guards-20261029/focused-ownership-red.txt), `diagnostic_ownership_guard() line 5` | [16/16](reset-row-guards-20261029/focused-ownership-green.txt) | [refuses](reset-row-guards-20261029/functional-ownership-next.txt) `diagnostic_identity_evidence_immutable` |
| Evidence | [2 failed, 18 passed](reset-row-guards-20261029/focused-evidence-red.txt), `line 5` | [20/20](reset-row-guards-20261029/focused-evidence-green.txt) | [refuses](reset-row-guards-20261029/functional-evidence-next.txt) `diagnostic_identity_provenance_immutable` |
| Provenance | [2 failed, 22 passed](reset-row-guards-20261029/focused-provenance-red.txt), `line 4` | [24/24](reset-row-guards-20261029/focused-provenance-green.txt) | [refuses](reset-row-guards-20261029/functional-provenance-next.txt) `diagnostic_ownership_grant_immutable` |
| Grant | [2 failed, 26 passed](reset-row-guards-20261029/focused-grant-red.txt), `line 4` | [28/28](reset-row-guards-20261029/focused-grant-green.txt) | 7/7 GREEN |

In each focused RED, the two failures were the admitted DELETE and the post-admission tuple change. Both received the guard's original refusal, while the principal, forged-GUC and INSERT/UPDATE preservation tests already passed.

On the final source `4ed39fc2`, [focused](reset-row-guards-20261029/focused-final-green.txt) passes 29/29 on the committed bytes, which adds the ordinary CASCADE test. On the clean commit, the [functional spec](reset-row-guards-20261029/functional-final-green.txt) passes 7/7. The executor verdict is `{"code":0,"failure":""}`.

The representative fixture is now disposed in the fixed order. It contains:

- proofs, report evidence and PDF, reports and their correction, requests and the anchor;
- the ownership component, both identity evidence rows with the correction first, provenance and the raw record;
- the grant, order, template and center;
- Session/device, a `users.suspendedById` chain, User/Listing/favorite and the audit.

The receipt is `completed`, and its schema and retained digests equal the observation. Every disposable table is empty, and retained contents and the migration history are exact. At most one operator namespace is added, and no cf namespace is created. Operation, reservation, candidate and environment mismatches refuse with no file or snapshot change. The lost-response replay is read-only with identical files and snapshot.

## Preservation

- **Focused, per changed guard.** Ordinary, forged-GUC and non-operator DELETEs keep the original refusal; the non-operator case runs inside the same admitted backend and transaction. Admitted INSERT and UPDATE keep their original `binding`/`source`/`immutable` refusals. A tuple changed after sealing raises `operational_reset_old_tuple_changed`. An ordinary, non-admitted order DELETE still cascades through all four parent-absent branches. [The probe](reset-row-guards-20261029/probes.txt) shows the same result on a database migrated from the parent.
- **Mechanical and live equality.** [Catalog receipt](reset-row-guards-20261029/catalog-equality.txt). Two fresh databases were compared: one migrated from the parent before any edit, one from this source.
  - Before editing, each live `prosrc` equalled its historical body.
  - Afterwards, each equals the parent `prosrc` plus the three lines at body line 4 or 5.
  - Of 205 functions, only the four guards and `certified_graph()` differ, with identical attributes.
  - All 359 triggers are identical, including enabled state; 284 public triggers are disabled in both.
  - The certificate holds in both and moved from `e737ec1f…` to `c68a3184…`.
  - Exactly four of the 492 certified graph inputs changed, each only in its function md5; no FK input changed.
- **Not rerun.** The broad `diagnostic-source-kernel` suite is classified as nondeterministic on the parent in the [anchor receipt](reset-row-anchor-admission-20261029.md), so focused proofs and body equality replace it, as dispatched.
- **Redis and units.** The Redis recovery and interrupted specs pass [8/8](reset-row-guards-20261029/redis-admitted-path.txt) through the admitted rows path on the commit. Planner, executor and transport node tests pass [45/45](reset-row-guards-20261029/node-reset-units.txt).
- **Static checks.** ESLint on the changed spec, the `@auto-tm/db` typecheck and `git diff --check` are clean.
- **Not run.** API diagnostic e2e, broad CI and hosted checks.
- **Setup and resources.** Setup was limited to a frozen-lockfile install, the contracts build, Prisma generate and the DB build, with an inert `DATABASE_URL`. Only fresh local Testcontainers and one loopback-bound inspection container owned by this writer were used. There were no staging, provider, production or shared resources, credentials, reservations or deployments.

## Smallest remaining contract proof

1. **Campaign obsolete-cf transition.** This was not reached: the cf fixture still refuses at inventory (`staging-clean-reset-remote.mjs:285`), unchanged. It needs the parent ownership decision and campaign-owner transition from the contract. No authority was inferred here.
2. **Pre-effect cycle refusal.** The certification excludes every two-table cycle except the refused avatar cycle, but not cycles within a self-reference. [The probe](reset-row-guards-20261029/probes.txt) shows `prepare` admitting a mutual `users.suspendedById` pair. `dispose` then raises `operational_reset_dispose_incomplete:users` at `dispose()` line 19, after earlier tables in the fixed order were already deleted; the transaction rolls back. The contract asks for refusal before effects.
   - Bounded proposal, RED-first: a `prepare`-time refusal beside the avatar check for a cycle in any certified self-reference (`users.suspendedById`, `diagnostic_reports.predecessorId`, `diagnostic_identity_evidence.supersedesId`).
3. **Executor negatives still without tests.** Several are now that the representative fixture is GREEN:
   - the unsupported graph refusal (`operational_reset_unsupported_graph`);
   - halfway-failure rollback as a persistent regression;
   - COMMIT without finish through the executor;
   - a killed transaction;
   - expiry (`operational_reset_transaction_expired`);
   - `operational_reset_retained_changed` and `operational_reset_unadmitted`.
4. **Separate reset-owner proofs.** The `packages/db/CONTEXT.md` update for the finished store, provider exclusion, grant lifetime and clock authority, storage drain and restoration.
5. **Parent-owned.** Standards and Spec review, including the grant-guard contract note above, applicable CI and staging acceptance.
