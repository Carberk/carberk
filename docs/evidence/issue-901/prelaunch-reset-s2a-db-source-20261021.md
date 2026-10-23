# Prelaunch clean reset S2A: database source, 2026-10-21

This is an unreviewed source checkpoint for #901 under #897, integration PR #904, on base `7e077fab`. It answers the [S2A database RED](prelaunch-reset-s2a-db-red-20261021.md). The authoritative hosted RED is DB job 119216069794 in run 39598277540; its raw log has sha256 `24f4ee7d…09d94a0b`. In that run, five S2A tests failed at `Clean reset executor not implemented` and the strict-target test passed. The only source file changed is `scripts/staging-clean-reset-remote.mjs`. The tests, the S1 module, the manifest and the CLI are unchanged, and the operator CLI is still default closed.

## Implementation

- **Planner reuse.** `cleanResetProgram` embeds the actual S1 module text and `staging-clean-reset.tables.json` in the fixed remote program. It removes only the `export` keywords. The module must stay import-free, or loading refuses. The remote program calls the real `planTables`. Its retained list is checked against the plan before use.
- **Target checks.** The target and caller-claim checks are byte-identical to the stub. They refuse with `Clean reset refused: target` before any psql call.
- **Database access.** psql is called with fixed arguments. Credentials are passed only through the child's `PG*` environment. psql stderr is never forwarded, and every failure prints one sanitized line.
- **Read-only inventory.** The inventory is one `REPEATABLE READ READ ONLY` snapshot of the PostgreSQL catalog and contents. It refuses, in this order, when:
  - another client backend is on the same database;
  - an event trigger exists;
  - the operator schema is present but does not exactly match its fixed definition;
  - any `cf_` namespace exists, with `cf namespace <ns> requires separate control disposition`;
  - the public schema has a non-table relation other than an index or sequence;
  - the planner refuses.
- **Digest.** `schema` is the SHA-256 of every catalog definition outside the operator schema: namespaces, relations, columns, constraints, indexes, triggers, functions, types, enums, rules, policies, event triggers and extensions. `retained` and `disposable` hash per-table row counts and ordered row content. SQL computes all three parts, so the in-lock recheck uses the same formula.
- **`rows` phase.** A receipt for the operation means replay. Otherwise the observed digest must equal `expectedInventory`, or the phase refuses with `Inventory changed since observation`. One `READ COMMITTED` transaction then:
  1. takes `ACCESS EXCLUSIVE` locks on every public table;
  2. re-checks backends and the full digest under the locks, with a bounded 5 s wait for the just-closed observation backend;
  3. creates the operator store if it is absent and verifies its exact definition;
  4. runs `TRUNCATE` on exactly the planned disposable list with `RESTRICT`;
  5. verifies that the `schema` and `retained` parts are unchanged and every disposable table is empty;
  6. inserts the receipt.

  Any deviation rolls back or commits nothing.
- **Operator store.** It is the root-approved fixed schema `staging_clean_reset` with one table, `receipts`. The table's primary key is `operation_id`. It records `reservation_id, candidate, project_id, environment_id, phase='rows', expected, result, committed_at`. It must be owned by the reset role, with no ACL, no default, no extra object and no NOT NULL gap. The receipt is excluded from all digests. It exists only to recover the current operation after a lost response. It is not a Prisma model or migration. Removing it at `reopened` is separately gated.
- **Replay.** Replay is read-only. It requires an exact receipt match on operation, reservation, candidate, project, environment, phase and expected digest. The current three-part digest must also equal the recorded result. Empty disposable tables alone never certify completion. If any identity field differs, it refuses with `Clean-reset operation identity changed`. If the post-state changed, it refuses with `Inventory changed since observation`.

## Offline checks

| Check | Result |
|---|---|
| `node --check` | passes |
| vm harness with mocked psql | Target refusals make 0 queries. The inventory, completion and cf-refusal paths produce the expected receipts and messages. The generated SQL was inspected. |
| `node --test scripts/staging-clean-reset.test.mjs` | 20/20 |
| `vitest list` | collects all 6 e2e tests |
| `prisma generate` with an offline placeholder URL | succeeds |
| db `tsc` | Only 5 pre-existing errors for the unbuilt `@auto-tm/contracts`; none involve these files. |
| `pnpm check:agent-docs`, `git diff --check` | pass |

No Docker, local PostgreSQL, CI dispatch, live read or credential was used. The SQL has therefore not been executed anywhere yet.

## Expected hosted result and open cases

The expected result is a GREEN run of the same six tests in `packages/db/scripts/staging-clean-reset.e2e.spec.ts` with `pnpm test:db`. The highest-risk prediction is the exact operator-definition text, for example `format_type` and `pg_get_constraintdef`. If it is wrong, the first `rows` attempt rolls back with a sanitized `database operation failed` and changes nothing.

These cases remain unproved:
- psql and privileges in the Railway API container;
- Railway's default privileges, extensions or event triggers;
- PostgreSQL versions other than 16;
- the lock-wait and statement-timeout behavior at staging size;
- `cf_` control disposition;
- ledger, controller and CLI activation, and quiescence adapters;
- Redis, objects, reseed and reopen, including receipt removal;
- production.
