# Diagnostic identity erasure product test checkpoint

Bounded test-writer slice for #914 within #897, sole integration PR #904. Base `d124d8c4f857dbc228c77a24817763d39d9c5044`. Reservation `agent/issue-914-identity-erasure-http-20261021` was pushed at that base before edits. The host-created worktree and unchanged scaffold branch `t3/issue-914-identity-erasure-http` were reused. No issue PR or GitHub content was created.

[DiagnosticIdentityErasure.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts) adds executable assertions for product deletion correctness under [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md) and [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md). It covers the existing raw identity records described in the [history source checkpoint](diagnostic-identity-history-source-20261021.md). It requires no future proof/comparison fields. This is separate from continuity-proof erasure, consumed-link survival, report/PDF erasure and prelaunch historical-data preservation.

## Product journey and observable assertions

The real Nest DiagnosticsModule includes IdentityModule, real Prisma repositories and current business/staff authority. Fixture writes create only suite-owned users, live sessions, staff grants, qualifications and a center. Templates, three buyer-private orders, assignments, physical authorization, confirmed/arrived appointments and two observations per order are created through existing HTTP endpoints. No report, identity or proof rows are seeded or edited through Prisma. Scoped order deletion is teardown only, cascading its identity records. The ordinary synthetic fixture admission boundary follows the existing history suite.

Only the time boundary and synthetic admission are controlled. Vitest fakes Date, leaving real timers active, at `2026-10-18T00:00:00.000Z`. `DELETE /api/v1/me` invokes the actual account-deletion use case. The test asserts HTTP 204, a stored due date of `2026-11-17T00:00:00.000Z`, zero remaining sessions and immediate diagnostic order/history denial. It never sets `deletionScheduledAt` or `erasedAt` itself.

The actual [PurgeExpiredAccounts](../../../apps/worker/src/jobs/PurgeExpiredAccounts.ts) executes at the stored due date in a single Node process using `--import tsx`, inherited worker database configuration, a 30-second SIGKILL bound and a finally-disconnected Prisma client. This follows the production subprocess pattern in CampaignFullV3, rather than introducing a generic purge runner. A successful process requires exactly one purged account. Raw user readback must show `phone: null` and `deletionScheduledAt: null`.

| Criterion | Executable assertion | Runtime status |
|---|---|---|
| Commissioner restricted content erased | Both retained identity rows have `observation: null`, `observationHash: null`, `recordedById: null` and the exact purge `erasedAt`. Their ids, order ids, versions and recording times stay unchanged. | Not run |
| Commissioner intake linkage erased | Order commissioner, observation, both authorizations, listing, listing digest and association timestamp are null; erasure timestamp equals the due date; zero order assignments remain. | Not run |
| Uniform protected reads | Every suite actor receives the same literal 403 diagnostic refusal for the erased order/history and a missing order/history. | Not run |
| Deleted staff loses current access | Identical signed identity/session claims lose order/history access immediately after deletion HTTP and after purge. Sessions, center/order assignments and active grants are absent. | Not run |
| Another commissioner's identity survives staff deletion | Full raw-row equality changes only `recordedById` to null. Authorized history changes only `recordedBy` to null. Observation JSON, hash, record ids, versions, timestamps and null erasure state remain exact. Commissioner order HTTP still returns 200. | Not run |
| No cross-account diagnostic damage | Another commissioner's order and user remain byte-for-byte equal as Prisma values. A third commissioner's control order, user and both identity rows remain equal after each purge; its independently attributed history remains equal through HTTP and its commissioner can still read the order. | Not run |

## Isolation boundary and limits

The API harness gives each Vitest worker its own disposable PostgreSQL database, with spec files on that worker running sequentially. Its subprocess inherits that worker's DATABASE_URL. The worker job itself has no account-id filter and also deletes OTP requests older than 30 days. Before invoking it, the subprocess reads its real global selection and refuses unless exactly the HTTP-scheduled target is due. It also refuses if any expired OTP row belongs outside that target's purge scope. These checks do not filter or replace worker behavior and do not clean unrelated candidates. A refusal is an isolation prerequisite failure to report, not permission to manufacture erasure or broaden cleanup. This test requires the ordinary isolated API test database; it is not safe for a live shared service database.

No HTTP/database runtime, local services, Docker, Railway or credential inspection, CI dispatch/polling, external writes beyond the authorized branch pushes, nested agents or user questions were used. Hosted execution belongs to root's next useful source batch. Neither RED nor GREEN is claimed here. Existing hosted history evidence does not establish this new deletion journey.

## Offline verification

All listed checks passed without a database connection:

- `pnpm install --offline --frozen-lockfile --ignore-scripts`, all packages reused from the local store, zero downloads.
- `DATABASE_URL=postgresql://127.0.0.1:1/typecheck_only pnpm --filter @auto-tm/contracts build`.
- `DATABASE_URL=postgresql://127.0.0.1:1/typecheck_only pnpm --filter @auto-tm/db build`, including Prisma client generation.
- `pnpm --filter @auto-tm/api typecheck`, TypeScript 7.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, TypeScript 6.
- `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts --max-warnings 0`.
- `pnpm check:agent-docs` and `pnpm check:glossary`.
- `git diff --cached --check` and inspection of the complete two-file diff.

Runtime acceptance remains unverified. Root can run `pnpm --filter @auto-tm/api test src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts` in the next hosted disposable-service batch. No test-run result is inferred from typecheck or lint.

Docs: no external lookup needed. Existing repository HTTP tests, deletion source, worker implementation and the established subprocess pattern define the interfaces used. Source/schema/contracts/existing tests/helpers/timeouts remain unchanged.
