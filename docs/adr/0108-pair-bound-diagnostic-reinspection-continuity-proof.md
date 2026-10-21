# ADR-0108: Pair-bound diagnostic reinspection continuity proof

- **Status**: Accepted
- **Date**: 2026-10-21
- **Deciders**: Carberk founder
- **Relationships**: Complements ADR-0104; preserves its audience, immutable observation, classified data and real-service activation policies.

## Context

A reinspection links predecessor report A to the first report of a new physical visit B. ADR-0104 requires fresh observations, manual identity handling and separate public authorization, but does not establish comparative attestation authority or public transfer admission. The temporary implementation admits only equal observed VIN, same Listing and same public commissioner. Mutable order identity cannot establish durable evidence of the comparison.

The founder approved option 1 in the [continuity and transfer proposal](../evidence/issue-897/diagnostic-reinspection-continuity-transfer-decision-table-20261021.md), after explanation, with "okay do your recommended action". Root records that approval in #897 execution state. This decision formalizes the selected policy and supersedes its proposal status, leaving the original evidence artifact unchanged. Its implementation belongs to #914 within #897 through sole integration PR #904. Merge, promotion and store submission remain separately gated.

## Decision

Carberk requires immutable per-visit identity evidence and a single-use proof bound to the exact predecessor report and new inspection order before creating a reinspection link.

### Identity and comparison

Each visit captures an immutable identity record with its observation method, normalized VIN or documented physical identifiers, provenance references and hashes. Later corrections append the original and corrected values, explanation and supporting references. They never rewrite A's snapshot or identity evidence. A manual reference, common Listing, commissioner or consent alone proves no continuity.

Equal trimmed uppercase observed VIN permits automatic comparison only when identity and ownership are unchanged and all identity evidence is consistent. It still produces a durable pair-bound proof. Contradictory evidence cannot be overridden by equal VIN text.

All other admissible comparisons require explicit comparative attestation by a currently qualified reviewer independently assigned to both orders and distinct from B's linking technician. This decision grants that bounded attestation authority; ordinary reviewer status alone is insufficient. The reviewer compares retained A identity material with B's own physical observation. Insufficient material permits an unlinked new report only.

| Comparison | Admission |
|---|---|
| Manual/manual or manual/VIN in either direction | Comparative attestation establishing the same physical vehicle |
| Corrected identity, including mismatching VIN | Comparative attestation establishing a justified recording error, with original/corrected values and supporting provenance |
| Changed public Listing identity, Listing id, seller or commissioner, including a different employee of one Dealership | Comparative attestation plus B's current publisher authority, fresh publication consent and revalidated vehicle association |
| Unresolved mismatch or proven different vehicle | Refuse, including when VIN text is equal |
| Buyer-private visits without a common Listing | Same vehicle proof and the same nonnull commissioner on both orders |
| Different private commissioner or mixed private/public audiences | Refuse; ownership, payment and membership grant no exception |

B has its own physical-access authorization. Public consent and association never transfer from A. Public publisher authority must be current at admission and publication. Private continuity never depends on Listing ownership.

### Proof and consumption

The restricted proof records its id and policy version; A report id, exact report version, snapshot hash and identity-record hash; B order id, exact candidate/observation version and identity-record hash; audiences and commissioner references; applicable public Listing identity and ownership digests; comparison method/result, rationale and restricted provenance references; issuer identity and issuance time. Automatic comparison records its issuing actor and method; comparative attestation records the qualified reviewer. The strict reinspection input names the proof id.

Issuance and consumption are audited. Before consumption, the transaction rechecks the current linking technician, issuer identity/session, qualification and both assignments where reviewer attestation applies, as well as all bound candidate versions/digests, audiences, commissioner constraints, erasure state, predecessor eligibility and successor uniqueness. Public admission also rechecks current publisher authority, consent and association. A must be a retained, unerased finalized or withdrawn report on another order with no successor; B must be an arrived, authorized new visit with its own observation and no first report.

Any change to a bound candidate, observation, identity, ownership, authorization or assignment invalidates an unused proof. Reverting values cannot revive it; issue a new proof. Lock and re-read those facts so a concurrent change cannot pass between validation and consumption. Consume the proof, create B's linked draft and record audit atomically. At most one report consumes a proof and at most one successor consumes A. Exact retries return the existing authorized result without consuming again or duplicating audits. A changed proof id or other changed binding is a conflict, even if the report id matches.

Later predecessor changes, authority removal or erasure do not retroactively invalidate a valid consumed link or block a surviving B's ordinary writes. Current access and release gates still apply independently. Do not rerun mutable A admission conditions on B updates. Erasure may sever personal linkage under the governing contract; it never substitutes B's commissioner for A's historical commissioner.

### Audience and data lifecycle

B starts with its own date, mileage, pinned template, empty findings and new evidence. The link grants no access to A's report, PDF or evidence and copies none of them. Same-visit correction rules remain unchanged. Keep existing minimum disclosure: no draft cross-order successor id; a released successor id is visible only to its own current commissioner or while independently publicly available. Predecessor assignment alone discloses nothing; refusals must not disclose protected predecessor facts. B releases independently, and withdrawing B does not restore an older public badge.

Identity records and proof provenance are restricted diagnostic identity/proof records under ADR-0104's existing purpose, rights, holds and erasure contract. Only staff independently authorized on both orders may read comparative material. Public readers and commissioners gain no such access through lineage. Record provenance, permitted purpose/rights, identifiability, audience, applicable holds and retention/deletion treatment before collection. Enforce erasure on personal linkage and restricted material where required, preserving only what the existing rights/hold contract permits. A hash or VIN is not anonymous. This decision invents no data rights or retention period and does not extend historical-data preservation.

Use forward changes only. Do not fabricate proofs or backfill legacy identity evidence, rewrite old snapshots, or introduce a blanket TTL. Legacy visits lacking sufficient retained identity material remain unlinked. Software implementation does not open real-service intake or change synthetic/runtime admission, center readiness, consent wording, price, payment or refund gates.

## Consequences

### Positive

- Manual and justified corrected-identity visits can retain truthful lineage, including authorized public transfers.
- A link proves a particular comparison without transferring private access or old findings.
- A surviving visit remains usable after later predecessor changes or erasure.

### Negative / accepted costs

- Restricted immutable identity capture, comparative reviewer work, durable proofs and transactional invalidation add implementation and operational work.
- Missing retained identity evidence prevents linking; equal VIN cannot bypass contradictions or transfer checks.

### Neutral

- Existing correction, audience, disclosure, retention and activation policies continue to apply.
- This accepted policy requires implementation and acceptance evidence; the temporary narrow path does not satisfy it.

## Alternatives considered

- Equal VIN forever leaves manual and legitimate corrected-identity continuity unavailable and rejects the selected scope.
- Freeform references, Listing equality or inherited consent cannot establish physical continuity or current disclosure authority.
- Rechecking predecessor admission on every successor update would break valid surviving visits after later changes or erasure.

## References

- [ADR-0104](0104-center-diagnostics-with-private-and-public-reports.md)
- [Feature 50](../prd/features/50-reports-tier.md) and [flow 66](../prd/flows/66-diagnostic-inspection.md)
- [Original continuity proposal](../evidence/issue-897/diagnostic-reinspection-continuity-transfer-decision-table-20261021.md)
- [Original reinspection contract](../evidence/issue-897/diagnostic-reinspection-contract-20261021.md) and [incremental disposition](../evidence/issue-897/diagnostic-reinspection-incremental-disposition-20261021.md)
- [Approved implementation handoff](../evidence/issue-897/diagnostic-continuity-approved-implementation-20261021.md)
- #914 within #897; sole integration PR #904; founder approval recorded by root in #897 execution state, 2026-10-21
