# A-02 corrected offline source handoff — 2026-11-02

**A-02 remains FAIL/open. Seven ordinary case plans are implemented and audited
in source; no case has been materialized or accepted at runtime.** Three selectors
fail closed before runtime composition. This report supersedes
[the historical handoff](producer-repair.md). No accepted ordinary full100,
reset, staff/API or static proof was rerun.

## Identity and preservation

The same worker continued in `/Users/bagtyyar/.t3/worktrees/carberk/t3-fac70050`,
branch `t3/issue-897-a02-batch-fixture-producer`. No new task, worktree,
coordinator, provider, child or PR was created. No source was assembled into
the coordinator. Source selection remains `codex_work`, `gpt-6.1-sol`,
xhigh/priority, full access.

| Checkpoint | Immutable identity |
|---|---|
| Original supplied base | `8c6fe1d1cc91b44100279a2f82da2a0d5421cc72` |
| Accepted source assembly | `4b2c8a6f6161f9c825945637f6f848c64adeb145` |
| Original campaign source | `52d901c50af1dde97ea22bda8efb1fdf21f169b1` |
| Original worker start | HEAD `077c4adedf9c6e776e0daca433c7855d968716ec`, tree `98b1133686e034d06c9038b577e26246c3a7af2c` |
| Preserved initial source | `f880da06f68ba82ffe6951e10c100868bcfca7c5` |
| Preserved initial evidence | HEAD `b774ce00105323b0d0334499f1db25e6c51a7f15`, tree `9746b42f6d9affb06f6d6e1c5b48978779975489` |
| Resumed draft and red boundary checkpoint | HEAD `a13d2b14da5d54dd9bec41156c407f0482d0eee1`, tree `fadc5e950eb5d88b53a5d67d01771f91493ce40d` |
| **Corrected source checkpoint** | **HEAD `5a0a2b1216b696bc9b2f6b89ef0764cc3f18cd1b`, tree `d0a28b674929ec5d898c6c31e65a5f6415d0be46`** |

All prior refs and the six files under `/tmp/issue897-a02-recovery-20261102`
are preserved. Hash readback matches the coordinator recovery manifest:

| Private recovery artifact | SHA-256 |
|---|---|
| `producer-committed.mjs` | `36efd18b4babb4b13a2dfcb5fd91f6af9e33a4279795500804dc7081361011b6` |
| `producer-working.mjs` | `51eb66f2c15a5f11f6bd2d345e01b5e6ee091f1f4a89d2c8ed96b0b5846fcd3a` |
| `producer-working.patch` | `efeba75f283bcc8d91ac9f3da16000e6f3d8732b07f2b9b63ceac01b8ea27e24` |
| `committed-handoff.md` | `f11c9b44fe55cbca3174a026e37c29e105b74467c44c2402ec2be049d2a95471` |
| `git-status.txt` | `c821f7d7a17ea3946c3d001de61d7d9282d203c8979b6f7622d1b4107aa70691` |
| `committed-paths.txt` | `6ebd38618e83457ed4572c7fbff62882c5e092f1001e96a1bb7d95748419fabd` |

The producer at `a13d2b14` is byte-equal to the recovered working draft. The
producer at `f880da06` is byte-equal to the recovered initial committed file.
No reset, rebase, amend or recovery overwrite occurred. Coordinator continuation
and recovery/dependency reports were read from its checkout read-only, pinned
by `f40c7d5f9934fb659c2845e9e3bf2c615bbe586e`.

## Exact path allowance and dependency audit

The only source/test additions are:

- `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs`
  — SHA-256 `9f902c4385b893fffa8b86a630f3743dc37d0bc22899fbf9feb66d6240146134`.
- `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.test.mjs`
  — SHA-256 `4f9f8c1a29213e632e7a51e096e37a770c67b3c8de7cf9084a3fd1c9f90aba1e`.

Evidence writes stay in `bounded-producer-repair/`. Offline temporary files stay
under `/tmp/897-r6c-a02r2-20261030/producer-repair/`. The full source patch is
`/tmp/897-r6c-a02r2-20261030/producer-repair/source-5a0a2b12.patch`, SHA-256
`3009c084b56630a2c7a989c13e835edaaea6b9b87fabc30a1461557d955d300f`.

`git diff --exit-code BASE..077c4ade -- . ':!docs'` passes, proving the planning
and receipt interval before source work is docs-only. Comparing the supplied
base to the working source while excluding only docs and these two new paths
also exits 0. All 15 accepted input hashes in `fresh-ordinary-fixtures/source-pins.json`
match, including the unchanged batch suite, ordinary producer, bootstrap,
worker, controllers, ownership/proof implementations, contracts, Compose and
lockfile. All 102 disk migration checksums match the unchanged manifest
`dce7ff20c196e9d9f04aec10b342f38fa3c40c1e20a9a7de2e5c8cc5a82b05dc`.
Applied migrations and compiled loaded bytes are guarded by the producer but
were not accessed in this offline dispatch.

## Private input/output boundary

The planned executable command remains
`node apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs <private-case-config.json>`.
Input extends the accepted bootstrap's private producer config with the exact
`case`, `workerUrl` and `ownerUrl`; `DATABASE_URL` supplies its separate restricted
readback role. `REDIS_URL` and `MINIO_ENDPOINT` supply the recorded resource
identity. No runtime credentials were requested or generated here.

The producer binds exactly project `auto_tm_ci_897_r6c_a02r2_20261030`,
PG `127.0.0.1:61149`, Redis `127.0.0.1:61148` DB0, MinIO
`127.0.0.1:61150`, the selector-specific `r6c_batch_a02r2_*` database and
five distinct task-loopback API cohorts. It checks lexical/canonical private
paths and private root/config modes. Database query options are rejected so
they cannot override the host/port parsed by URL validation. Bootstrap receipts
bind the three roles, 102 visits, 404 principals, shared staff pair, five
immutable admission cohorts, original source and all actually loaded compiled
artifact hashes. The producer never connects with `ownerUrl` or `workerUrl`.

Before ordinary production it verifies current disk **and applied** migration
chains, direct restricted nonowner role flags/ownership, matched guard readiness,
fresh ordinary state, 404 exact Sessions and their validation horizon. The
dependency `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab` remains a frozen fixture
field; it does not select older source. No protected-row writes or manufactured
receipts exist. Every database operation in the producer is a readback.

Route cohorts preserve a serial version sequence per order, drain active work
on failure and overlap at most five HTTP requests. Each HTTP request is bounded
at five seconds. The native setup deadline stays 120 seconds. The immutable
cutoff E is declared once at wall-clock declaration +45 seconds; selected grant
rights are distinct E-100ms through E-1ms. This places the bootstrap's actual
shared staff/center pair at selected ranks 0 and 10. Rights are never extended.
Non-due control/provenance rights use the accepted later declaration.

Private output consists of `producer.json`, `producer-retained.json` and
`fixture.json` using exclusive creation and mode 0600. They contain runtime
route receipts, IDs/graphs and private request/URL bindings only after actual
production. No such runtime files were emitted here. Public evidence contains
no tokens, credentials, source graphs or runtime IDs. Failure retains its
private command/object inventory for coordinator cleanup.

## Ordinary route composition and per-case state

Every implemented case starts with ordinary commissioner `POST orders`,
reception technician/reviewer assignments, physical/publication authorization,
and confirmed/arrived appointment transitions. Only then are rights declared.
Commissioner creates each `ownership-grant`; technician appends the classified
VIN observation through `orders/:id/vehicle`. A selected grant receives two
ordinary observations. Another due component belongs to a non-due grant, and
a separate control grant/component remains non-due.

The actual shared bootstrap pair stages and uploads identity provenance,
appends identity evidence, creates a report, saves its finding, submits and
finalizes it. Reviewer prepares and executes a continuity issue request.
Technician prepares a consume request. Except in `proof-use-first-worker`,
setup executes it and repeats the identical request, checking the consumed
report's proof/order-version/request/Session bindings and exact unchanged row.
No new provider, clock seam, route or contract architecture was introduced.

| Selector | Exact source plan at this checkpoint | Evidence state |
|---|---|---|
| `later-failure` | 100 ordered due grants, multi-component grant, cross-group consumed proof, independent due component; unchanged suite owns later-group fault and rollback/resume assertions. | Implemented/source-audited; runtime, fault and cleanup unproved. |
| `shared-multiple` | Shared pair at ranks 0/10; one selected grant has two components; consumed report and exact consume retry binding persist. | Implemented/source-audited; full inventories/closure unproved. |
| `oldest-capacity` | Extra ordinary order/grant has rights E as the 101st after E-1ms; its component is independently due. Another due component is under the literal later grant. Separate arrival order has no grant; fixture returns its real commissioner grant request. A distinct later control remains. | Implemented/source-audited; selection freeze, arrival, independent capacity and cleanup unproved. |
| `worker-first-second-worker` | Same ordinary graph; barrier User is present in first group's source prefix. Suite starts its first worker then second worker. | Implemented/source-audited; actual lock chain and outcomes unproved. |
| `second-worker-first-worker` | Distinct fresh graph and same genuine first-group User barrier; suite reverses its worker call order. | Implemented/source-audited; actual lock chain and outcomes unproved. |
| `capture-first-worker` | Returns the real classified append request with current version/grant/rights; producer targets E-2 seconds and refuses a missed handoff. Suite owns the audit barrier before E. | Implemented/source-audited; native startup/beforeAll/barrier timing and appended-row closure unproved. |
| `proof-use-first-worker` | Leaves the genuine consume request pending, returns its exact execution body and a deep-copied identical retry; producer targets E-2 seconds. | Implemented/source-audited; native startup/beforeAll/barrier timing, consumption and post-expiry retry unproved. |
| `overlimit` | Throws `A02_BATCH_DEPENDENCY_OPEN [overlimit]` before DB/client/HTTP/output. | OPEN at this source checkpoint; no purported fixture. |
| `worker-first-capture` | Throws `A02_BATCH_DEPENDENCY_OPEN [worker-first-capture]` before DB/client/HTTP/output. | OPEN at this source checkpoint; no status substitution. |
| `worker-first-proof-use` | Throws `A02_BATCH_DEPENDENCY_OPEN [worker-first-proof-use]` before DB/client/HTTP/output. | OPEN at this source checkpoint; no status substitution. |

For opponent-first cases, the producer does **not** always wait to E: it targets
E-2 seconds, checks the database wall clock and refuses if serialization misses
E. Other implemented selectors return at/after real E. The fixed suite's native
process startup, beforeAll snapshots, three-second barrier waits and five-second
request/test bounds still need actual proof. A fixture file or handoff timestamp
cannot establish that the opponent entered before E. No width, cap, deadline,
assertion or worker budget was widened.

## Three recorded dependencies and subsequent Parent disposition

At `5a0a2b12`, `overlimit` still requires >1,000 raw rows on a **single** selected
order. Ordinary `observation_append` expands all that order's raw/component/audit
rows through `diagnostic_source_scope`, whose 1,000-key bound refuses before
the required graph can be built. The worker did not add a protected/pre-guard
fixture lane or edit the scope migration/API/suite.

At this checkpoint the suite requires worker-first HTTP409 in both relevant
branches. Real expired classified capture maps `DIAGNOSTIC_INVALID_INPUT` to
HTTP400 (unclassified expired grant denial maps403). Real expired/missing proof
maps `DIAGNOSTIC_NO_ACCESS` to HTTP403. Conflicting input or a generic status set
does not stand in for those ordinary expiry refusals. Both controllers, guards,
contracts and all ten assertions remain unchanged.

During final evidence preparation the coordinator reported Parent disposition
`c0eb1e282013070b1f0582a10515f240986de578:docs/evidence/issue-897/release-parent-a02-disposition-20261102.md`:
a lawful connected >1,000-key union in one unchanged first worker command
(at most ten roots), literal capture400/INVALID_INPUT and proof403/NO_ACCESS
in both branches, and reverse201 are permitted for a **next separately pinned
test+producer correction**. Coordinator explicitly froze this handoff at
`5a0a2b12`; the current allow-list was not expanded. Those corrections are not
implemented or verified here. The three fail-closed selectors remain the honest
historical state of this exact source, pending the next dispatch contract.

## Verification and remaining gates

The [machine-readable verification record](verification-20261102.json) contains
exact shell command strings, argv, UTC start/end, tool-reported duration, output
and exits for the verification/checkpoint commands. Clock stamps have one-second
resolution; Node's own millisecond duration is also retained in test output.
Source-inspection reads are not runtime evidence.

The meaningful isolated CLI test first failed because a PostgreSQL query override
passed resource admission and reached a missing bootstrap path. It did not load
the DB client or contact a service. The red checkpoint preserves that failure.
After URL admission correction, the same test passes. Final serial checks:

- `node --check .../produceOwnershipBatchFixture.mjs`: exit 0.
- `node --test .../produceOwnershipBatchFixture.test.mjs`: 1 test, 1 pass,
  0 skipped, exit 0; runner duration 304.909667ms.
- `git diff --check`: exit 0.
- Explicit source/path equality, 15 accepted pins, 102 migration checksums and
  six recovery hashes: pass as offline audits.

No package check/build, service, container, database connection, HTTP/storage
request, migration/reset, deployment or native work ran. The isolated test
only launches rejected CLI inputs and verifies empty output directories. Port
65379 appears only as a rejected string; it was never contacted. No host-heavy
slot or future PG61149/Redis61148/MinIO61150 resource was started.

Coordinator owns the next bounded correction, diff audit/assembly, affected
package verification, required review, resource reservation, actual ordinary
production, all ten unchanged-or-separately-authorized selector bodies and
cleanup. Runtime row closure, zero receipts, exact trigger restoration, object
and role cleanup, database/Compose destruction and release acceptance remain
unproved. This source handoff is not A-02 PASS, ten-case readiness or milestone
completion. A remains **2 PASS / 9 OPEN**; only Parent accepts. PR904 is unchanged.
