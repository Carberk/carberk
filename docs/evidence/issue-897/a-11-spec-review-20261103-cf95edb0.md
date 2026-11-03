# A-11 independent Spec recheck, exact candidate cf95edb0 (#938 source/packet boundary)

Date: 2026-11-03 (review slot 02:50–03:50 UTC; receipt written ~03:00 UTC)

Verdict: **#938 stage1 source boundary: PASS (source-ready, bounded). Runtime
packet: FAIL / OPEN. Combined source/packet admission for runtime is not
satisfied.** No runtime, PostgreSQL, cleanup, full224, hosted, native,
release, #938, #934 or Milestone A acceptance is claimed.

## Identity and reviewer readback

- Candidate HEAD: `cf95edb0e5442faf4180b6efac8da88481188139`.
- Candidate tree: `3c5352a0c11ac410151614b0f806fdbb2c010a36`.
- Immutable isolated checkout: `/Users/bagtyyar/.t3/worktrees/carberk/t3-e042078c`,
  branch `t3/issue-934-spec-review-1`. Porcelain clean before this receipt was written.
- Non-doc source equals writer source `94ad0134a5d5ec03beb70a69746054637f0e937b`
  (`git diff --quiet 94ad0134… HEAD -- . ':!docs'` exit 0).
- Dispatch: #934 reservation [6594168513](https://github.com/Carberk/carberk/issues/934#issuecomment-6594168513).
  Reviewer policy is the Founder override: `claudeAgent/claude-opus-5-5`, `effort=high`,
  `fastMode=false`, full-access with read-only behavior. The harness identifies the
  model as `claude-opus-5-5`. Effort and fastMode come from the dispatch record. This
  reviewer has no host query that exposes them independently. No other provider/model was used.
- Issue-update owner: A coordinator. This reviewer did not change any issue, PR or ref.

## Governing criteria read

Actual issues [#897](https://github.com/Carberk/carberk/issues/897), [#934](https://github.com/Carberk/carberk/issues/934)
and [#938](https://github.com/Carberk/carberk/issues/938). The #938 comments
[6591877707](https://github.com/Carberk/carberk/issues/938#issuecomment-6591877707) (stage1 contract),
[6592324086](https://github.com/Carberk/carberk/issues/938#issuecomment-6592324086) /
[6592366007](https://github.com/Carberk/carberk/issues/938#issuecomment-6592366007) (private ledger),
[6593597600](https://github.com/Carberk/carberk/issues/938#issuecomment-6593597600) (completion repair),
[6593883585](https://github.com/Carberk/carberk/issues/938#issuecomment-6593883585) (ledger/proof-detail correction),
[6594024987](https://github.com/Carberk/carberk/issues/938#issuecomment-6594024987) (packet closure). Prior receipt
`a-11-spec-review-20261103-ec2494b9.md`.

## Read-only commands

`pwd`, `git rev-parse HEAD 'HEAD^{tree}'`, `git status --porcelain`, `git branch --show-current`,
`git log --oneline`, `git show --stat`, `git diff --name-status|--quiet|<full>` (ec2494b9..HEAD,
87456f4f..HEAD, 94ad0134..HEAD), `git ls-files`, `nl`/`sed`/`grep`/`cat`/`ls`, `shasum -a 256`,
`python3 -I` read-only hashing of `input-pins.json` against this checkout and against the writer
worktree's compiled outputs, read-only `grep`/`sed` of the installed vitest 5.0.4 dist in
`/Users/bagtyyar/.t3/worktrees/carberk/t3-2d375913/node_modules/.pnpm/vitest@5.0.4_*`, and
`gh issue view` / `gh api …/issues/{938}/comments`, `…/issues/comments/{id}` GETs. No
package, build, test, service, DB, Redis, storage, Docker, native, hosted or PR command ran.
No source was edited. The only write is this receipt.

## Prior findings classification (ec2494b9 receipt)

| Prior finding | Status on cf95edb0 | Evidence |
|---|---|---|
| P1 void callback rejected | **Resolved (source)** | `diagnosticPreparedReaderFixture.ts:505-517`: completion is tracked as `{ value }`. `undefined` is accepted. The original error is still captured. Cleanup still aggregates via `AggregateError` and the original is rethrown. `938_fixture_missing_result` now fires only when no completion occurred. |
| P2 private ledger checkpoints | **Resolved (source)** | Helper `record` (`:302-305`) throws `938_fixture_dependency:version:<event>` on mismatch. Unchanged-version checkpoints read the persisted order (`persisted`, `:307-309`): no-grant 5 after a zero-grant count (`:318-320`), provenance stage-upload after the stored descriptor check (`:340`), and proof issue-read after the POST (`:375`). `DiagnosticContinuityHandoff.e2e.spec.ts:16-28` asserts the exact literal `create0/physical authorization1/reviewer2/technician3/confirmed4/arrived5/no ownership grant5/first raw6/provenance stage-upload6/retained evidence append7/proof issue-read7` with `toEqual`, filtered to B. Persisted B version 7 is re-read after the proof-detail GET (`:10,14`). |
| P2 reviewer proof-detail 200 | **Resolved (source)** | `DiagnosticContinuityHandoff.e2e.spec.ts:9`: reviewer `GET …/continuity-proofs/${proofId}` → literal 200. This matches the original `DiagnosticContinuityHandoff.spec.ts:91` (default actor reviewer, status-only). |
| 4 pre-runtime cleanup/packet | **Partially resolved; still open**: see packet findings below | — |
| ec2494b9 verdict as a whole | **Historical** | Superseded for current bytes. Its bytes stay preserved. |

## Source boundary checks (satisfied)

- Public ledgers stay separate and literal. Capture (`ClassifiedForwardCapture.e2e.spec.ts:30-40`):
  `create0/physical1/publication2/reviewer3/technician4/confirmed5/arrived6/grant before first raw6/first raw7`.
  Readers B (`DiagnosticErasedPredecessorReaders.e2e.spec.ts:21-34`): the same sequence, then
  `provenance stage-upload7/retained evidence append8/proof issue-read8`. No grant was added to buyer-private
  B. No matcher, computed expectation or normalization.
- Handoff DTO/cache/privacy controls are unchanged (`:30-40`): literal 200, `no-store, private`, full
  `toEqual` DTO with `expectedOrderVersion: 7`, technician proof-detail 403, reviewer/foreign handoff
  403, real foreign assignment, then exact scoped-empty DTO.
- Original suites are unchanged. All four original `.spec.ts` suites, the five other selected specs
  (`PrismaStaffAuthority`, `StaffAuthorityHttp`, `IdentityAuthorityPrepared`, `DiagnosticMaterialPrepared`,
  `DiagnosticReportsPrepared`) and `packages/db/src/testing/DiagnosticMemoryDatabase.ts` each give
  `git diff --quiet 87456f4f… HEAD` exit 0. The refusal string is still at `DiagnosticMemoryDatabase.ts:102`.
  No path outside the five stage1 paths differs from 87456f4f under `apps`/`packages`.
- F47 is unchanged. `DiagnosticScopedDiscovery.e2e.spec.ts` is byte-identical to ec2494b9. The helper
  `$extends` `diagnosticIdentityEvidence.findMany` decorator (`:205-223`) is outside the changed hunks.
- The four files declare exactly seven `it` cases, all under `describe("issue938 recovery stage1")`.
  There are no `.skip/.only/.todo/.skipIf/.runIf/.concurrent`.

## Runtime packet findings (runtime-packet-20261103)

Satisfied in the packet:
- `resolved-compose.json` has SHA-256 `195168eb…c99414`, recomputed and equal to the receipts. It
  defines three services, with only `127.0.0.1` bindings 61169/61168/61170 via the committed `!override`
  overlay. Volumes and network are project-scoped.
- `input-pins.json`: 1636 tracked pins match this checkout with 0 mismatches. 102 migration pins equal
  `sha256(migration.sql)` on disk. 3457 compiled pins (api/worker/contracts/db dist) match the writer
  worktree with 0 mismatches.
- Redis DB1 `FLUSHDB SYNC` + `DBSIZE` expected `0` argv. Anchored database discovery regex. Restricted
  role list. Exact project `down --volumes --remove-orphans`. Container/volume/network/listener absence
  argv. Forbidden 65379/61148-61150. Image-digest capture before `up`.

Open defects:

1. **P1, incorrect: the prepared `-t` pattern selects zero cases.** `stage-command.json` argv uses
   `^issue938 recovery stage1 (…)$`. In the lockfile-pinned vitest 5.0.4, `fullTestName` is built with
   `createTaskName(names, separator = " > ")` (`dist/task-utils.js:51-52`, used at
   `dist/chunks/run.Cm2sd7-x.js:2662,2744`). The default file suite has no `.suite`
   (`run.Cm2sd7-x.js:2564-2571`). The pattern is coerced with `new RegExp` (`index.B8VfM7Mf.js:8950`).
   `interpretTaskModes` skips each test whose `fullTestName` fails the match (`task-utils.js:224`).
   The real names are `issue938 recovery stage1 > <case>`, so all seven would be skipped. The receipt's
   `allPassed 7 / skippedOrPending 0` gate would reject the result, so this fails closed, but the argv
   cannot execute the stage. Minimal correction: anchor on `^issue938 recovery stage1 > (…)$`.
2. **P2, missing: setup argv.** The new packet has no `docker compose … up --wait` and no `port` argv
   with the committed overlay path. Only the older `preparation-and-resource-packet.md:35` has one, and it
   uses the superseded `/tmp` overlay. The packet also never creates base database
   `auto_tm_897_938_s1r1`. Compose creates only `POSTGRES_DB=auto_tm_ci`, while
   `globalSetup.ts:47-59,126` connects `withAdmin` to the base URL's database. As prepared, setup would
   fail before the template is created.
3. **P2, partial: the failed-setup fallback cannot run as written.** `drop-anchored-databases` and
   `drop-anchored-roles` run `psql -Atc "SELECT format('DROP …')"`, which only prints statements. No
   argv executes them (for example `\gexec`), and the `expected` text defers execution. The fallback
   Redis step has no separate `DBSIZE` argv.
4. **P2, missing/partial: external residual checks.** There is no S3 residual inventory argv. Only
   the prose "S3 registry keys only" exists, and `down --volumes` would destroy unrecorded residuals.
   The source/campaign query targets `<restricted-or-bootstrap-url>` with no database named. In the
   normal path it runs after globalSetup has already dropped `_w1`. The normal path has no external
   check that the anchored databases and roles are absent. The receipt cites
   `OWNED_OUTPUT/stop-and-drain-callers.mjs`, but that file is not committed or present.
   The applied-checksum snapshot is prose only, with no `_prisma_migrations` argv.

In-process helper cleanup receipts (source/campaign counts, role absence, object/control inventory,
guard restore, partial-init control) remain source-present. Their execution is unproved.

## Unrun evidence and preserved A gaps

Unrun, and not substituted by this review:
- seven-case real-PostgreSQL stage;
- success/failure/partial-init cleanup execution;
- Redis DB1 zero proof and owned-resource absence;
- original 56 + 168 full224 no-skip GREEN on a resulting candidate (preserved #935 evidence is still 47 FAIL / 177 PASS);
- exact-SHA hosted CI.

Still open in their actual issue records:
- #924 (A-01) as an independent gate (its AUDIT-S2/S3 source-readiness retained);
- #925 (A-02) capacity/rollback/race;
- #926 (A-03) privacy/erasure;
- #927 (A-04) restoration lifecycle;
- #928 (A-05) protected/native journey;
- #929 (A-06) combined CI;
- #930 (A-07) deployed restoration;
- #931 (A-08) exact artifacts;
- #933 (A-10) protected delivery/merge/closure/cleanup.

## Disposition

The three former source findings are resolved in the current bytes. The #938 stage1 source boundary is
source-ready within this review's scope. The runtime packet is **not** admissible: packet finding 1
must be corrected and findings 2–4 completed before any runtime release. The A coordinator owns those
corrections, the fresh slot/resource readback, every issue update and later exact-SHA review. This
receipt claims no #938 PASS, #934 PASS or Milestone A acceptance. Preserve this checkout and branch for
coordinator handoff.
