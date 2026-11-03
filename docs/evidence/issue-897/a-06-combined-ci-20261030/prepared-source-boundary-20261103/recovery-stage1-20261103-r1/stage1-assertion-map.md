# Issue 938 recovery stage 1 assertion map

Source checkpoint: `6bc5196958c58611328c09eb7a3dfa6fdc8c4f11`.
Top-level describe in each replacement: `issue938 recovery stage1`.
The four replacement files contain five original-equivalent probes and two separately counted controls. The original `.spec.ts` files and the other 168 selected cases remain byte-identical.

| Path | Case | Production path and assertions |
|---|---|---|
| `ClassifiedForwardCapture.e2e.spec.ts` | `accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1` | Real listing-public order, ownership grant before first raw, observation route, provenance component, exact observed payload, literal order version 7, source listing/commissioner fields, and `diagnosticObservationHash` v1. |
| `DiagnosticContinuityHandoff.e2e.spec.ts` | `lets only the selected current B technician reload a minimal usable handle without A access` | Private B ordinary ledger `0,1,2,3,4,5,6,6,7,7`; persisted B version and proof candidate pin are independently literal 7 before the read; exact HTTP 200, `no-store, private`, complete handoff DTO, proof-detail/reviewer/foreign 403s, real foreign assignment, and exact scoped-empty DTO. Original literal 1 remains untouched. |
| `DiagnosticScopedDiscovery.e2e.spec.ts` | `returns only named currently eligible distinct B technicians to a non-reception reviewer` | Real reviewer authority, named selected technician, foreign 403, lawful selected qualification expiry, and exact empty DTO. |
| `DiagnosticErasedPredecessorReaders.e2e.spec.ts` | `projects commissioner and currently assigned staff reads, preserving the exact technician mutation receipt and B source` | Public A/B visits with distinct commissioners and ownership grants; exact reinspection receipt/retry, actual A purge through the production account-purge adapter and worker, B report projection, three unavailable documents, unchanged B source, foreign denial, and post-revocation denial. |
| `DiagnosticScopedDiscovery.e2e.spec.ts` | `omits malformed required retained evidence without a partial candidate or protected error` | Baseline retained candidate, F47-only Prisma `diagnosticIdentityEvidence.findMany` decorator with exact query scope and copied SHA mismatch, literal 200 empty DTO, restored read, stored A/B rows unchanged. |
| `DiagnosticScopedDiscovery.e2e.spec.ts` | `[938 control] rejects persisted provenance rewrite without changing stored evidence` | Restricted real transaction and `identity_material_change` preparation reach the immutable evidence guard; actual nested error is asserted and stored row remains unchanged. |
| `DiagnosticErasedPredecessorReaders.e2e.spec.ts` | `[938 control] cleans partial fixture initialization before returning failure` | Initialization sentinel after role, app, bucket and control setup; cleanup drains callers, closes clients, removes owned objects, drops role, restores guard modes, and reports zero residual source/campaign receipts. |

All HTTP assertions use the production controllers, authority, repositories, prepared-source SQL, locks, transactions and clock. The F47 decorator is limited to the database read boundary, clones one pinned returned A row, and changes only its copied provenance SHA. No DTO, repository, authority, receipt, production or memory adapter is substituted.
