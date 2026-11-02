# Issue 935 behavior RED checkpoint

Production source is unchanged from `a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568`.
Preparation checkpoint is `06b2110c3f26c5beb54ca514269ab9b7a785ac48`.

The exact API selector ran with `AUTO_TM_TEST_DATABASES=off` and maxWorkers 1.
The initial `repair-api-red` result contained two new fixture errors: its storage
boundary returned a mutable grant reference where a real Prisma read returns a
detached result. The fixture was corrected to clone that read without changing
any assertion. Its original output remains preserved and is not the definitive
RED result.

`repair-api-red-confirmed` exits 1 with 56 failures and 168 passes across 224
tests. The new real `PrismaStaffAuthority` boundary suite has 13 cases, nine
behavior failures and four passes. Eight failures allow an expired injected
Session/elevation at the exact deadline or just after it; the ninth refuses
valid injected authority solely because ambient time is later. Just-before
positives preserve earlier mutation/declaration timestamps and named audits.
The real source-command helper and policy run against the database boundary;
no repository module is mocked. These tests do not claim real SQL locking.

The other 47 failures occurred in unchanged diagnostic tests before the
production fix: continuity handoff 27, scoped discovery 13, classified capture
6 and erased-predecessor readers 1. The memory boundary at
`packages/db/src/testing/DiagnosticMemoryDatabase.ts:102` deliberately throws
`Prepared source acceptance requires real PostgreSQL`. Other observed responses
include 403/500 rather than original positives. This is not behavior RED for the
clock repair and must not be called a pass or bypassed. The wider fixture/source
boundary remains read-only; any repair or real PostgreSQL proof belongs to a
separate coordinator contract. The exact full selector remains a required,
currently failing verification gate.

`repair-admin-red` exits 1 with two failures and three original passes. Production
host-cookie/configured-origin forwarding uses the old fixed repository mocks,
and a missing framework cookie still produces an upstream 200. The new tests
exercise actual proxy outcomes through framework cookie/environment/network
boundaries. The existing repository mocks remain only in this RED checkpoint;
the bounded repair removes them without changing the assertions or route.

All three command JSON files retain full argv, source HEAD, permitted environment
overrides, UTC start/end, durations, exit codes and SHA-256 values for their
unedited raw logs. No production fix precedes this pushed RED checkpoint.
Independent source-readiness review and every DB/runtime gate remain OPEN.
