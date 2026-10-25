# R5 concrete shared dependencies

Accepted dependency base is `5ef13b88f1f25cee8d7d709b3ddd3bc99fae85e3`, tree `4e9487de55a83112465f9a0d70fcf7515ff6c37d`. R5 branch `agent/issue-897-r5-report-proof-documents-20261025`, owned checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-22258776`. No shared SQL, R4 helper or port edit is made by R5. This note requests narrow dependency work, not a design change.

## 1. Complete existing report_change effects

At the accepted SHA, `packages/db/prisma/migrations/20261023130000_diagnostic_source_kernel/migration.sql:142` defines:

```sql
WHEN 'report_change' THEN t IN ('diagnostic_reports','diagnostic_audits') AND v IN ('insert','update')
```

The effective wrapper in `20261024040000_diagnostic_intake_effects/migration.sql:112-117` delegates other operations to this predicate. `diagnostic_source_parse` in the kernel at lines 180-186 rejects any row whose `diagnostic_source_allows(op,table,verb) IS NOT TRUE`, with exact `diagnostic_source_row`.

Existing production effects that cannot be declared:

- `PrismaDiagnosticReports.save`: removed finding evidence becomes `diagnostic_evidence.state='cleanup_pending'`, with exact `cleanupRequestedAt`, only for the actual selected verified rows on that report. Its exact OLD projection and normalized NEW projection must accompany report state/version/updatedAt and finding audit.
- `PrismaDiagnosticReports.transition` finalize: INSERT exactly three `diagnostic_pdf_artifacts` rows for tk/ru/en. Each needs preallocated id and epoch, reportId, snapshotHash, locale, rendererVersion, generation=1, state=pending, exact objectKey, attempts=0, exact createdAt and explicit null descriptor/lease/retry/cleanup fields. The report final state/snapshot/hash/finalizedAt/version/updatedAt and review audit are in the same outer receipt. Kernel registry already includes artifacts at rank11 and evidence at rank11. No worker lease/cleanup ownership transfer is requested.

Smallest additive solution: a new forward replacement of the existing allows function, delegating all existing behavior, adding only `report_change + diagnostic_evidence + update` and `report_change + diagnostic_pdf_artifacts + insert`. Keep all existing exact row parsing, closure/FK ordering, selective guards and finish checks. No new operation, lock-plan API, nested receipt, generic exemption or historical migration rewrite. Parent owns forward migration/mirror/profile coordination. R5 then supplies the exact row plans and actual writes under the one report_change receipt before any authority locks.

Current consequence: R5 converts independent draft/correction/non-retiring saves/submit/return/withdraw. Evidence-retiring saves and finalization keep their existing path and are explicitly NOT receipt-integrated. Offline business behavior/three intents can pass while strict activation remains blocked. No guard activation or source acceptance is claimed.

## 2. Unlocked material projection for issuance proposal

Accepted R4 `PrismaDiagnosticIdentityEvidence.identity` at line331 returns:

```ts
Promise<{ identity: D.DiagnosticComparisonIdentity; provenance: string[] }>
```

It calls private `graph` at line336. `graph` at lines231-235 acquires `FOR SHARE` on raw, identity evidence and provenance before returning the complete graph. R5's exact proof content and bindings require that identity projection, full correction chain, immutable pins and rights-derived facts before `diagnostic_prepare_source`. Running existing `identity` during proposal planning would take managed locks first; preparing after it would violate the accepted protocol. A read prefix around mutating `issueIn` is NOT proof_issue integration.

Smallest R4 additive method, with existing domain types and exact existing mapping:

```ts
identityProposal(
  tx: Prisma.TransactionClient,
  order: Prisma.InspectionOrderGetPayload<object>,
  observation: Observation,
  pin: { id: string; hash: string } | null,
): Promise<{ identity: D.DiagnosticComparisonIdentity; provenance: string[] }>;
```

`Observation` is the adapter's existing alias. This method performs only ordinary unlocked SELECTs, no read prefix, authority, row/advisory locks, mutation or receipt. It uses the same complete graph, correction traversal, retained pin/hash/provenance checks and rights policy as `identity`. Keep `identity` as the locked reader after the outer prefix. Implement by sharing the existing graph/mapping algorithm with a finite unlocked graph read mode, not copying a second policy implementation. The proposal is never an authorization certificate and never returned to an API caller on its own.

R5 will compute unlocked pair/staff/public facts using ordinary SELECTs plus this projection, preallocate proof/audit/request IDs and exact content/bindings/times, and SQL-plan proof+issuance-audit INSERTs. Then the sole outer proof_issue receipt locks the complete initial pair/public/material/authority/absent-result union; existing live `compared`/identity, staff bindings, dual reviewer, current B publisher, pair, raw/evidence/provenance/rights checks run again after waiting. Compare exact proposed content/bindings to current facts, refuse stale plans without extension, and INSERT the predeclared bytes. Execution-time rights remain checked after waits. No new source operation or public port/API change is required.

Current consequence: `issue`, executeRequest issue and downstream first-issuance positives remain explicitly pending this projection. Their historical read prefix/order fix is independent work, not completion. Private consumption, historical reads, requests and handoff discovery can proceed independently. Automatic admission remains CLOSED until R8, and ordinary automatic HTTP201 remains a required final-phase positive, never replaced by a refusal.

SQL/E2E/HTTP imported, collected or executed: zero. B5 unused. Parent source gate and later runtime evidence remain separate.
