# A-03 caller, namespace, privacy and erasure matrix

Date: 2026-10-30
Status: **FAIL / OPEN, read-only preparation only**
Issue: #897, Milestone A
Task: A-03 caller/namespace/privacy/erasure matrix evidence

This packet records source inspection and historical evidence. It does not certify A-02 or A-03 PASS. A-02 remains FAIL/open: restricted preparation is 12/12, while all ten ownership, capacity, rollback and race bodies were skipped because the ordinary private fixture manifest was absent. A-01 Standards S1 and A-11 Spec remain open. B prototype work and analytics activation are excluded.

## Immutable identity and source comparison

| Item | Recorded value |
|---|---|
| Worktree | `/Users/bagtyyar/.t3/worktrees/carberk/t3-bef1130f` |
| Branch | `t3/a-03-caller-privacy-matrix-evidence` |
| HEAD | `68b0d8c65191a92cd75eb2b9a53f850a07c6e690` |
| Milestone A candidate source base | `52d901c50af1dde97ea22bda8efb1fdf21f169b1` |
| Coordinator checkpoint | `68b0d8c65191a92cd75eb2b9a53f850a07c6e690` |
| Task identity | A-03 research/evidence preparation, no runtime continuation dispatched |
| Writable paths used | This directory only |
| Runtime resources | None created, reserved or used |
| Source/test/config edits | None |

The source comparison `git diff --exit-code 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD -- apps packages scripts package.json pnpm-lock.yaml pnpm-workspace.yaml` exited 0 with no output. The comparison `git diff --name-status 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD` showed only documentation/evidence additions and one evidence-document modification. The coordinator checkpoint is therefore source-equal to the candidate for this matrix. This does not make historical runtime receipts candidate proof.

## Exact commands used

All commands were read-only inspections or Git comparisons. No test, build, database, Redis, object storage, API, Railway, native, device, Docker or timing command ran.

```sh
pwd
git rev-parse HEAD --abbrev-ref HEAD --show-toplevel --git-dir
git rev-parse 52d901c50af1dde97ea22bda8efb1fdf21f169b1 68b0d8c65 HEAD
git diff --name-status 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD
git diff --name-status 68b0d8c65 HEAD
git diff --name-status
git diff --cached --name-status
git diff --exit-code 52d901c50af1dde97ea22bda8efb1fdf21f169b1 HEAD -- apps packages scripts package.json pnpm-lock.yaml pnpm-workspace.yaml
rg --files docs/evidence/issue-897 .claude/skills | rg '897|research|evidence'
rg --files docs/evidence/issue-897 | rg '(r7c|r8-|r4-|r6a|privacy|erasure|namespace|caller|a-01|a-11)'
rg -n 'A-03|R7c|R8|R4|R6a|A-02|52d901c|68b0d8c65' docs/evidence/issue-897 docs/prd .claude --glob '*.md' --max-count 15
rg -n 'R7c|R8|R4|R6a|namespace|privacy|erasure|matrix' docs/evidence/issue-897/milestone-a-execution-20261029.md
rg -n '^(export |  (async |private |public )|async function|function)|preparation_|scope_changed|namespace' apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.ts apps/api/src/modules/diagnostics/infrastructure/DiagnosticPublicBindings.ts apps/api/src/modules/diagnostics/infrastructure/DiagnosticReportAccess.ts --max-count 45
rg -n '^\s*(it|test)(\(|\.each)' apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.e2e.spec.ts --max-count 200
rg -n '^\s*(it|test)(\(|\.each)' apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.preparation.e2e.spec.ts --max-count 200
rg -n '^\s*(it|test)(\(|\.each)' apps/api/src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts --max-count 200
rg -n '^\s*(it|test)(\(|\.each)' apps/api/src/modules/identity/infrastructure/DiagnosticMaterialPrepared.e2e.spec.ts --max-count 200
rg -n '^\s*(it|test)(\(|\.each)' packages/db/tests/service-history-callers.e2e.spec.ts --max-count 200
nl -ba apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.ts | sed -n '68,430p'
nl -ba apps/api/src/modules/diagnostics/infrastructure/DiagnosticReportAccess.ts | sed -n '1,90p'
nl -ba apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts | sed -n '35,190p'
nl -ba apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticEvidence.ts | sed -n '28,130p'
nl -ba apps/worker/src/jobs/diagnosticAccountErasure.ts | sed -n '1,115p'
nl -ba apps/worker/src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts | sed -n '1,190p'
```

Historical files under `/tmp` were read with bounded `sed`/`rg` only. They are cited below as receipts. No `/tmp` file was modified.

## Source findings

* `PrismaUploadClaims` prepares the complete discovered claim and cleanup union before advisory locks, rechecks the live receipt, and refuses missing, uncovered or changed scope. The relevant source is `apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.ts:75-108,111-132,135-196,208-428`. This is source evidence, not PostgreSQL wait or trigger evidence.
* `DiagnosticPublicBindings` owns publisher/listing pair locks and candidate checks at `apps/api/src/modules/diagnostics/infrastructure/DiagnosticPublicBindings.ts:18-68`. `DiagnosticReportAccess` separates private subject reads from public reads and successor lookup at `apps/api/src/modules/diagnostics/infrastructure/DiagnosticReportAccess.ts:13-64`.
* `PrismaDiagnosticIdentityEvidence` reads the actor/material prefix, checks rights and expiry, fences cleanup with an epoch, and rechecks before storage work at `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts:46-95`. `PrismaDiagnosticEvidence` rechecks epoch, rights, report audience and erasure after asynchronous storage reads at `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticEvidence.ts:35-121`.
* `diagnosticAccountErasure` locks the commissioner order set, clears report pins, removes unconsumed private continuity proofs, fences identity provenance and clears restricted data before intake erasure at `apps/worker/src/jobs/diagnosticAccountErasure.ts:1-80`. The worker source does not prove a completed restricted-role runtime.
* `PrismaServiceMessaging` uses actor/session validity, purpose, assignment, order/delivery state and campaign admission for service callers. The implementation is at `apps/api/src/modules/service-messaging/infrastructure/PrismaServiceMessaging.ts:30-210`; the prepared transaction seam is `apps/api/src/modules/service-messaging/infrastructure/ServicePreparation.ts`.

## Disposition vocabulary

`SOURCE-OBSERVED` means the current candidate source contains the inspected rule. `HISTORICAL-PARTIAL` means a dated receipt reports a result on another source/checkpoint or only a scoped subset. `MISSING` means the required cell has no accepted runtime result. `SETUP-BLOCKED` means a required body could not reach its assertions because the fixture or dependency was unavailable. None of these statuses is A-03 PASS.

The original A-03 gate text is preserved verbatim: "PASS only if every required cell is green and private bytes/IDs remain inaccessible across namespaces; FAIL on any unauthorized read, identity leak, or untested required cell." This packet records multiple untested required cells, so the gate is FAIL/open.
