# Prelaunch clean reset S2A: database RED, 2026-10-21

Test-only RED checkpoint for #901 under #897, integration PR #904. Base `49acd78a`, branch `agent/issue-901-clean-reset-db-red-20261021`. It follows the [S1 guards](prelaunch-reset-s1-guards-20261021.md) and §6.1 of the [first executable slice](prelaunch-reset-first-executable-slice-20261021.md). The work was offline only: no Docker, CI, live read, credential or staging change.

## Scope

S2A proves only database targeting, inventory, deletion atomicity and retry. It does not cover Redis, objects, reseed, reopen, `cf_` detachment, adapter activation or production. The operator CLI `clean-reset` still stops at `Clean reset executor not implemented`.

## Files

| File | Content |
|---|---|
| `scripts/staging-clean-reset-remote.mjs` | Inert `cleanResetProgram(payload)`. It validates the exact command, payload keys and in-container identity. It ends with `Clean reset refused: target` or `Clean reset executor not implemented`. It makes no SQL or subprocess call. |
| `packages/db/scripts/staging-clean-reset.e2e.spec.ts` | Hosted proof on a migrated Testcontainers PostgreSQL 16 database, using the reserved-fixture psql substitute. |

## Seam proposed by the test (to be reviewed at GREEN)

- **Phases.** The test uses the S1 phases `inventoried` and `rows`. The exact keys are `operation, phase, operationId, reservationId, candidate, identity{projectId, environmentId, services{api, worker}, origins{database}}`. `rows` also takes `expectedInventory`.
- **Inventory receipt.** It has exactly `operation, phase, operationId, state:"observed", digest{retained, disposable}, rows, plan{mode:"RESTRICT", retain, truncate}`.
- **Digest.** It has two sha256 parts. `rows` treats it as a compare-and-swap precondition: an equal current state executes, and a current state with the same retained part and an emptied disposable part replays as `observed`. Anything else refuses as stale. This gives lost-response idempotence without a new storage table.
- **Refusals.** Each refusal is one stderr line: `Clean reset refused: <planner message>`. The cf refusal is `cf namespace <ns> requires separate control disposition`. Activity refuses as `other database backends present` and staleness as `Inventory changed since observation`.

## Expected hosted result

Command: `pnpm test:db`, or `pnpm --filter @auto-tm/db exec vitest run scripts/staging-clean-reset.e2e.spec.ts`.

| Test | Expected now |
|---|---|
| Target, caller-claim and production-env refusals, with 0 queries | pass (stub scope) |
| cf namespace refusal | fail. Received `Clean reset executor not implemented`; the fixture's raw `DELETE` is already rejected by its row trigger |
| Unknown schema/table/trigger, retained→deleted FK, non-empty `blog_posts`, approved center | fail on the first fault (`Unknown schema rogue_schema`) |
| Other backend | fail. Expected `other database backends present` |
| Stale observation | fail. Expected `[0, ""]`, received `[1, "Clean reset executor not implemented"]` |
| Positive deletion, retention literals, lost-response replay | fail at the same inventory assertion |

Infrastructure, import or setup errors are not RED.

## Remaining gates

- Hosted RED, then a separately authorized source GREEN in the remote program only. GREEN still needs the actual pg catalog inventory, `planTables` reuse, a single-transaction `TRUNCATE … RESTRICT`, and the activity and stale checks.
- **Separate S2 work:** control disposition for existing `cf_` namespaces and proof that they are inert to admissions and worker scans (`cf-namespace-inertness-unproven`). Finishing the old v3 graph or its disposal is not a prerequisite.
- Ledger/controller wiring, quiescence adapters, Redis/object deletion, reseed, reopen, the production adapter, the database role's privileges and all live facts remain open.
