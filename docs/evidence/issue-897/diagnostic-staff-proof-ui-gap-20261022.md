# Diagnostic staff continuity UI gap

Read-only source audit at Root `64dd203a5ef9090c92f3cad4a1f4b1281bd9a868`, 2026-10-22. This is source evidence of a missing product path, not a browser session or rendered UI verification. The active C1 writer owns API changes in a separate worktree. No UI or specification implementation changed.

## Verified current boundary

- `apps/admin/src/app/diagnostics/actions.ts` exposes assigned/workspace reads, intake authorization/appointment/assignment/vehicle changes, ordinary draft creation, findings, report transition, editorial correction and report-evidence abandonment. Its complete export list has no identity-history/evidence/provenance, cross-order comparison, continuity-proof issuance/read or proof-bearing reinspection action.
- `DiagnosticWorkspace.tsx` imports only assigned/workspace/ordinary draft/transition/editorial correction actions. Its new-visit button calls `diagnosticCreateDraft` with reportId and expectedOrderVersion. It has no predecessor/proof selection, retained identity comparison, reviewer attestation or linking-technician consumption state. It displays existing successorOf as text. Its “new physical inspection” explanation does not create a lineage link.
- `DiagnosticIntake.tsx` owns ordinary intake observation, not classified structured identity/provenance capture. The only current private image proxy belongs to report evidence, not the new cross-order identity-comparison provenance endpoints.
- Source searches across all admin sources confirm no alternate continuity, reinspection or identity-evidence/provenance implementation. Mobile diagnostics shows reader lineage links and reasons; that is separate customer-reader behavior and does not supply a staff authoring flow.
- Contracts already contain strict identity/provenance, comparison, proof issuance/read and proof-bearing reinspection DTOs. API E2E callers are currently the operative client for this workflow. API behavior alone cannot prove usable staff acceptance.

## Governing requirement and design boundary

Feature50, flow66, feature40's diagnostic-workspace acceptance row and ADR0108 require the selected correction/reinspection journeys. ADR0108 adds per-visit classified retained identity, independent qualified comparison and single-use proof consumption without inherited findings, access or publication consent. This audit identifies unfinished selected scope, not a new feature.

No diagnostic-specific approved wireframe/hifi was found under `docs/prd/ui/wireframes` or `docs/prd/ui/hifi`; general service-workspace guidance does not specify this independent reviewer/technician proof flow. The repository UI readiness gate requires adequate design for a nontrivial new flow before implementation. A bounded design assignment must reconcile current API/source with the approved domain contract. This does not pause unrelated ready API work and does not authorize an improvised UI or reduce acceptance to existing screens.

## Concrete next design brief

1. Technician records each visit's physical identity, classified provenance and new supporting material before any upload. Present immutable raw observation and explicit original/corrected structured records. Explain retention/rights inputs without inventing rights, dates or hold authority. Preserve locale changes and exact upload retry identity; clear protected content on authority loss.
2. From B, choose retained A through a scoped reference/discovery mechanism. Show full authorized comparison with original pins, correction history, independent B evidence and protected images. A missing/expired/erased/inaccessible side gives a generic refusal; no partial protected predecessor facts. No client-side proof inference from equal VIN, Listing or seller.
3. Independently qualified reviewer sees the evidence and named current B linking technician, records rationale and attests the exact pair. Versions, hashes, provenance bindings and policy input derive from current server data. Do not ask staff to assemble raw hashes/JSON or invent broad automatic issuer authority. A supported correction must stay explicit; contradictory claims cannot be dismissed through a freeform rationale.
4. B's current linking technician consumes the issued proof to create B's own empty linked draft. Provide a scoped handoff/discovery state, exact retry, conflict/expired/invalidated proof recovery and no duplicated report/audit. Keep public publisher authority, fresh consent and association distinct from physical continuity. Never inherit A's findings or media.
5. Define desktop/tablet layout, keyboard/focus, TK/RU/EN copy, loading/empty/denied/conflict/upload/retry/invalidated/consumed states, accessible side-by-side evidence and privacy-safe file proxy behavior. Preserve ordinary new unlinked reports and editorial corrections as distinct actions.

The design must settle scoped predecessor/proof discovery and reviewer-to-technician handoff against actual API availability. Existing reference-only DTOs do not establish a usable selection mechanism. New bounded transport queries may be necessary; no unrestricted report/staff directory is authorized. Broader automatic issuer eligibility and multiple-root automatic comparison remain unresolved policy questions, not UI defaults.

## Verification milestones

- Map each approved UI state and staff journey to rendered real-component tests through real actions/network boundary fakes, with literal outcomes and current denial/conflict handling. Mock neither repository feature components nor API hooks/actions.
- Verify real API+storage journeys for capture, full comparison, issuance and exact consumption. Keep existing API security/rights/worker/erasure coverage intact.
- Obtain browser visual evidence for approved desktop/tablet states and complete deployed multi-actor acceptance under a valid reservation, in addition to mobile reader/native acceptance. No source-text search or import-only collection substitutes for this evidence.
- Independent fixed-SHA Standards/Spec review and final release acceptance must include the implemented staff flow. Signing a bundle alone does not finish the selected release.

No reset, Railway retry, deployment, provider/quota probe, service start, merge, promotion, submission or launch occurred in this audit.
