# R4 material adapter checkpoint

This is a bounded source checkpoint for #897 / PR904. It is based on the entire accepted R3 commit `f375cb4ae6c363e5a724d92ecc7c9f4af5cc5520`, tree `a08b352c271b3b8543b836e1775edf4584676b1e`. The branch is `t3/897-r4-adapters`, isolated at `/tmp/carberk-897-r4-adapters`. The final exact head/tree and file hashes are in `/tmp/897-r4-material-20261025-handoff.md`.

G0 remains accepted. G1 requires parent assembly, exact candidate review and permitted runtime evidence. Guards remain dormant and automatic admission remains CLOSED. This checkpoint changes no activation settings.

## Owned paths

- `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts`
- `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticEvidence.ts`
- `apps/api/src/modules/diagnostics/domain/ports/DiagnosticIdentityEvidencePort.ts`, comments only
- `apps/api/src/modules/diagnostics/domain/ports/DiagnosticEvidencePort.ts`, comments only
- `apps/api/src/modules/identity/application/testing/DiagnosticMaterialHarness.ts`
- `apps/api/src/modules/identity/infrastructure/DiagnosticMaterialPrepared.spec.ts`
- `apps/api/src/modules/identity/infrastructure/DiagnosticMaterialPrepared.e2e.spec.ts`, authored only
- This receipt

The cross-context tests reside under Identity so they can compose its real internal authority adapters without violating the existing import boundary. No production ownership or module boundary changed. The earlier red-only diagnostics test locations are removed in the final diff.

## Behavior and transaction effects

| Phase | Outer preparation and effects |
| --- | --- |
| Identity stage | Exact insert defaults, timestamp and epoch are planned before authority locks; one `identity_material_change` command. Existing retries use a read prefix and reread current material. |
| Identity upload intent | Read-prefixed preflight, then an exact descriptor/epoch material command before authority/material/rights checks. A verified retry is read-only. Active lease refusal remains distinct from source mutation. |
| Storage put and exact read | Outside every database transaction. No prepared receipt spans object I/O. |
| Identity adoption | Fresh material command; current authority, retained rights, staged state, exact epoch and live lease are rechecked before verification. |
| Identity failure cleanup | Fresh material command, limited to the exact staged owner/order/epoch. Cleanup does not depend on staff authority surviving the failed phase. A replacement epoch is preserved. |
| Identity append/correction | Order version/generation/timestamp, immutable evidence and audit are planned together before authority. Current raw observation, retained provenance and correction graph remain required. Finish failure rolls back the complete append. |
| Identity list/delivery | Read prefix before authority and graph/material locks. Delivery reauthorizes and rechecks epoch/rights/erasure after asynchronous storage. |
| Finding upload/read/abandon | Read prefix before report access and material locks. Existing report-owned writes and lease transitions remain ordinary writes, without an unrelated source command. Failed put/read/adoption retains exact cleanup metadata. |

R5 callers of `deliver(id, authorize, roots?)` must supply their complete initial pair/page root union or establish that union inside `authorize` before taking locks. The helper does not extend an established scope. R5 implementations were not changed.

## Authored and executed evidence

| Evidence | Authored | Executed | Result or limit |
| --- | ---: | ---: | --- |
| R4 direct ports/storage cases | 28 | 28 | Passed |
| Accepted adjacent R3 cases | 19 | 19 | Passed |
| Real SQL adapter scenarios | 15 | 0 | Not imported, collected or run |
| API TypeScript 6 and configured TypeScript checks | 2 | 2 | Passed; static checks include authored test source |
| Scoped ESLint and whitespace checks | Yes | Yes | Passed |
| SQL/HTTP/E2E, CI, deployment, reset, Railway, device/native, B5 | No operational work | 0 | Parent gates remain in force |

The red checkpoint `f27a9fba991b192b9c911961807f27e64c37afdd` recorded three failures before implementation: missing source finish/rollback, missing execution-time rights refusal after preparation, and missing durable cleanup after a lost storage reply. Six initial cases passed. The final focused run passed all 47 cases across four files.

The offline tests compose the production ports, authority use cases and Prisma authority adapters. Database CRUD/protocol replies, storage and time are boundary fakes. Snapshot restoration proves application rollback handling only. These tests do not prove PostgreSQL closure, effect comparison, trigger enforcement, advisory lock ordering or concurrency.

Positive/refusal cases cover stage/upload/read/retries, append/correction and raw preservation, stale versions and raw observations, foreign material/orders, active leases, expiry and permission changes between phases, lost storage replies, cleanup ownership and replacement epochs, full append rollback, delivery reauthorization, and referenced finding abandonment.

The 15 authored SQL cases exercise actual adapter entrypoints with guards in a future disposable configured E2E worker database. They cover append/correction/retry, atomic stale/foreign refusals, an INSERT rollback sentinel, revocation/expiry/disposal/epoch/storage changes between upload phases, cross-owner object ids, finding cleanup/abandon, delivery epoch replacement, and both observed stage-versus-source lock orders. The observation bound is shorter than Prisma's unchanged transaction timeout. Their fixture and concurrency behavior is unvalidated until parent-authorized execution.

Focused command, with database execution disabled:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run \
  src/modules/identity/infrastructure/DiagnosticMaterialPrepared.spec.ts \
  src/modules/diagnostics/infrastructure/DiagnosticPreparedIntake.spec.ts \
  src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrant.application.spec.ts \
  src/modules/diagnostics/infrastructure/campaignDiagnosticAdmission.spec.ts
```

Static commands were `pnpm --filter @auto-tm/api exec tsc6 --noEmit --pretty false`, `pnpm --filter @auto-tm/api typecheck`, scoped `pnpm --filter @auto-tm/api exec eslint` on the seven source/test files, and `git diff --check`. A final authored-test-only lint pass followed the shorter observation-bound edit. No runtime suite was broadened.

## Preservation and remaining gates

The exact diff against R3 preserves `packages/db`, `packages/contracts`, schema/mirror/index/profile contracts, `DiagnosticPreparedIntake`, `DiagnosticAuthority`, campaign admission, R5 report/proof/request/access implementation, public automatic domain source and CI configuration. No dependency or architecture blocker was found within this slice. Parent integration, independent review, coherent candidate checks and authorized SQL/runtime acceptance remain outstanding.

## Local evidence hashes

SHA-256 values identify the local logs. Empty logs correspond to successful quiet checks, with zero exit status observed separately.

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/r4-red.log` | `7ca92df02a2b45d64f74fb92d287190ca4ff01adcd0c1e6da8dddd56928c4f1f` |
| `/tmp/r4-focused.log` | `9d34545a1c26ada2134c1e67640c0ad0a9844089855cc375293c0db64c8ffb5a` |
| `/tmp/r4-typecheck6.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/r4-typecheck7.log` | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| `/tmp/r4-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/r4-authored-final-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/r4-diff-check.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/r4-preservation.json` | `0b2285cc378e35de212329932f6c1d72c6caa565dc4ecdf4f64f3911027b90b0` |
