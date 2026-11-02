# A-02 bounded correction handoff, 2026-11-02

A-02 remains FAIL/open. This packet records a source correction and isolated
offline verification. No ordinary fixture, worker case, database result or
cleanup result was produced. All ten runtime bodies remain coordinator-owned
and unstarted. A remains 2 PASS / 9 OPEN; only Parent accepts. PR904 is unchanged.

This report supersedes the current-source claims in both
[the initial handoff](producer-repair.md) and
[the preserved-source handoff](producer-repair-20261102.md). They remain
historical receipts of `f880da06` and `5a0a2b12`, respectively. Their one-order
raw-count prerequisite, three blocked selectors and oldest-capacity declaration
describe earlier source. Neither earlier receipt is rewritten here.

## Authority and identity

The sole existing writer continued in
`/Users/bagtyyar/.t3/worktrees/carberk/t3-fac70050`, branch
`t3/issue-897-a02-batch-fixture-producer`, using `codex_work`, `gpt-6.1-sol`,
xhigh/priority and full access. No task, child, coordinator, worktree, provider or
PR was created. No source was assembled into the coordinator or pushed remotely.

Authority is Parent disposition
`c0eb1e282013070b1f0582a10515f240986de578:docs/evidence/issue-897/release-parent-a02-disposition-20261102.md`
and the separately pinned correction contract
`596b587b73b0580e41581a0a67945bdf425e5db1:docs/evidence/issue-897/a-02-worker-restricted-20261030/bounded-producer-repair/correction-20261102.md`.
Both were read from Git objects; the coordinator contract was also read in its
checkout without writing there. The correction contract SHA-256 is
`6a71be8fd76a7dfaf2a0bb5c0b6a28aae59a2dea3e00b78f31de3461e5c89121`.

| Checkpoint | HEAD | Tree |
|---|---|---|
| Source edit base | `5a0a2b1216b696bc9b2f6b89ef0764cc3f18cd1b` | `d0a28b674929ec5d898c6c31e65a5f6415d0be46` |
| Clean evidence/edit base | `57b44c0645a0197ecd237975e41d1909b03dd36b` | `4a616b5fd5efc88199e0b8b187a22057ae7be161` |
| New source checkpoint | `9e48011e54a23822504d9cb5ae5f6d7a9f96028e` | `33a26963c3db13f8e62b6b2b0ad1998bd4a5c633` |

The edit base parent is `77458f5137c4b31b222438c30d98b86ae814e131`.
Initial `git status --short --branch` showed only the expected branch, with no
changes. The required `git diff --exit-code 5a0a2b12..HEAD -- . ':!docs'`
returned 0 and no output before edits. Its independently timed repeat also
returned 0 while HEAD still equalled `57b44c06`; that repeat compared committed
trees, excluding the in-progress edits. The source commit's parent is exactly
`57b44c06`. Source paths are committed; this report and its pin/audits form the
separate evidence checkpoint.

The evidence checkpoint starts at `c9089f62`; the final evidence-only commit
updates the verification record with the terminal HEAD/tree, clean status and
complete path diff. Those exact values are also in
`/tmp/897-r6c-a02r2-20261030/producer-repair/correction-terminal-20261102.json`
and returned with the handoff. A tracked file cannot contain its own commit
hash; the external receipt binds the final packet without a self-referential claim.

Preserved ancestors include `f880da06f68ba82ffe6951e10c100868bcfca7c5`,
`b774ce00105323b0d0334499f1db25e6c51a7f15` and
`a13d2b14da5d54dd9bec41156c407f0482d0eee1`. All six recovery artifact hashes
match the prior receipt. The committed and working producer snapshots still
match `f880da06` and `a13d2b14`. Nothing was reset, rebased, amended or overwritten.
The exact recovery hashes and identity tuples are in the
[input audit](correction-input-audit-20261102.json).

## Exact diff and unchanged dependencies

The source checkpoint modifies exactly:

- `apps/worker/src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts`.
- `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs`.
- `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.test.mjs`.

The evidence checkpoint adds only this report,
`verification-correction-20261102.json`, `correction-input-audit-20261102.json`
and `correction-spec-pin-20261102.json` in this directory. Private logs and
patches are confined to the allowed producer-repair directory under `/tmp`.
The new pin is required alongside the source checkpoint for later production.

The corrected spec hash is
`55a86bf9fde74829e5200aa05b87abfc489756c5d1ef38d732bf5f12914a47d3`.
The producer validates that literal hash and the correction-specific manifest's
path and authority. A config cannot supply an expected status or replacement
spec hash. Historical `fresh-ordinary-fixtures/source-pins.json` remains
byte-identical, SHA-256
`6da95e027f0b1a810671039d4083da8b00f5238c7a2e33fb686337cbdef2b02e`.
Only its old batch-spec byte pin is replaced for this new producer. All other
14 hashes pass. Every one of the 102 disk migration checksums matches manifest
`dce7ff20c196e9d9f04aec10b342f38fa3c40c1e20a9a7de2e5c8cc5a82b05dc`.
Production source, worker, controllers, contracts, config, accepted ordinary
producer/bootstrap and schemas are unchanged. Explicit comparisons against
accepted source `4b2c8a6f6161f9c825945637f6f848c64adeb145` exclude only docs and
the three allowed paths and return 0 with no output.

The four API source modules match their accepted pins. Their compiled files
are absent in this checkout; no API composition was loaded. Actual compiled
bytes, loaded-module inventory and the applied migration chain are unproved
offline. The producer retains the bootstrap's full source/loaded-file equality,
on-disk hash rechecks and disk AND applied migration checks before any routes.
Coordinator build/bootstrap must supply and verify those current artifacts.
The frozen dependency field `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab`
still supplies no authority to downgrade source. Original campaign source
`52d901c50af1dde97ea22bda8efb1fdf21f169b1` is retained as provenance only.

## Input, output and ordinary route plans

Input remains the accepted bootstrap's private config plus an exact case,
worker URL and owner URL. Environment names are `DATABASE_URL`, `REDIS_URL`
and `MINIO_ENDPOINT`. The producer connects only with the restricted readback
URL. Every database operation is a read; every new runtime row must come from
the unchanged ordinary HTTP routes. Owner/worker URLs are manifest bindings,
not producer write connections.

All resource, private path/symlink/mode, five-cohort, 404-Session, direct
restricted nonowner, source/campaign readiness and empty-receipt checks remain.
Setup is 120 seconds, each request is at most five seconds, and the queue drains
at most five HTTP requests in flight on failure. E is declared once as real
wall clock plus 45 seconds. No end is extended and no width, cap, iteration,
statement or worker budget changes. Requests after the construction deadline
fail. A construction failure emits an explicit `A02_BATCH_DEPENDENCY_OPEN
[case]` error and a private failure inventory, never a `fixture.json` substitute.
Admission errors still fail before a DB client/HTTP/output composition.

Common route order for every initial visit is commissioner `POST orders`,
reception `POST orders/:id/assignments` for technician then reviewer,
`POST orders/:id/authorization` for physical then publication, and
`POST orders/:id/appointment` for confirmed then arrived. Rights are declared
only after those orders exist. Commissioner then calls
`POST orders/:id/ownership-grant`; technician calls
`POST orders/:id/vehicle` with that grant, the current version and retained
classification. Visit 2 gets a second classified append. Visit 100 has a due
component under a later grant; visit 101 is the non-due control except for the
existing oldest-capacity outside-component shape.

Shared visits 0/1 each call `POST identity-provenance`, binary `PUT
identity-provenance/:id`, and `POST identity-evidence` under their orders.
Visit 0 opens `POST orders/:id/reports`, saves a finding, submits, then finalizes
using the unchanged report routes. Reviewer prepares `POST
orders/:id/continuity-requests` with `kind=issue` and executes its exact issue
command. Technician prepares a `kind=consume` request. Non-proof-race setups
execute it twice identically and verify the stored report's proof, order-version,
request and Session binding plus exact report equality. Both proof-use races
leave it pending and return the same consume request and a deep-copied exact
retry. No unclassified capture, stale-version input or alternate route is used.

Success would exclusively create mode-0600 `producer-retained.json`,
`producer.json` and `fixture.json` in its private case directory. These carry
actual route receipts, selected ranks, retained state, source/loaded pins,
object keys and request bindings. The public evidence contains no credentials,
tokens or runtime graphs. No success or failure runtime fixture was generated
in this dispatch.

| Selector | Source plan after correction | Still unproved |
|---|---|---|
| `later-failure` | 100 due grants, two-component grant, consumed shared proof across ranks 1/11, independent component. Original fault/rollback/resume assertions retained. | Actual later-group fault, prefix commit/rollback, convergence and cleanup. |
| `shared-multiple` | Shared proof spans selected groups at zero-based ranks 0/10. Report consumption and exact retry remain bound. | Full group inventories, erasure/privacy closure and cleanup. |
| `oldest-capacity` | The 100 selected ends remain E-100ms through E-1ms. Extra grant is literal rank 101 at E+1ms; its independent component is due at E. Other independent/outside components remain due under later grants. Separate arrived order returns a real grant-arrival request with later rights. Producer records ranks and readbacks. Suite assertions are unchanged. | Actual immutable selection under arrival/barrier, outside-component capacity and unchanged newer/non-due grants. |
| `overlimit` | First ten selected roots are visits 0 and 2..10, each with 51 complete ordinary raw/component pairs. They share visit 0's seller-owned Listing/commissioner and retain each center's admitted staff/template. Nine additional commissioner bindings use only their already admitted first API cohort. There are 499 additional ordinary appends. | Lawful construction within E-2s and 120s, all inventories, real restricted first-command refusal, whole-state equality/restoration. |
| `worker-first-second-worker` | Original first-worker then second-worker prefix/barrier order. | Real lock chain, allowed refusal/success, closure and cleanup. |
| `second-worker-first-worker` | Original reversed two-worker start order on its own fresh DB. | Real lock chain and convergence. |
| `worker-first-capture` | Current classified vehicle request returned after actual E. Both early-refusal and final branches require literal 400 plus `DIAGNOSTIC_INVALID_INPUT`; DB wall-clock expiry is asserted. New raw/report/audit rows are forbidden. | Real expiry classification and both observable branch paths under the existing barrier. |
| `capture-first-worker` | Same classified request, current version and rights. Handoff targets E-2s and refuses a missed pre-E emission. Reverse success stays literal 201. | Native process startup, beforeAll and entry before the actual classification end, audit barrier, appended-row disposal. |
| `worker-first-proof-use` | Pending ordinary consume request, never setup-consumed. Both branches require literal 403 plus `DIAGNOSTIC_NO_ACCESS` after real E; raw/report/audit rows stay exact. | Actual expired/disposed proof refusal under the real worker/barrier. |
| `proof-use-first-worker` | Same pending consume request and exact retry, target E-2s. Reverse success/retry remain literal 201; retry also preserves the complete audit rows. | Pre-expiry entry, actual consume/worker serialization, minimal immutable retry, no duplicate report/audit and cleanup. |

For overlimit, the suite reads each complete singleton registry scope/effect
inventory without preparing or executing a command. It verifies that all ten
contain the shared Listing and commissioner, and that all 510 raw keys and
510 component keys exist in their distinct union. Those 1,020 keys alone
exceed the cap of one first ten-root command. It records every full inventory,
deduplicated registry/effect keys and cardinalities. It never sums successful
worker invocations or mistakes raw-row count for graph size.

Only one unchanged worker cleanup is invoked for refusal. Its actual exception
must contain `diagnostic_source_scope_limit`; no subdivision/skip/retry is
allowed. Every public persisted table is snapshotted before and after, including
audits, immutable evidence, bootstrap/foreign controls and receipts. Exact
equality, the existing state snapshot, zero source/campaign receipts and exact
afterAll trigger restoration are mandatory. The singleton refusal invariant
remains in unchanged production code; no connected overlimit singleton runtime
proof is claimed. Derived-effect count is recorded separately and need not
itself exceed 1,000 when the registry union already does.

## Verification and open dependencies

The [verification record](verification-correction-20261102.json) contains the
exact argv, UTC start/end, monotonic duration, output and exit of the required
offline checks. Final producer syntax check exits 0; final isolated boundary
test has 1 test, 1 pass, no skips, exit 0 and runner duration 419.666708ms.
The test launches only rejected CLI inputs and removes its private temporary
directories. Foreign port 65379 appears only as rejected input text.
Whitespace and explicit path/source/hash audits pass. No package command,
service, container, DB, HTTP, storage, reset/migration, native, deployment or
timing run was launched. Source inspection is not runtime evidence.

The three earlier dependencies now have authorized source corrections, with
their acceptance dependencies still OPEN:

1. Overlimit needs actual ordinary construction within the unchanged 45-second
   declaration and 120-second setup. The fixed plan requires 719 HTTP requests
   after declaration, including the extra 499 appends, with common source locks
   potentially serializing them. Offline arithmetic is no throughput proof.
   Any ordinary admission/cap/deadline failure must remain OPEN with no usable
   fixture. Real restricted refusal/cardinality/equality/restoration is pending.
2. Worker-first capture needs the same classified request to reach actual expiry
   and return exactly 400/`DIAGNOSTIC_INVALID_INPUT` under the real barrier,
   without unrelated invalidity, a new raw row or audit.
3. Worker-first proof-use needs the same pending proof-use request to return
   exactly 403/`DIAGNOSTIC_NO_ACCESS` for expired/disposed proof, with no new
   report/audit and unchanged privacy and retry behavior.

Opponent-first process startup, beforeAll, actual admission and barriers remain
unproved inside the two-second handoff margin. The producer refuses an output
that finishes after E; an on-time file alone cannot prove an on-time request.
Compiled/loaded artifacts and applied migration pins remain pending as above.
All ten real case bodies, affected package/TypeScript checks, independent
Standards/Spec reviews, object/role inventory and exact cleanup remain pending.
No code dependency outside the three allowed paths was established offline.

Resources remain planned, not provisioned: Compose
`auto_tm_ci_897_r6c_a02r2_20261030`, PG `127.0.0.1:61149`, ten distinct
`r6c_batch_a02r2_*` databases, Redis `127.0.0.1:61148` DB0, MinIO
`127.0.0.1:61150` bucket `diagnostic-test-private`, private root
`/tmp/897-r6c-a02r2-20261030`. Coordinator alone owns assembly, reservation,
fresh provisioning, serial actual production/selectors and cleanup. No
host-heavy slot was reserved. No runtime readiness or milestone completion is
claimed by this source/evidence handoff.
