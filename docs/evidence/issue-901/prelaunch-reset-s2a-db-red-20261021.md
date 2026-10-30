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

- **Payload.** The test uses the S1 phases `inventoried` and `rows`. The exact keys are `operation, phase, operationId, reservationId, candidate, identity{projectId, environmentId, services{api, worker}, origins{database}}`. `rows` also takes `expectedInventory`. Every identity value must be a strict string, so a number or a one-element array refuses, as in S1. The stub accepts this final shape and still refuses all execution.
- **Receipts.** Inventory and rows receipts both carry `operation, operationId, reservationId, candidate, environmentId, phase, state, digest`. The inventory receipt adds `rows` and `plan{mode:"RESTRICT", retain, truncate}`.
- **Digest.** It has three sha256 parts: `schema` covers public table, column, trigger and FK *definitions*; `retained` covers retained contents; `disposable` covers disposable contents. `rows` treats it as a compare-and-swap precondition. A later row, an added FK between known tables, or a redefined migration-owned trigger each refuses as `Inventory changed since observation`. That holds even though the planner would accept a fresh inventory of the changed state.
- **Replay.** Empty disposable tables alone never certify completion. After a successful deletion, the same original digest refuses with any other `operationId`, `reservationId`, candidate or environment, and changes nothing, including any receipt store. The refusal is either `Inventory changed since observation` or `Clean-reset operation identity changed`. Only the exact operation replays as `observed`, with no table rewrite and no change to any user-schema table.
- **Refusals.** Each refusal is one stderr line: `Clean reset refused: <planner message>`. The cf refusal is `cf namespace <ns> requires separate control disposition`. Activity refuses as `other database backends present`.

## Unresolved durable-store choice (root decision)

GitLedger cannot certify a lost response. The database commit happens before the controller's ledger write, so after a lost response the ledger never learns that the deletion happened. GitLedger remains the authority for phase order (`nextPhase`) and stores the per-phase receipts once a response is received.

**Proposal.** A minimal transactional operator receipt, written in the same transaction as the deletion:
- **Location.** One fixed non-migration schema `staging_clean_reset` with one table `receipts`. It has primary key `operation_id` and the columns `reservation_id, candidate, project_id, environment_id, phase='rows', expected jsonb, result jsonb, committed_at`.
- **Writes and replay.** Exactly one row is inserted per completed `rows` operation. Replay requires an exact match on every column. A different identity against an existing receipt refuses.
- **Scope.** It is not a historical journal. The receipt is deleted at the later `reopened` phase after the ledger records it. The `schema` digest and the S1 planner allowlist this one schema and nothing else.

**Alternative.** A Prisma-migration-owned table. It would make the receipt application schema and needs an ADR.

The tests stay agnostic about the store. They allow at most one new non-`cf_` namespace after deletion.

## Expected hosted result

Command: `pnpm test:db`, or `pnpm --filter @auto-tm/db exec vitest run scripts/staging-clean-reset.e2e.spec.ts`.

| Test | Expected now |
|---|---|
| Target, caller-claim, production-env and strict-string refusals, with 0 queries | pass (stub scope) |
| cf namespace refusal | fail. Received `Clean reset executor not implemented`; the fixture's raw `DELETE` is already rejected by its row trigger |
| Unknown schema/table/trigger, retained→deleted FK, non-empty `blog_posts`, approved center | fail on the first fault (`Unknown schema rogue_schema`) |
| Other backend | fail. Expected `other database backends present` |
| Stale row/FK/trigger | fail at the first inventory: expected `code: 0`, received `1` |
| Positive deletion, retention literals, identity-mismatch refusals, exact replay | fail at the first inventory: expected `[0, ""]`, received `[1, "Clean reset executor not implemented"]` |

Infrastructure, import or setup errors are not RED.

## Remaining gates

- Hosted RED, then a separately authorized source GREEN in the remote program only. GREEN still needs the actual pg catalog inventory, `planTables` reuse, a single-transaction `TRUNCATE … RESTRICT`, and the activity and stale checks.
- **Separate S2 work:** control disposition for existing `cf_` namespaces and proof that they are inert to admissions and worker scans (`cf-namespace-inertness-unproven`). Finishing the old v3 graph or its disposal is not a prerequisite.
- Ledger/controller wiring, quiescence adapters, Redis/object deletion, reseed, reopen, the production adapter, the database role's privileges and all live facts remain open.
