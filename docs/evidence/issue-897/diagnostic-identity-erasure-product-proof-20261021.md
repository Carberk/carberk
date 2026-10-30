# Diagnostic identity erasure product test checkpoint

Bounded test-writer slice for #914 within #897, sole integration PR #904. Base `d124d8c4f857dbc228c77a24817763d39d9c5044`. Reservation `agent/issue-914-identity-erasure-http-20261021` was pushed at that base before edits. The host-created worktree and unchanged scaffold branch `t3/issue-914-identity-erasure-http` were reused. No issue PR or GitHub content was created.

[DiagnosticIdentityErasure.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts) adds executable assertions for product deletion correctness under [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md) and [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md). It covers the existing raw identity records described in the [history source checkpoint](diagnostic-identity-history-source-20261021.md). The additive report-pin extension below covers the implemented raw comparison contract. Continuity-proof erasure, consumed-link survival, object-storage/PDF cleanup execution and prelaunch historical-data preservation remain outside this slice.

## Product journey and observable assertions

The real Nest DiagnosticsModule includes IdentityModule, real Prisma repositories and current business/staff authority. Fixture writes create only suite-owned users, live sessions, staff grants, qualifications and a center. Templates, three buyer-private orders, assignments, physical authorization, confirmed/arrived appointments and two observations per order are created through existing HTTP endpoints. No report, identity or proof rows are seeded or edited through Prisma. Two reports are authored and released through HTTP as described below. Scoped report/PDF deletion and order deletion are teardown only; order deletion cascades its identity records. The ordinary synthetic fixture admission boundary follows the existing history suite.

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

## Original raw-history offline verification

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

Docs: no external lookup needed. Existing repository HTTP tests, deletion source, worker implementation and the established subprocess pattern define the interfaces used. At the original raw-history checkpoint, source/schema/contracts/other tests/helpers/timeouts remained unchanged.

## Additive report-pin and known-erased pair coverage, 2026-10-21

Sole test writer resumed the clean host worktree at supplied base `9a5ae6d7bb8a59224c715442ad5910375d63c50c`, tree `96dd28062a618e186701c7e134821414481e9656`. The existing attempt was a pushed raw-history deletion test with no report fixtures. Reserved and pushed `agent/issue-914-report-pin-erased-pair-http-20261021` before editing; scaffold `t3/report-pin-erased-pair-http-tests` remains unchanged at the base. Only this evidence note and the existing erasure spec change. Root retains assembly and execution-state ownership. No issue PR, integration push or nested agent was used.

The extension reuses the same Nest composition, purge subprocess, actors and three visits. It preserves every original raw-history, commissioner-erasure, recorder-detachment, control-order and isolation assertion. A is the buyer's visit, B is the other commissioner's visit and C is the independently recorded control visit. The technician creates A and B reports through ordinary HTTP create/findings/submit/finalize. The reviewer is independently assigned and qualified on all three visits and is never deleted. No proof is created, and comparison does not create a reinspection link.

| Added oracle | Executable assertion | Runtime status |
|---|---|---|
| Released A pins retained identity | Real private B/A comparison returns exactly A's second history record id, hash and observation, report version 3 and a 64-character snapshot hash; candidate B matches its own retained history and order version. The reverse A/B comparison also succeeds before erasure. Both responses are private/no-store. | Not run |
| Real commissioner purge clears report linkage | After HTTP DELETE schedules the buyer and the production purge runs at the stored due date, restricted database readback requires null report pin id/hash, null current author/reviewer/reason linkage and the exact erasure timestamp. All actors' ordinary A report reads refuse. No pre-purge report database read is used. | Not run |
| Known-erased predecessor and candidate deny identically | The surviving reviewer's B/A request uses the actual erased report A. Its A/B request uses the actual erased order A. Each must return the exact generic 403 body, identical to unknown-report and unknown-order requests, with private/no-store. Both directions are checked after each purge. | Not run |
| Another commissioner's report survives recorder deletion | C/B comparison and B's staff/commissioner report reads remain exact after buyer purge. After the technician's own DELETE and production purge, C/B still returns the exact identity pins, observations, candidate version and snapshot hash. Only predecessor report version advances from 3 to 4. Staff report equality permits only null author and version 4; commissioner equality permits only version 4. Deleted technician report/comparison reads refuse. The original history equality separately proves recorder detachment. | Not run |
| Restricted material stays private | Draft, ordinary released staff/commissioner responses and their report lists contain no pin fields, identity row ids/hashes, snapshot hash or raw manual references. Both buyer-private reports return public 404 without identity material. Surviving post-purge ordinary responses receive the same disclosure checks. | Not run |
| Exact teardown | Only the two deterministic suite-owned report ids select PDF leaves and reports, in that FK order, before the existing scoped audit/assignment/order/template teardown. No evidence uploads or report lineage are created. No global cleanup is added. | Not run |

This is new coverage against source `9ad997d0`, not an invented RED. The earlier genuine missing-comparison 404 RED belongs to the unchanged report-binding suite and is recorded in the [source checkpoint](diagnostic-report-identity-pin-source-20261021.md). That suite and the separate future structured-evidence suite remain unchanged. This extension has no observed HTTP/database result; hosted GREEN remains pending root's combined disposable-service run.

The first offline compiler pass identified a widened string type in the new actor loop; an `as const` tuple fixes it. Final offline checks for this extension are recorded below. No local services, Docker, SQL runtime, CI dispatch/wait/poll, Railway, credential inspection, deployment or reset was used. The existing foreign-due-account and stale-OTP refusal guards are unchanged. An isolation refusal must be reported rather than bypassed.

The current authorized interface exposes the retained report's immutable snapshot hash through private comparison, so survival is asserted there and through complete ordinary DTO equality with the explicit attribution/version changes. Erased A has no authorized report/comparison read, so only mandatory post-purge clearing uses a new direct database read. Actual PDF rendering/storage deletion, future structured identity/proof erasure and consumed-link behavior remain untested here.

Docs: not applicable. Internal-only test coverage uses existing repository HTTP, purge and teardown interfaces; no dependency or runtime boundary changes.


Final offline checks for the extension passed:

- `pnpm --filter @auto-tm/contracts build`.
- `DATABASE_URL=postgresql://127.0.0.1:1/typecheck_only pnpm --filter @auto-tm/db build`, including Prisma generation without a database connection.
- `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit`.
- `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts --max-warnings 0`.
- `pnpm check:agent-docs`, `pnpm check:glossary` and `git diff --check`.

The complete two-file diff was inspected. Both compilers passed after the tuple fix. No broad unit/root/build-all gate was repeated; root owns combined verification of the unchanged source and hosted runtime. The owned worktree and pushed reservation/checkpoint branch are retained for root's assembly and later lifecycle cleanup; the scaffold remains at the supplied base.
