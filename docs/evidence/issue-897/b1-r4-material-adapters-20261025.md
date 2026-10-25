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


## One focused correction round, 2026-10-25

This section supersedes the earlier source-correctness and authored-reachability claims above. Parent accepted all four findings in `/tmp/897-r4-focused-source-assessment-20261025.md` after source inspection. Correction base is the entire original R4 checkpoint `5fa15dae7b6a5952783b361214a1259a427b1166`, tree `3d5acaf2413b2b63ee1a72c1ca1ccef1256bb4c3`. The owned host scaffold was clean at `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`. Its branch remains preserved. The reservation was pushed before edits on `agent/issue-897-r4-material-correction-20261025` in `/Users/bagtyyar/.t3/worktrees/carberk/t3-29e187f3`. No other checkout or integration branch was written.

| Finding | Correction and evidence | Status |
| --- | --- | --- |
| R4-S1 P1 | Cleanup rereads id/order/requested epoch/staged state inside the prepared callback before UPDATE. Mismatch throws and rolls back, with no renewal deletion, retry, nested receipt or scope extension. Deterministic offline boundary replacement occurs after the initial cleanup read and before planning; the separate committed epoch survives the fake caller rollback. Existing exact matching cleanup cases remain. | Offline red then green; real SQL counterpart authored only |
| R4-S2 P1 | SQL setup queries the selected unerased raw row and supplies its actual id/hash to the report INSERT. The legacy raw-pin trigger stays active and has an explicit enabled assertion. Raw/report preservation assertions remain through append/correction. Offline fixture now carries a concrete pin and asserts full report preservation. | Static source correction; SQL reachability unexecuted |
| R4-S3 P2 | AFTER INSERT rollback must reject with `r4_rollback`; an earlier generic failure fails the case. Complete order/evidence/audit restoration remains, with additional provenance/raw/report equality. | Authored only |
| R4-S4 P2 | Opponent calls unchanged production `PrismaDiagnosticIntake.assign`, renewing the existing technician assignment under real current reception and technician grants, qualifications, order assignments and elevated Session. Real effect triggers pause order UPDATE or provenance INSERT. Backend PID and `pg_blocking_pids` prove both waits, then explicit release and awaited outcomes drain both calls. Source-first requires `DIAGNOSTIC_STALE_VERSION` from staging; material-first requires current `diagnostic_source_graph_changed` from intake. Complete order/assignment/raw/report/evidence/audit assertions discriminate success and rollback. | Authored only; no production opponent edits |

Red checkpoint `41807e76826d93d30e241a881349a588533b64d1` was committed and pushed before production changes. Its genuine offline run had 28 passes and one failure: replacement E2 became `cleanup_pending` with `cleanupRequestedAt` set. Green ran the same file plus the three original adjacent R3 files, with all 48 cases passing, 29 R4 and 19 R3. This is application protocol/state evidence with boundary fakes, not PostgreSQL concurrency proof.

Commands run were the original focused four-file offline Vitest command above with `AUTO_TM_TEST_DATABASES=off`, API `tsc6 --noEmit --pretty false`, configured API `typecheck`, ESLint on the original seven source/test paths with `--max-warnings 0`, and `git diff --check`. All affected final checks passed. The SQL file was parsed statically by compilers and lint only, never imported, collected or executed. No broad repository/service gate was run under this bounded authorization.

The fresh scaffold required `pnpm install --offline --frozen-lockfile`, then configured contracts/db builds. The first DB generation lacked DATABASE_URL and the first test attempt failed package resolution before collecting any tests. Those are setup failures, not behavioral red. DB generation/build then succeeded with the deliberately unreachable `postgresql://offline:offline@127.0.0.1:1/offline` configuration. No database connection or service was started. Docs: not applicable, internal source/test correction without dependency changes.

### Authored SQL and remaining matrix gaps

There are 16 expanded SQL cases, all unexecuted. The original 15 cases and their acceptance assertions remain, strengthened as above; one cleanup/renewal case was added. The new case pauses only the real database query boundary immediately before cleanup's planning query, runs a second production upload after lease expiry, waits for its committed replacement intent, holds its storage completion, then asserts cleanup refuses without changing the exact replacement row. It releases and awaits renewal verification. Real queries, commands and authority still run unchanged. The offline fake models one explicit committed replacement, not arbitrary interleavings.

Source inspection removes the demonstrated null-pin setup blocker: exactly one unerased raw row exists at report creation, its orderVersion is 1, and its selected id/hash satisfy the legacy binding trigger. That trigger is outside the unchanged dormant-source guard selection. The added reception fixture supplies the actual intake assignment capability path. Physical authorization now includes recordedBy/recordedAt so the real intake DTO schema can parse it. Readiness and enabled-trigger assertions are authored and remain unexecuted. Directly seeded material fixtures are not the genuine grant/automatic admission journey. No workaround changed kernel, migrations, original integrity triggers, timeouts or assertions.

| Matrix | Offline executed | Real SQL authored | Remaining gap |
| --- | --- | --- | --- |
| Stage/upload/append/correction/exact retry, raw/report pin preservation | Yes | Yes | SQL guards, effects, role and storage behavior unproved |
| Stale/foreign material/raw/order refusals | Yes | Stale, absent raw, foreign order | Retained foreign-raw SQL case absent |
| Actual INSERT rollback and atomic version/generation/evidence/audit | Fake finish rollback | Named `r4_rollback` plus complete snapshots | Actual trigger firing and rollback unproved |
| Revoke/rights expiry/disposal/epoch/storage between phases | Yes | Yes | Disposal helper is not full account purge; no general phase-by-phase concurrency matrix |
| Exact cleanup and epoch replacement | Yes, including between initial/planning reads | Matching cleanup plus production renewal after lease expiry at that boundary | New SQL race is authored only; no other renewal schedule claimed |
| Both-order source/material opposition | Boundary protocol only | Real intake assignment versus staging, both observed waits and exact refusal assertions | Actual lock/rediscovery outcomes unproved |
| Cross-owner object-id opposition | Boundary coverage | Sequential both directions | Concurrent collision race absent |
| Post-read delivery reauthorization | Epoch/rights/erasure/permission | Epoch replacement | SQL post-read permission/rights/erasure absent; SQL storage fake does not validate expected size/hash |
| Campaign/restricted role, complete R5 pair/page, genuine automatic201 | No new evidence | Not established here | Parent/R5/full assembled runtime acceptance remains required |

`40177598331` remains the sole prior diagnostic, failed in kernel migration before any cases. No retry, CI dispatch/rerun, SQL/E2E collection, live HTTP, Docker/local DB, Railway, deployment/reset, device/native/screenshot/artifact/signing/store work occurred. B5 is UNUSED, admission CLOSED, guards dormant. Shared helpers, kernel/SQL/mirrors/schema/profile/index, R5 source, R6a and R7a remain unchanged. No API or dependency request outside the eight owned paths was needed.

The correction is one finite batch. Parent owns its source gate and any later assembly/R5/runtime acceptance. No further reviewer/fixer loop or release verdict is claimed. Exact correction base/head/tree, changed and owned source hashes, log hashes, preservation evidence and next read-only command are in `/tmp/897-r4-material-correction-20261025-handoff.md` and `/tmp/897-r4-material-correction-20261025-manifest.json`.

### Correction log hashes

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/897-r4-correction-red-behavior.log` | `ee29bdaaa4934215029cac8809967b7409822985b11eaf302d0da63def5f5d41` |
| `/tmp/897-r4-correction-green.log` | `b42d333f16f6b30266505a0ee5306ce65150c245da81b6ee6facdf35a3779a96` |
| `/tmp/897-r4-correction-typecheck6.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/897-r4-correction-typecheck-configured.log` | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| `/tmp/897-r4-correction-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/897-r4-correction-diff-check.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/897-r4-correction-install.log` | `2e35663b40ee50694ec941e347595e4942ae8fe3eb4f19a473a6d4b0c31dbf1d` |
| `/tmp/897-r4-correction-contracts-build.log` | `b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616` |
| `/tmp/897-r4-correction-db-build.log` | `4c2c2a367f0bf19229411e7e6a51065375d2a2599af35f65286635d5f0e5b1a3` |
| `/tmp/897-r4-correction-red.log` | `862fc213d49b65794b11490f78e04594fc84b2c239f6ad295fb751950cc25641` |
| `/tmp/897-r4-correction-preservation.json` | `2a66ec493d4b6bcadb1d019cfdba9f2f4ee613579556bc72bddb1ab22d44c12f` |
