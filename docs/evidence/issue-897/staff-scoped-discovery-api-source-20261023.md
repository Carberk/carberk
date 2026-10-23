# Staff-scoped discovery API source receipt, 2026-10-23

This checkpoint implements the first source slice of #923 on `agent/issue-923-scoped-discovery-api-20261023`. It is a prerequisite slice, not the full continuity prerequisite and not a visual delivery.

| Reader and scope | Allowed fields | Authority checked |
|---|---|---|
| Qualified independent reviewer, current B order | `reportId`, `observedAt`, `mileageKm`, opaque continuation metadata | Current B Session, business admission, reviewer assignment and center qualification; each retained A candidate is rechecked with the existing pair authority, current assignment, retained identity graph, evidence rights, erasure and report state |
| Qualified independent reviewer, current B order | B-assigned technician `userId`, Identity-owned display `name` | Current B reviewer authority; Identity current User/session/grant facts; B order assignment and center qualification are rechecked before return; caller identity is excluded |

`GET /api/v1/diagnostics/orders/:id/predecessor-candidates` traverses a stable bounded scan with an authenticated opaque continuation bound to actor, Session, B and query. It returns at most 20 minimal candidates and an explicit `exhausted` value for that scoped scan. It does not expose counts, hidden IDs, customer data, evidence, hashes, provenance, reviewer notes or pair details. Inaccessible, erased, expired or incomplete retained graphs are omitted. No client decides continuity or selects a retained root.

`GET /api/v1/diagnostics/orders/:id/linking-technicians` returns only currently eligible technicians assigned to B. Identity supplies names through `StaffBindingPort.eligibleNames`; diagnostics supplies the B assignment and qualification boundary. Reception capability and a general staff directory are not required or exposed.

The controller sets `Cache-Control: no-store, private` before validation and maps current authority failures to the ordinary diagnostic refusal. Continuations reject foreign B, actor, Session or query use. Later proof issuance, consumption, lost-reply recovery, B handoff projection, admin proxy, identity-history transport and acceptance remain #923 milestones.

## Evidence

- RED checkpoint `5ce29b2f`: `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts`; all eight HTTP behaviors reached the controller and returned 404 because the routes did not exist.
- GREEN: the same test command, 8 tests passed. It covers >50 traversal, stable continuation, empty/omission semantics, wrong B, foreign/invalid cursor, stale Session, assignment/qualification loss, erasure, non-reception reviewer technician names and foreign technician exclusion.
- `pnpm --filter @auto-tm/contracts build`: pass.
- `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder pnpm --filter @auto-tm/db build`: pass.
- `pnpm --filter @auto-tm/api typecheck`: pass.
- `pnpm --filter @auto-tm/api lint`: pass.
- `pnpm check:runtime-imports`: pass.
- The existing disposable service-backed automatic proof suite has an added discovery journey with real HTTP/SQL assertions. Hosted HTTP/SQL execution is UNKNOWN here because local services and CI are out of scope for this writer.

No schema migration, proof mutation, handoff projection, admin file proxy, mobile work, deployment or staging operation was performed. Existing automatic `201` assertions and privacy/security tests were preserved. The measurement diagnostic checkpoint remains unassembled and untouched.

Repository-wide `pnpm test:unit` and `pnpm typecheck` were attempted. They are blocked by the normal workspace environment: the DB build requires `DATABASE_URL`, and unrelated Admin packages lack installed Next/testing dependencies. The focused API, contracts and DB checks above pass with the configured localhost placeholder; no services were started.
