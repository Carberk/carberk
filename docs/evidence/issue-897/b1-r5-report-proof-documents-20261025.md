# R5 report, proof, request and document source checkpoint

For #897 and sole [PR904](https://github.com/Carberk/carberk/pull/904). This is a pushed implementation checkpoint for parent and independent source inspection. No source, runtime, B1, G1 or G3 acceptance is claimed. SQL/E2E/HTTP imports, collections and executions are all **zero**. B5 UNUSED. Product admission remains CLOSED and strict guards dormant. Ordinary genuine-grant automatic201 remains a required R8 positive.

## Provenance and scope

Original corrected R4 base `5ef13b88f1f25cee8d7d709b3ddd3bc99fae85e3`, tree `4e9487de55a83112465f9a0d70fcf7515ff6c37d`; ancestry includes accepted R3 `f375cb4ae6c363e5a724d92ecc7c9f4af5cc5520` and original R4 `5fa15dae`. Host scaffold `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408` is preserved. Reserved branch `agent/issue-897-r5-report-proof-documents-20261025` in owned checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-22258776`.

RED commit `a6de8e72234ff386f5708bea18ea51234c3b2440`; partial source checkpoint `089d537b520fe3685fc96814b6dcdec5e0a628c1`. Accepted bootstrap `f2338add6312496c8ab895f2a553351c89dd9b8d`, tree `ca8b8580b60a3bcd293877143462f1ad5226a8cc`, merged once at `9a2de580119510fe584a938eb47cdd070ddf2b38`, tree `2e56a4ee71fe0f6cef2da41b8b7ee7f6062e911c`, parents `089d537b520fe3685fc96814b6dcdec5e0a628c1 f2338add6312496c8ab895f2a553351c89dd9b8d`. This precedes all R5 profile edits. Final full head/tree/path/log hashes are pinned in the external handoff manifest to avoid a self-referential commit hash.

Original four adapters plus direct R5 companion tests and one finite application test fixture are owned. The additional parent receipt `/tmp/897-r5-additive-dependency-parent-ownership-20261025.json` grants only the forward two-pair allowance, additive schema/profile registration, historical input pins/archives, and shared unlocked R4 identity projection. No ports, index exports, prior SQL/mirrors, Identity production, workers, service/history, generic test framework, CI or scripts outside that receipt changed. Bootstrap dependency paths remain a separate merge delta.

## Stable downstream contract

The actual outer transaction computes all selected page/pair/material/public/actor roots and absent destinations before locks. Mutations supply SQL-projected exact OLD and normalized NEW rows to one `report_change`, `proof_issue` or `proof_consume` receipt and finish it once. Helpers never extend scope after locking. `openReinspection` now explicitly requires the outer prepared receipt and exact report/audit proposal; `reinspectionLocks` and `reinspectionRetry` require an already established prefix. Exact B retry authorizes surviving B and does not re-admit A or require the deleted proof.

`identityProposal(tx, order, observation, pin)` returns the same `{ identity, provenance }` as locked `identity`, including ancestors, descendants, pins and rights, through the same graph algorithm. It uses ordinary SELECTs and grants no authority. `comparisonProposal` and the finite staffing/public-generation byte projections likewise grant none. The real issuer recomputes current Identity bindings, dual reviewer authority, pair facts, pins, rights, provenance and publisher after preparation, then compares exact planned content/bindings/rights before INSERT. No read-prefix-only mutating issuer remains counted as integrated.

Request planning-conflict recovery recognizes only named Prisma P2010 planning conflicts and performs a fresh authorized exact-result read. It never retries source mutation. Unrelated database failures propagate. Ordinary read and finding-evidence upload paths do not acquire new source operation authority. Storage I/O stays outside transactions and current permission/descriptor/epoch/hash/size is rechecked afterwards.

Affected external consumers to inspect without widening this writer: `PrismaDiagnosticDiscovery` owns its complete page prefix before `retainedCandidate`; `PrismaDiagnosticPublic.batch` must own a complete initial multi-listing/report union before successive `loadPublic` calls when the public gate is opened. A missing subset refuses without extending an established prefix. Existing `DiagnosticErasedPredecessorReaders.spec.ts` directly calls supplied-tx report retry helpers with a legacy fake and no prefix; its fixture must adopt the new explicit outer-prefix contract in later test assembly. It was not executed here. The HTTP fake suites `DiagnosticContinuityHandoff`/`DiagnosticScopedDiscovery` were not imported or executed under the HTTP prohibition. These are concrete affected-consumer/test-assembly limits, not a request to alter the accepted kernel or shared contracts.

## Production entrypoint and effect map

`O` below is the new direct offline spec. `S` is the new authored SQL spec. Both live at `apps/api/src/modules/identity/infrastructure/DiagnosticReportsPrepared{,.e2e}.spec.ts`. They compose the actual diagnostic and Identity adapters. This location follows the R4 companion pattern and respects the repository import boundary. The application test fixture is `../application/testing/ReportPreparedHarness.ts`; its protocol and stale-read fault replies make no PostgreSQL concurrency claim.

| Production entrypoint/helper | Outer transaction, effect and complete prefix | Positive / refusal / rollback / race evidence |
| --- | --- | --- |
| Reports.create | Own report_change; report INSERT + draft audit; actor/order/report absent target, pin and FK closure | O original draft+retry/stale/refusal/named write+finish restoration; S current raw binding, guard readiness, draft rollback |
| Reports.save | Own report_change; report state/version/time + finding audit + exact selected verified evidence retirement | O save/retirement exact plan, whole state/evidence/audit rollback; S actual upload/save/retirement positive, protected omission/wrong verb/finish mismatch; both-order real assignment and same-version save waits |
| Reports.transition submit/return/withdraw | Own report_change; exact report UPDATE + audit, existing derived unused-proof invalidation | O full sequence and stale refusal; S complete lifecycle/unchanged raw pins, report guards; finalization rollback exercises same writer |
| Reports.transition finalize | Own report_change; report snapshot/hash/review/time UPDATE, EXACT tk/ru/en artifact INSERTs, audit | O distinct planned artifact ids and write/finish no residue; S distinct locales/epochs/keys/hash/generation, AFTER artifact write and completion-before-finish sentinel rollback, fault-mutated intent finish refusal |
| Reports.correct | Own report_change; absent successor report+audit, current predecessor pins | O exact retry/changed reason conflict; S snapshot+correction positive, write/finish rollback and both-order correction/consume backend waits |
| Reports.read/forOrder | Own complete read prefix, post-wait authority; no intended DML | O draft concealment and document reads; S private released read/list, pin/state preservation |
| Reports.comparison/comparisonProvenance | Own read tx / R4 authorizer-owned delivery phases; both visits, exact selected provenance/public roots before any lock | O complete identity correction projection; S actual comparison provenance disposal during I/O refusal; full public-source races remain listed below |
| Reports.compared/comparisonProposal | Supplied read context / unlocked proposal; common complete pair facts, locked identity after prefix | O no proposal locks/mutations and mapping parity; S real issuer and comparison callers; absent changed subset refuses |
| Reports.observed/reinspectionProposal | Pure observation validation / unlocked supplied-tx exact report+audit bytes | O actual issue/consume/request fixture; S B raw/version/empty findings and immutable pins |
| Reports.reinspectionLocks/reinspectionRetry/openReinspection | Supplied tx asserts existing prefix; writer asserts/adopts proof_consume receipt; never prepares another | O B-only exact binding/proof absence and consume rollback; S consumed proof first, B report second, both audits and surviving-B cleanup/release |
| Reports.reinspect | Pure refusal; no transaction or admission | O/S explicit proofless refusal; never an automatic201 substitute |
| Proofs.issue | Own proof_issue; unlocked complete proposal then exact proof+issuance audit INSERT | O real material-backed private issue, generation/Session/qualification/provenance postprepare refusal, exact write/finish rollback; S reachable material-backed issue, concrete refusals, both-order intake opposition, observed expiry waits |
| Proofs.consume/useHandoff | Own proof_consume; proof consumption UPDATE, B report INSERT, two audits; complete A/B/issuer/session/linker/public/material/absent target union | O exact historical/read/handoff/consume/retry and full restoration; S one-shot positive, duplicate winner both orders, named rollback, correction competition, material cleanup deletes proof and B retry/release survives |
| Proofs.prepareRequest | Own proof_issue/proof_consume request INSERT; actor/session/order/absent request roots | O prepare/recover/discover and finish rollback; S real request immutable binding and result paths |
| Proofs.executeRequest issue/consume | Own outer issue/consume mutation if pending; exact winner/retry uses read prefix, never nested mutation | O both kinds execute/recover/changed command refusal/pending-result rollback; finite DB-protocol winner conflict and unrelated-error propagation; S backend-observed duplicate request winner/read recovery and reachable result-finish rollback |
| Proofs.recoverRequest/discoverRequests | Own retained read tx; complete initial request/proof/report page before authority locks | O pending/result recovery, wrong Session, two-request page; S real completed request discover/recovery |
| Proofs.read/handoffs | Own read tx; historical exact pins/current dual-visit authority; complete initial handoff page | O invalidated historical reading/refused consume, two-proof initial page; S actual unused invalidation/history, two-proof handoff page no state mutation |
| Proofs.retainedCandidate | Supplied tx read, complete pair current reviewer/material/rights validation; no mutation | Exercised transitively by comparison/identity policy; R3 page caller owns union. Dedicated real outer predecessor-discovery race remains a gap |
| Access.load/loadPublic/successor | Caller-owned read or adopted mutation prefix before authority/report/public locks; successor disclosure remains independent | O private closed/draft/stale checks; S released private report/docs and closed public gate. Multi-listing public caller remains future owner concern |
| Documents.list/download | Own read tx / authorization tx + object read + fresh authorization tx; no source DML | O current permission/epoch/bad bytes and positive bytes; S ready worker-boundary fixture, epoch/bytes/session/storage refusal; no public opening |
| IdentityEvidence.identityProposal | Granted unlocked graph read only; locked mapping unchanged/default true | O explicit ancestor/descendant pin/provenance/rights parity, no lock/prefix/mutation queries; real issuer postprepare refusals; S actual material append and locked issuer revalidation |

## Required finite matrix, authored versus executed

All S references are authored and statically checked only. SQL execution is zero for every row, including rows with O execution. Full database invalidation, FK/deferred failure and timing behavior remains unproved. The following maps every item in the supplied requiredCaseMatrix, including remaining gaps.

### positive

| Original requirement | Evidence state | Concrete evidence / gap |
| --- | --- | --- |
| original draft, correction, submit/return/finalize/withdraw | O executed; S authored | Draft/save/transitions/correction positive sequence; exact pins and retry. |
| three PDF intents | O executed; S authored | Three distinct planned intents; real snapshot FK and locale/key/epoch stage assertions. |
| private proof issue/consume and exact B retry | O executed; S authored | Actual material-backed private issuer/consumer; exact surviving B retry, S postcleanup release. |
| request prepare/execute/recover/discover | O executed; S authored | Both kinds prepare/execute/recover/discover, exact winner recovery, altered command refusal. |
| historical proof read and B handoff discovery | O executed; S authored | Historical invalidated proof and usable two-proof handoff page. |
| safe public/private report/document read while gate remains closed | O executed; S authored; public opening deferred | Private released read/document positive; public closed denial is safety evidence only. Public enabled positives and automatic201 remain R8. |

### refusal

| Original requirement | Evidence state | Concrete evidence / gap |
| --- | --- | --- |
| wrong owner/session/order/pair | O partial executed; S partial authored | Wrong request Session and issuer/linker, stale scope and no public/proofless access. Full foreign-owner/order/pair permutations not complete. |
| stale version/changed reason/report/proof/request | O executed; S authored | Stale version, changed correction/consume reason/result selector and exact request binding. |
| unknown/missing/expired/revoked/erased/invalidated proof | O partial executed; S partial authored | Invalidation, issuer Session expiry, consumed one-shot and unknown provenance. Explicit unknown/missing/erased proof permutations remain incomplete. |
| missing retained raw/evidence/provenance or rights expiry | O partial executed; S partial authored | Complete retained-chain/rights checks; provenance cleanup/rights expiry refusal. Individual raw/evidence physical absence variants remain a gap. |
| unassigned/nonqualified reviewer/linker | O partial executed; S partial authored | Revoked grant, expired qualification and distinct issuer/linker. Full unassignment/nonqualified actor permutations remain a gap. |
| public automatic admission and proofless reinspection | O executed; S authored; required201 open | Public gate/proofless refusal; does not satisfy final ordinary automatic201. |
| direct naked SQL insert/update/delete bypassing receipt/guard | S authored only | Protected naked report UPDATE, omitted protected report effect, wrong evidence verb, planned evidence/PDF finish mismatch. Dependency-only naked evidence/worker DML remains intentionally outside source guards. |

### rollback

| Original requirement | Evidence state | Concrete evidence / gap |
| --- | --- | --- |
| report+audit+pins | O executed; S authored | Full report/pins/audit state on named actual write and finish errors. |
| final snapshot+3 PDF intents+audit | O executed; S authored | Final snapshot+all intents+audit and precise current pins restored. |
| correction+audit | S authored only | Actual correction AFTER audit and completion-before-finish rollback; no successor residue. |
| proof+issuance audit | O executed; S authored | Prepared private issuer proof+issuance audit atomic write/finish restoration. |
| proof consumption+report+both audits | O executed; S authored | Proof consumption, B report/pins and both audits restored. |
| request binding and exact result | O executed; S authored | Pending request retained, no partial exact result; named reachable finish rollback. |
| failure at any downstream trigger/FK/deferred audit check leaves no partial rows | Partial S authored; gap | Actual downstream DML and finish faults covered; exhaustive FK failure and public deferred-audit negative reachability remain unproved/not fully authored. |

### races

| Original requirement | Evidence state | Concrete evidence / gap |
| --- | --- | --- |
| same report/version and correction/reinspection races | S authored only | Both-order same-version saves and correction/consume; duplicate report-id versus alternate correction-specific permutations not exhaustive. |
| opposing A/B order and page/pair union lock orders | O page protocol executed; S pair/page authored | Complete initial two-proof page and A/B pair opponents. Dedicated multi-pair page-versus-opponent backend wait remains a gap. |
| same proof duplicate consume | S authored only | Duplicate proof consumption both winners, one B report/audit and exact winner retry. |
| request winner and fallback exact-result recovery | O protocol executed; S authored | Both request kinds real winner wait plus exact-result read fallback. Offline fake is explicitly not concurrency evidence. |
| assignment/qualification/Session expiry after waits | O postprepare faults executed; S authored | Session/qualification/rights expiry at observed preparation wait and real assignment opposition. All eligibility writer permutations remain a gap. |
| material disposal/rights/epoch replacement during read or storage I/O | O partial executed; S authored | PDF epoch/bytes/session/storage and comparison provenance disposal after external read. Full material rights/erase opposing production writers remain partial. |
| listing/business/member/user/account purge opposing public proof/report access | Gap until public/erasure assembly | Listing/Business/member/User/account purge opposition against enabled public proof/read not authored in this R5 companion. Existing broad suites preserved; no fake public positive or ordinary201 refusal substituted. |

### invalidation

| Original requirement | Evidence state | Concrete evidence / gap |
| --- | --- | --- |
| unused proof invalidation from order/report/raw/evidence/provenance/assignment/qualification/grant/user/session changes | O partial executed; S partial authored | Real assignment invalidates unused proof; Session/grant/qualification/material postprepare refusal. Exhaustive persisted raw/evidence/provenance/grant/User/Session invalidation variants remain a gap. |
| public proof invalidation from listing/business/member/user changes | Gap until public assembly | Enabled public listing/business/member/user invalidation matrix remains outside this closed-gate checkpoint. |
| material erasure deletes bound proofs while consumed B retry survives | S authored only | Accepted material cleanup fault deletes bound proof; exact B retry and new B release survive. Full erasure mechanism is not executed. |
| request deletion on report/proof/order erasure | S partial authored | Proof deletion removes issue request through real trigger. Report/order erasure and all FK cascade variants remain a gap. |
| PDF artifact retirement/cleanup and safe replacement | O partial executed; S authored | Ready descriptor/epoch replacement refusal, evidence cleanup retention and final intent exactness. Worker artifact retirement/cleanup execution not owned or run. |
| A-only erasure must not block surviving B exact retry or release | S partial authored; explicit gap | A-only provenance cleanup deletes proof without blocking B retry/release. Full A-only ownership/account erasure with independent B retained findings/documents is still a downstream acceptance gap. |

## Local verification

- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/infrastructure/DiagnosticReportsPrepared.spec.ts src/modules/identity/infrastructure/DiagnosticMaterialPrepared.spec.ts src/modules/diagnostics/infrastructure/DiagnosticPreparedIntake.spec.ts src/modules/diagnostics/domain/DiagnosticReport.spec.ts`: 87 passed across four files, including 38 R5 cases. The R3/R4 helpers and domain regression are unchanged. Named errors, exact state and production adapter calls are the evidence; counts alone are not.
- Focused source/profile Node tests: 12 passed. Exact prior 52 snapshots/additions, every historical SQL/mirror hash, archived assertions, new mirror/checksum equality and new snapshot missing/drift refusals checked. Historical assertions read the original archived schema/profile, not constants asserting themselves.
- Configured API TypeScript 7 `tsc --noEmit`, TypeScript 6 `tsc6 --noEmit`, affected eight-file eslint, API Nest build and runtime-import boundary check: logs and final exit codes in handoff manifest.
- Contract/DB package builds were performed earlier. The DB build used a dummy loopback port1 URL for Prisma generation only, no DB connection/test. Initial missing URL and compiler binary-name attempts were setup failures, not semantic test evidence. RED semantic checkpoint/log remains preserved separately.
- No E2E/SQL/HTTP file was imported, collected or executed, including the new R5 SQL source. Static compiler parsing does not execute the authored suite. No operational/CI/runtime retry authority used.

## Complete effect and reachability inventory

The following is the preserved single dependency note plus its acknowledged complete addendum. The original finding remains historical; only its implementation consequences are superseded by this source checkpoint. No additional shared scope beyond the finite parent grant was found. The original dependency note is also archived verbatim at `r5-report-source-effects-20261025/original-shared-dependencies.md`, SHA256 `b7555a3d4f98c8a057196f47d6a5251a9255e3b1dfe22144874f88fcf2fd929b`.

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

## Complete outer-effect inventory, 2026-10-25 continuation

This addendum supersedes the earlier pending implementation consequences, while preserving the original dependency finding. Parent granted the two finite dependencies in `/tmp/897-r5-additive-dependency-parent-ownership-20261025.json`. R5 checkpointed `089d537b520fe3685fc96814b6dcdec5e0a628c1`, then merged accepted bootstrap `f2338add6312496c8ab895f2a553351c89dd9b8d` exactly once at `9a2de580119510fe584a938eb47cdd070ddf2b38`, before profile edits. No further shared scope was found in this complete inventory. This is source inspection, not SQL validation.

Approved design: [ADR0108](https://github.com/Carberk/carberk/blob/5ef13b88f1f25cee8d7d709b3ddd3bc99fae85e3/docs/adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md), [ADR0109](https://github.com/Carberk/carberk/blob/5ef13b88f1f25cee8d7d709b3ddd3bc99fae85e3/docs/adr/0109-authenticated-ownership-grants-for-automatic-diagnostic-continuity.md), prepared command contract `/tmp/897-b1-prepared-source-command-contract-20261023.md`, full R5 required matrix `/tmp/897-r5-readonly-inventory-20261025.json`. Admission remains CLOSED until R8, including the outstanding ordinary automatic201 positive.

| Outer operation and all direct writes | Trigger and FK effects within the same transaction | Existing source support |
| --- | --- | --- |
| create/correct: one report INSERT, one audit INSERT | Order/template/raw/evidence/predecessor RESTRICT FK checks; original/first-order/predecessor unique checks; current raw/evidence pin selection, immutable snapshot/audience/correction checks. Report AFTER trigger invalidates any affected unused pair proofs. | report_change already allows report/audit INSERT. Kernel derives invalidation and locks full FK/retained closure. |
| save: report UPDATE of state/status/version/updatedAt, one finding audit INSERT; precisely each actually selected removed verified report evidence UPDATE state=cleanup_pending/cleanupRequestedAt | report identity/snapshot/raw/evidence/request immutable guards; evidence immutable object identity check; report source invalidation of unused proofs. Ordinary finding evidence has no identity-provenance invalidator. No object DELETE/PUT. No request erasure occurs because erasedAt and attribution remain unchanged. | report_change plus approved evidence UPDATE only. Kernel derived proof invalidation, unchanged closure/finish. |
| submit/return/withdraw: one report UPDATE and one review audit INSERT | Same report pin/snapshot/lineage/request guards, report invalidation. No artifact writes for these actions; withdrawal retains snapshot/artifacts. | Existing report_change, existing derived invalidation. |
| finalize: one report UPDATE including exact normalized state/status/version/updatedAt/snapshot/snapshotHash/finalizedAt/withdrawal fields, exactly THREE PDF INSERTs tk/ru/en, one review audit INSERT | Report guards and unused-proof invalidation as above. Every PDF checks existing released report snapshot/hash, locale/state/hash/objectKey constraints, report FK, unique id/objectKey and unique report/locale/renderer/generation. No storage I/O, worker lease or cleanup mutation. | report_change plus approved PDF INSERT only. No additional operation/table allowance. |
| issue or executeRequest(issue): one proof INSERT, one issuance audit INSERT | Proof predecessor report and candidate order RESTRICT FKs; exact bound A/B raw/snapshot/version, distinct issuer/linker and rights/method constraints; request binding trigger if requestId set; deferred PUBLIC issue-audit check requires audit.id=proof.id. Request already exists and is not updated. | proof_issue already permits proof/audit INSERT. All pair/material/authority/public/request roots included before receipt. |
| consume/useHandoff/executeRequest(consume): proof UPDATE consumedReportId/consumedAt FIRST, one B report INSERT SECOND, reinspection-created audit INSERT, consumption audit INSERT | Proof immutable bound content and one-shot consumption guard; B report current raw/evidence pins, immutable request binding, proof-bound lineage and FK/unique checks; B report AFTER invalidates other unused proofs but does not invalidate consumed proof. Deferred PUBLIC proof/report/both audits atomic check uses consumption audit.id=B report.id. No A report/pin update. Request row already exists, no update. | proof_consume already permits exact proof UPDATE/report+audit INSERT. Kernel derives other unused proof invalidation. Supplied-tx report helper asserts/adopts actual outer receipt, never opens/finishes another. |
| prepareRequest(issue/consume): one request INSERT | actor/session/order CASCADE FKs, immutable session-user/order binding trigger, kind check; no command or result staged. | Existing proof_issue/proof_consume request INSERT. |
| report/document/comparison/history/handoff/request reads and exact retries | No intentional source DML; one initial complete read prefix per transaction. Public/current pair/authority/material/rights revalidation after waits. PDF/provenance delivery repeats current authorization/descriptor/epoch/pin checks after external bytes read and verifies bytes. Ordinary evidence upload remains R4-owned read-prefix evidence writes. | Existing read prefix; no mutating issue path is counted as read-prefix integration. |

Exact accepted predicates and effects traced once:

- Kernel `20261023130000_diagnostic_source_kernel/migration.sql:142-145,180-205`: finite allows and exact OLD/normalized NEW row parser. New forward `20261025010000_diagnostic_report_source_effects` delegates existing function and adds exactly evidence UPDATE/PDF INSERT for report_change.
- Kernel `:254-315`: retained graph and full direct/FK/proof/public closure, including absent planned destinations; `:369-422` invalidation classification/effects; `:482-502` complete effect assertion at receipt deletion. Effective preparation is `20261024020000_campaign_preparation/migration.sql:325-358`, fresh post-wait rediscovery and parse, no extension.
- Effective report pin/lineage/snapshot guard: `20261022180000_diagnostic_public_continuity/migration.sql:57-79`. Raw pin selection/immutability `20261021120000_diagnostic_report_identity_pin/migration.sql:13-35`. Structured leaf pin/immutability `20261021130000_diagnostic_identity_evidence/migration.sql:185-209`. Evidence identity/PDF snapshot checks `20261015190000_diagnostic_reports/migration.sql:134-146`.
- Effective source invalidator `20261024010000_diagnostic_source_guard_repair/migration.sql:116-140`: report changes UPDATE only unused/uninvalidated proofs. Raw/identity/provenance erasure or cleanup also DELETE bound proofs. This latter path is an opponent/fault fixture, not an extra R5 finalization/issuance write.
- Public deferred atomic assertion `20261022180000_diagnostic_public_continuity/migration.sql:115-130`, issue audit.id=proof.id; consumed report binding and both audits required. No public guard activation is introduced.
- Requests `20261023110000_diagnostic_continuity_requests/migration.sql`: request proof/report INSERT binding and immutable command checks; request DELETE on proof/report deletion, report attribution/erasure, order erasure, actor/session/order FK cascades. R5 ordinary operations cause none of these deletions. Existing purge/FK effect wrappers own opposing erasure/deletion paths; not broadened here.
- Campaign/source receipt INSERT/DELETE, lock-only preparation records, completion and deferred must-finish checks remain existing kernel protocol internals, not new planned product effects. Audit rows reference existing center/order/actor; none of these ordinary R5 entrypoints deletes an FK parent or rewrites a key.

Each PDF plan preallocates a different id and epoch, fixed reportId/snapshotHash/locale/rendererVersion, generation=1, state=pending, exact `diagnostic-pdf/<report>/<artifact>.pdf`, attempts=0, createdAt, and explicit null sha256/sizeBytes/retryAt/failureCode/leaseUntil/verifiedAt/cleanupRequestedAt/cleanupCompletedAt. SQL normalizes complete registry fields. Post-wait production code recomputes current state, evidence, publisher and renderer before writing.

Fixture stage assertions in the authored R5 SQL source: ordinary initial rows are seeded with only dormant source/campaign protocol guards disabled, then all enabled; integrity pin/lineage/provenance/hash/FK/unique checks never disabled. Raw observation hash is computed from exact order/version/observation; report is created by production after material append, selecting the actual current raw/evidence leaf. Template has a valid brakes check; physical authorization, issuer reviewer/reception/technician grants, dual assignments, qualifications and live Sessions exist. B linker is a distinct qualified actor; service rights and verified object descriptors come from actual stage/upload/append. Production submit/finalize creates A snapshot and three PDF intents before issuance. Named AFTER actual-write and BEFORE finish-delete sentinels require their specific error and full state restoration. Finish sentinel sorts after existing completion and proves that point was reached. Real opposing intake/report/proof calls assert actual pg_blocking_pids waits. Session and qualification wait fixtures shorten only their specific cutoff through existing prepared fixture operations before issuance; stage assertions require the other Session/qualification/material fences still live. Rights expiry has independently live Session/qualification fences. SQL fixture reachability is authored and statically typechecked only, never execution evidence.

Selective-guard consequence checked against `20261024010000_diagnostic_source_guard_repair/migration.sql:7-33,93-112`: ordinary finding evidence and PDF artifacts are dependency-only DML, deliberately absent from strict presence/effective guard specs, while their planned projections are checked at finish. R5 does not add source guards to ordinary upload/worker writes. Fault omission must target an omitted protected report write; evidence/PDF planned-byte mismatches must assert `diagnostic_source_final_effect` at finish, not invent `diagnostic_source_effect_mismatch` for an uninstalled row guard. Wrong evidence verb is refused by exact finite row parse. This changes only authored test assumptions, not the accepted kernel or any new shared scope.
