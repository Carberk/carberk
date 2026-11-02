# PR #904 audit reconciliation, 2026-11-02

The independent audit reviewed PR head `b6dac5d17c140c8fd307a24df56d4a82ed070625`
against base `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. It did not review
the newer A candidate. Its [report](a-pr904-audit-20261102/report.md), reviewer
provenance, Standards/Spec receipts and both evidence manifests are preserved
byte-for-byte in `a-pr904-audit-20261102/`. All eight hashes in the final audit
manifest were verified. [Readback commands and hashes](a-pr904-audit-reconciliation-20261102.json)
record this reconciliation. No exploit or disclosure was demonstrated; the
five P1 findings are acceptance blockers, not vulnerability ratings.

Current candidate documentation HEAD before reconciliation is
`55ce035491847fb14445c9be2828d3d06c0c39c6`, tree
`fc06e3f3d91c9e9de9c23cb12b58a2ce580bbf35`. Its entire non-documentation tree
matches accepted assembled source `4b2c8a6f6161f9c825945637f6f848c64adeb145`.
The audit's separately named `4feaebd70` candidate is an earlier docs checkpoint
of that same source. PR904 remains OPEN/DRAFT at its separate audited head;
no PR ref, hosted check, test, build, service, native or runtime action ran in
this reconciliation. The audit's 28 whitespace diagnostics remain tooling
notes, not additional Standards findings.
Staging the preserved raw `diff-check.txt` receipt reports four inherited
trailing-space lines; those bytes stay intact to preserve its verified hash.
Authored reconciliation files pass the separate diff/documentation checks.

## Per-finding disposition

AUDIT IDs below belong to the supplemental PR audit. In particular,
**AUDIT-S2 is not the earlier A-01/A-09 S2 composition finding**.

| Audit finding | Current disposition | Exact-candidate evidence and remaining boundary |
|---|---|---|
| AUDIT-S1, P2, ambient UI IDs/time | Resolved on current candidate; historical/open on the unchanged PR head | Required child dependencies and production workspace bindings are present. A-01 r3 and A-09 verify source `4b2c8a6f` with 334 affected tests, both compilers, lint/build/runtime. Full non-doc equality to current HEAD preserves that bounded result; it has not been published to PR904. |
| AUDIT-S2, P2, staff adapter execution clock | Still open; accepted into bounded A remediation by Parent | `PrismaStaffAuthority.ts:9,66` still accepts only Prisma and uses `new Date()` after locks. It and `ChangeStaffGrant.ts` are byte-identical to the audited PR. Preserve fresh post-lock authorization by injecting/sampling an execution clock after locks; never substitute the earlier mutation timestamp. Prior staff/API results and A-09's UI fix do not close this issue. |
| AUDIT-S3, P2, repository module mocks in proxy tests | Still open; accepted into bounded A remediation by Parent | `evidence-proxy.spec.ts:5-6` still mocks `@/lib/cookies` and `@/lib/api-config`, byte-identical to the PR. Retain real wrappers and substitute framework-cookie/environment/network boundaries. No leak is inferred. |
| Optional lifecycle duplication smell | Historical, non-blocking observation | The audit explicitly calls this a heuristic. No extraction, extra criterion or unrelated refactor is authorized. |
| AUDIT-SP1, P1, restoration profile | Still open, A-04 | `scripts/staging-schema.mjs` is unchanged from the PR. Schema hash and all four omitted migration checksums still match A-04's retained RED on the 102-migration tree. The bounded profile-repair plan is unlaunched; validator refusal must remain intact. |
| AUDIT-SP2, P1, restricted ownership/capacity/rollback/races | Still open, A-02; latest off-candidate correction needs fresh exact-candidate checks | Preserve the original 12/12 restricted preparation and ordinary full100 results. The original ten bodies were skipped. Returned source `9e48011e54a23822504d9cb5ae5f6d7a9f96028e`, evidence `91676477a6812e16d5813c64454948d095b63eb1`, is unassembled and only offline-checked. Corrected command-union and literal expiry criteria are Parent-authorized, but no real fixture, ten-case run or cleanup result exists. |
| AUDIT-SP3, P1, caller/namespace/privacy/erasure | Still open, A-03 | R7c/R8/R4/R6a matrix remains historical/partial. Source checks and diagnostic-only positives do not establish every candidate-bound privacy cell. |
| AUDIT-SP4, P1, lawful reset lifecycle/restoration | Still open, A-04 | Retained 181/181 offline, 51/52 controller/ledger and 37/59 Railway-focused results do not establish real executor expiry/rollback, post-disposal unfinished commit, provider exclusion, storage drain/horizon/handoff or hosted restoration. SP1's profile repair alone cannot close these gates. |
| AUDIT-SP5, P1, integrated staff/release package | Still open, A-05/A-06/A-07/A-08/A-10/A-11 | Protected multi-actor and native EN/RU/TK journeys, exact-SHA combined CI, deployed/restored state, exact APK/AAB mapping and protected delivery remain unproved. Focused UI evidence and this audit confer no release acceptance. |

Existing receipts: [A-01 r3](a-01-s2-standards-review-20261030.md),
[A-09 verification](a-09-s2-assembled-verification-20261030.md),
[A-02](a-02-worker-restricted-20261030/receipt.md),
[A-03 matrix](a-03-caller-privacy-matrix-20261030/matrix.md),
[A-04](a-04-reset-runtime-20261030/receipt.md), and
[A-11 r4](a-11-s2-spec-review-20261030.md).

## Gate accounting and continuation

The reconciliation originally retained 2 PASS / 9 OPEN under its read-only
brief. Parent then accepted the two still-present documented issues into A
remediation and authorized continuation after this document is committed and
pushed. Therefore **A-01's current overall Standards gate reopens for
AUDIT-S2/S3**. Its earlier independent PASS remains valid for its recorded
paths/findings/SHA; it is not a supplemental audit PASS. A-09's previously
accepted bounded S1/S2 fix remains PASS. Current count is **1 PASS / 10 OPEN**.
No existing evidence is erased or rerun by this accounting change.

A remains unaccepted. PR904 stays separate OPEN/DRAFT; no publication, PR-ref
change or merge is part of this repair/evidence stage. B implementation, C and
C-Activation remain gated. Future source fixes need separate bounded contracts
before dispatch, and affected verification plus fresh independent exact-SHA
Standards/Spec review. Runtime needs its own resource/timing/cleanup contract.

The single next coordinator action is a read-only pre-assembly audit of the
returned A-02 source `9e48011e5` and evidence `91676477a` against the recorded
allow-list, accepted pins, Parent-corrected contract and preserved recovery.
Prerequisites are the clean immutable handoff, exclusive assembler ownership,
verified xhigh/default selection and this committed/pushed reconciliation.
Only an audited handoff may proceed to serialized assembly; fresh resources,
including PG61149/Redis61148/MinIO61150, stay unstarted and port65379 forbidden.
