# ADR-0109: Authenticated ownership grants for automatic diagnostic continuity

- **Status**: Accepted
- **Date**: 2026-10-23
- **Deciders**: Founder, Chief of Staff

## Context

ADR-0108 permits automatic normalized-VIN continuity only when both visits preserve the same public identity and ownership. The existing diagnostic source can retain a classified component, but the `/vehicle` flow has no source-specific grant that proves a seller, commissioner, Listing identity, vehicle identity, or dealership membership may be retained for that restricted comparison. Consent to publish, physical access, current Listing access, an evidence-file declaration, and synthetic admission do not establish that grant.

The grant must survive ordinary source changes long enough to make an honest comparison, while subject erasure and the existing classified diagnostic retention schedule still control deletion. A later reobservation cannot repair a missing first observation. The public automatic path also needs a permanent transition marker, because restoring mutable current values cannot prove that ownership never changed.

## Decision

Build an authenticated, source-specific ownership grant mechanism for restricted automatic continuity. A grant is valid only when an authenticated actor records provenance and an explicit source-authorized end covering every retained subject and use: seller, commissioner, Listing identity, vehicle identity, and, where applicable, dealership and membership identity. The system must never invent an end, treat an absent end as indefinite, or treat a technician's fabricated synthetic declaration as real permission.

Persist immutable ownership facts on the first complete observation of both predecessor A and candidate B, with no backfill or repinning. Keep the fact separate from mutable Listing equality and current eligibility. A visit-local irreversible witness records any seller, commissioner, Listing, vehicle, dealership, or membership identity change and cannot be cleared by restoring current values. Missing, expired, erased, or changed grants yield generic 403 on automatic admission without proof, report, or audit mutation.

Automatic public issuance requires complete available facts and grants on both A and B, equal approved identity/ownership tuples, and a clear transition witness. Manual/VIN mixed or corrected pairs use `comparative_attestation`; a changed public seller permanently refuses automatic issuance but a qualified independent reviewer may compare with fresh evidence and current B authority. The reviewer must be qualified and assigned to both inspections, independent of A's author/reviewer and B's linking technician. Restricted proof and comparison reads remain staff-only and require authority for both inspections; limited B handoff remains restricted.

Source writers discover OLD, NEW, and retained references before mutation, then acquire the complete affected graph in deterministic order before writes. Temporary eligibility remains separate from sticky ownership transitions. Component-only erasure clears ownership identifiers, rights/provenance text, and affected restricted proof payloads while preserving report pins, dates, mileage, unrelated evidence, and the minimum consumed retry binding. Existing classified diagnostic retention and deletion owners govern the grant component; no new broader issuer or multi-root policy is introduced.

## Consequences

### Positive

- Automatic 201 can be reached only from truthful persisted authority and both immutable anchors.
- Changed or unavailable rights fail closed without leaking proof or creating audit traces.
- Current Listing restoration cannot erase an observed ownership transition.
- Erasure preserves unrelated diagnostic history while removing restricted ownership-derived material.

### Negative / accepted costs

- Every source writer needs complete graph discovery and the shared lock order before writes.
- Historical subjects and membership references must remain discoverable until component erasure.
- Some legitimate continuity pairs remain manual when an immutable fact or grant is unavailable.

### Neutral

- ADR-0108 remains unchanged and still owns pair-bound proof semantics.
- The existing classified diagnostic retention schedule remains the deletion policy; this ADR supplies no new retention period.
- Synthetic declarations can test the mechanism, but do not satisfy real source rights.

## Alternatives considered

- **Mutable current Listing equality** — cannot detect a seller or identity change that later restores.
- **Technician or publication consent as ownership permission** — does not prove source-specific authority for historical personal linkage.
- **A permanent hash or broad issuer policy** — would retain identifying material without an authorized end and expand access beyond the approved scope.

## References

- [ADR-0103](0103-free-dealer-business-ownership-and-enquiries.md)
- [ADR-0104](0104-center-diagnostics-with-private-and-public-reports.md)
- [ADR-0108](0108-pair-bound-diagnostic-reinspection-continuity-proof.md)
- [Feature 50](../prd/features/50-reports-tier.md)
- [Flow 66](../prd/flows/66-diagnostic-inspection.md)
- [Public automatic contract handoff](../evidence/issue-897/public-automatic-contract-handoff-20261023.md)
- Founder approval recorded in the #897/#904 parent implementation dispatch, 2026-10-23. Policy authorizes building the mechanism, not any actual seller/member grant.
