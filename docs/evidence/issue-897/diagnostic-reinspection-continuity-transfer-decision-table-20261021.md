# D2/D3 continuity and transfer decision request

PROPOSED handoff for #914/#897, sole draft PR #904. Base `ca264c50f9cb89ade76065a0b83ec29a7deb88d3`; reservation `agent/issue-914-continuity-transfer-decision-table-20261021` pushed before writing. Root owns record/integration. No implementation or test assignment.

## Authority and evidence

Settled: [ADR-0104 decision](../../adr/0104-center-diagnostics-with-private-and-public-reports.md#decision), [feature 50:106–114](../../prd/features/50-reports-tier.md#L106), [flow 66:69,99,112](../../prd/flows/66-diagnostic-inspection.md#L69) require fresh observations, manual fallback, original audiences, independent public consent/association and private isolation. Private continuity requires the same nonnull commissioner. No private/public linking.

Prior handoffs remain authoritative evidence: [contract](diagnostic-reinspection-contract-20261021.md), [green plan](diagnostic-reinspection-green-slice-plan-20261021.md), [incremental disposition](diagnostic-reinspection-incremental-disposition-20261021.md), [source slice](diagnostic-reinspection-source-slice-20261021.md). Do not treat their temporary scope as policy.

Current [admission:203–227](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L203) and [INSERT guard](../../../packages/db/prisma/migrations/20261021100000_diagnostic_reinspection_lineage/migration.sql#L23) admit only equal normalized observed VIN, same Listing, same public commissioner. [Association:126](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L126) checks current Listing digest. [Observation:203–220](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts#L203) overwrites mutable order identity, not durable cross-visit proof. [Joined acceptance:279](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReports.e2e.spec.ts#L279) covers the narrow positive. Root reports DiagnosticReports 13/13 hosted PASS on published `eb60330a`, D4 included; two concurrency tests at this base remain runtime UNKNOWN. No CI inspected.

## Decision matrix

A is predecessor; B is the new physical visit. All positives require same audience, eligible unconsumed A and fresh B authorization/observations. “Proof” means option 1 below, never matching freeform references.

| Case | Public recommendation | Private recommendation | Status |
|---|---|---|---|
| Equal trimmed uppercase observed VIN; unchanged identity/commissioner | Admit with captured VIN proof | Admit with VIN proof, same commissioner | Public narrow path exists; durable proof/private admission new |
| Manual/manual | Require pair proof | Same, same commissioner | Manual fallback settled; proof new |
| Manual/VIN, either direction | Require pair proof | Same, same commissioner | New continuity rule |
| Corrected/mismatching VIN | Pair proof must establish legitimate recording error; unresolved mismatch refuses | Same, same commissioner | New correction rule |
| Proven different vehicle | Refuse, even with equal VIN text | Refuse | Follows explicit vehicle matching |
| Changed Listing identity or seller, including another Listing id | Equal VIN alone insufficient; pair proof plus fresh association/consent | Listing gives no authority or proof | Revalidation settled; transfer admission new |
| Private without common Listing | Inapplicable | VIN or pair proof; same commissioner | Audience settled; admission new |
| Different employee, same Dealership | Current publisher authority and fresh consent; pair proof if commissioner changed | Different commissioner refuses | Membership is not commissioner equality; admission new |
| Seller transfer/public commissioner change | Pair proof and current publisher authority; no inherited consent | Different commissioner refuses | New public transfer policy |
| Private/public in either direction | Refuse | Refuse | Settled |

## Two options; recommend 1

1. Pair-bound continuity proof. Capture an immutable identity record for each visit, with method, normalized VIN or documented physical identifiers, provenance references and hashes. Never equate `manualReference`, Listing, commissioner or consent with continuity. Automatic equal-VIN comparison is allowed only without contradictory evidence or identity/ownership change. Otherwise require explicit comparative attestation.

   Proposed issuer: a currently qualified reviewer assigned independently to both orders, distinct from B's linking technician. Existing reviewer status does **not** currently confer this attestation power. Issue only after comparing retained A identity material with B's physical observation; insufficient material means an unlinked new report. A correction records original and corrected values, explanation and supporting references without rewriting A.

   Durable proof contains id/policy version, A report id/snapshot hash/identity-record hash, B order id/version/identity-record hash, audiences/commissioner references, public Listing identity/ownership digests, comparison result, rationale, restricted provenance references, issuer and timestamp. B's strict reinspection input adds the proof id. Issuance and consumption receive audit records; report creation binds proof atomically and preserves exact retries.

   Admission rechecks current technician, issuer identity/session, qualification and both assignments, plus locked candidate versions, audiences, commissioner constraints, erasure, successor uniqueness and public publisher authority/consent/association. Changed candidate, observation, identity, ownership, authorization or assignment invalidates an unused proof. Later changes fence access/release as applicable, never rewrite or retroactively break the historical link.

2. Require equal VIN forever. Smaller permission/storage footprint, but manual and legitimate corrected-identity continuity stays unavailable. This reduces accepted manual-reinspection scope and also requires founder approval.

## Privacy, lifecycle and bounded acceptance

Proof/identity records are readable only by independently authorized staff on both orders, never public readers or commissioners through lineage. Linking grants no old report, PDF or evidence access; D5 minimum disclosure and uniform non-disclosing refusals remain. B releases independently. Historical bytes, audience and commissioner attribution remain unchanged; erasure may sever personal linkage, never replace A's commissioner with B's.

| Positive acceptance | Negative acceptance |
|---|---|
| VIN proof; documented manual/manual and manual/VIN | Same reference/Listing/consent alone; different vehicle |
| Supported identity correction; revalidated public employee/seller transfer | Unresolved mismatch; stale proof/authority/consent |
| Same-commissioner private visits without Listing | Buyer B; mixed audiences; erased predecessor |
| Withdrawn, retained A links; surviving B remains writable after A erasure | Old evidence reuse; historical mutation; public withdrawal fallback |

Affected interfaces: observed-vehicle capture, reinspection schema/port/controller, authority/audit persistence, INSERT guard and erasure cleanup. Forward migration adds proof/identity records; no fabricated backfill, old snapshot rewrite or blanket TTL. Classify identity/proof provenance under ADR-0104 purpose/rights/holds/deletion rules before collection; hashes are not anonymous.

Founder decision requested: approve option 1's new attestation authority, restricted records and public transfer rule through a new complementary ADR under [coding workflow](../../agents/coding-workflow.md#prepare). Accepted decisions imply the invariants, not these powers. Root may record/assemble this proposal; neither this checkpoint nor an agent can approve policy.
