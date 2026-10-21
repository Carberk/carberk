# Next diagnostic pair-proof RED contract

Docs-only preparation for #914 within #897, sole integration PR #904. Base `a51bf6cf8cadf3744282c742a982c196aed3beda` is published and offline verified; hosted HTTP/PostgreSQL behavior is still unknown. This note supplies no runtime GREEN. Reservation `agent/issue-914-pair-proof-red-contract-20261021` was pushed before edits in the host-owned worktree. Scaffold `t3/issue-914-pair-proof-red-contract` remains at the base.

[Accepted ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) and the [approved handoff](diagnostic-continuity-approved-implementation-20261021.md) govern. Founder approved option 1; D2/D3 are decided. The transport below is a recommended implementation contract, not a canonical policy amendment. Root owns later assignment, integration and hosted evidence.

## Source findings and necessary predecessor

- [Identity-history source checkpoint](diagnostic-identity-history-source-20261021.md) implements append-only observation/version/hash history, not full ADR-0108 identity evidence.
- [observeVehicle and identityRecords](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts) store `observedVehicle`, resulting order version, observation hash, recorder and time. `manualReference` is free text. No structured physical-identifier provenance, correction explanation or original/corrected relationship exists.
- [Report create/correct/reinspect](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts) pins no identity-record id/hash. Create copies date/mileage; release hashes report state/template. The latest order observation, equal date/mileage or an order version cannot recover A's report identity binding after the fact.
- [Contracts](../../../packages/contracts/src/schemas/diagnostics.ts) have no pair-proof transport. [Authority](../../../apps/api/src/modules/diagnostics/infrastructure/DiagnosticAuthority.ts) checks current session, grant, center qualification and order assignment. Calling its commissioner fallback is insufficient for restricted reads.
- [Existing HTTP journeys](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReports.e2e.spec.ts) exercise the temporary public/same-Listing/commissioner/VIN path. Preserve them at this docs checkpoint. Its source comment calling D2/D3 undecided is stale policy wording, not an unresolved founder decision.

Before issuance, deliver a narrow identity-binding/evidence predecessor with its own RED/GREEN:

1. New first reports pin the exact retained identity record selected from the locked current observation at draft creation. Corrections inherit that same-visit pin; a later reobservation cannot silently retarget any report. Release/proof binding retains its identity hash independently of mutable intake. No inference or backfill for existing unpinned reports; they remain unlinked.
2. Append structured identity evidence with physical identifiers, retained provenance references/hashes and capture actor/time. A justified correction explicitly names the earlier record, original/corrected values, explanation and supporting references. Preserve the original; adding text to `manualReference` or a report correction reason is insufficient.
3. Classify each retained reference under ADR-0104 purpose/rights, identifiability, audience, holds and deletion/export treatment before collection. References must resolve to permitted retained material, never arbitrary caller strings or A findings reused as B evidence. Use synthetic material only here. Missing rights or evidence refuses linking; do not invent rights or a retention period.

This predecessor may expose the comparison read below before implementing proof creation. Its exact structured capture wire format/storage representation needs a bounded implementation design before its provenance tests; ordinary `/vehicle` inputs alone cannot establish manual/corrected continuity. Do not hide this prerequisite inside a proof test with fabricated database records.

## Minimum HTTP contract

All paths below start `/api/v1/diagnostics`. All protected successes and refusals use `Cache-Control: no-store, private`. Bodies are strict. Symbols denote actual fixture ids/versions/hashes read through HTTP, not literal strings sent on the wire.

`GET /orders/B/reinspection-comparison?predecessorId=A` returns 200 only to current staff independently authorized on both orders. Its strict restricted result is:

```json
{
  "predecessor": {"reportId":"A","reportVersion":3,"snapshotHash":"HA","identityRecordId":"IA","identityRecordHash":"HIA","identity":{}},
  "candidate": {"orderId":"B","orderVersion":7,"identityRecordId":"IB","identityRecordHash":"HIB","identity":{}}
}
```

`identity` is the retained observation plus structured evidence/correction chain from the predecessor contract, not a public report DTO. A uses its report pin, never A's newest order identity. B uses its current physical observation. Versions above are illustrative; the fixture pins literal expected values. Return no findings, PDFs, contacts or unrelated history. Do not place this material in ordinary commissioner/public report responses.

`POST /orders/B/continuity-proofs` takes:

```json
{
  "predecessorId":"A","expectedPredecessorVersion":3,"expectedOrderVersion":7,
  "predecessorIdentityRecordId":"IA","candidateIdentityRecordId":"IB",
  "linkingTechnicianId":"T","method":"comparative_attestation",
  "rationale":"Same stamped chassis; supported transcription correction",
  "provenanceRecordIds":["PA","PB"]
}
```

Return 201 with exactly `{"proofId":"P"}`. P is a server-issued UUID, not client proof content or an attestation supplied by the linking technician. Issuance creates no B report or successor. No protected A diagnostics or refusal reason accompanies this handle. Comparative issuer is a current qualified reviewer independently assigned to both orders and distinct from T, B's current assigned linking technician.

For automatic issuance use `method: "automatic_vin"`, `rationale: null`, `provenanceRecordIds: []`; server derives/records its rationale, actor and checked evidence. Start its test with unchanged public Listing/ownership/commissioner and consistent normalized VIN evidence. No client assertion can force automatic success. An actor requesting comparative material must still pass both-order staff authority; this note grants no B-only read through automatic issuance.

`GET /orders/B/continuity-proofs/P` returns 200 only with current staff authority on both orders, with this strict envelope:

```json
{
  "proofId":"P","policyVersion":"ADR-0108",
  "predecessor":{"reportId":"A","reportVersion":3,"snapshotHash":"HA","identityRecordId":"IA","identityRecordHash":"HIA"},
  "candidate":{"orderId":"B","orderVersion":7,"identityRecordId":"IB","identityRecordHash":"HIB"},
  "linkingTechnicianId":"T","method":"comparative_attestation","result":"same_vehicle",
  "rationale":"Same stamped chassis; supported transcription correction","provenanceRecordIds":["PA","PB"],
  "issuedBy":"R","issuedAt":"2026-10-21T12:00:00.000Z"
}
```

Persist all additional ADR-0108 bindings server-side: audiences, historical commissioner references, applicable Listing identity/ownership digests, current authority/session and observation/candidate generations. The minimal read need not disclose those personal facts. Record issuance audit in the same transaction. No TTL, collection rights or lineage access is implied by P.

For any B-only technician, missing either assignment, commissioner, admin, unqualified/revoked staff or invalid session, comparison/read/issuance return the same existing 403 `DIAGNOSTIC_NO_ACCESS` envelope and generic `Inspection request could not be completed` message. Compare real versus nonexistent/erased A and P, ignoring only timestamp/request id. Authorize both orders before returning semantic validation details. No hash, version, identity, existence, provenance, issuer or eligibility fact from A may appear. Invalid strictly shaped input is 400 `DIAGNOSTIC_INVALID_INPUT`; authorized stale bindings are 409 `DIAGNOSTIC_STALE_VERSION`; insufficient/contradictory identity is generic 403 with no proof.

## Ordered behavioral checkpoints

1. **First RED, predecessor binding.** Add a new HTTP suite using real Nest/DiagnosticsModule, JWT/current sessions and PostgreSQL, following [identity-history composition](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityHistory.e2e.spec.ts). Via existing HTTP create/authorize/arrive/observe A, capture IA, create/fill/submit/finalize A, then reobserve A to IA2. Prepare arrived B with its own observation IB and assign reviewer R independently to both. First new assertion is R's comparison GET expecting 200. At this base the route is absent, so expected behavioral RED is HTTP 404 versus 200, after all existing setup succeeds. Then assert A still selects IA/hash, B selects IB, and A's ordinary released representation stays unchanged. The minimal GREEN pins future reports, inherits correction pins and supplies this restricted read. Do not implement proof issuance in this predecessor.
2. **Evidence predecessor RED.** Through its agreed HTTP capture transport, append supported structured manual evidence and a justified identity correction. Assert original/corrected values, explanation and provenance survive readback without replacement; invalid/unretained references refuse. GREEN is forward-only classified identity evidence persistence, strict capture/read mapping and erasure handling. No manual proof success before this passes.
3. **Pair issuance first RED.** On that verified predecessor, use fresh unlinked same-commissioner private A/B with supported manual physical evidence and no Listing. R's exact POST above expects 201; before issuance implementation it must reach HTTP and fail 404 versus 201. Follow with GET P assertions on exact bindings, issuer, clock, method/result and rationale. HTTP GET B reports remains `[]`; A reports no successor. Minimal GREEN adds strict proof schemas/routes, locked both-order authority/eligibility/evidence checks, durable immutable proof and transactional issuance audit. It does not consume proofs or widen the old reinspection path.
4. Add issuance/read refusals for B-only T, reviewer assigned only A or only B, R=T, missing grant, expired qualification, revoked assignment/session and erased A. Reuse the same JWT after HTTP assignment revocation. A public/commissioner read of A never substitutes for comparative authority. Compare denial envelopes against unknown ids; an opaque proof id is not authorization.
5. Add automatic normalized VIN success, manual/manual and both manual/VIN directions, supported corrected mismatch success, equal VIN plus contradictory evidence refusal, freeform reference alone refusal and legacy missing pin/evidence refusal. Different private commissioner, mixed audiences, unresolved mismatch and different vehicle refuse. Each request reaches the production HTTP boundary; new tests do not import future generated Prisma models, stub internal modules or manufacture proofs.

## Separate later slices

- **Atomic consumption/staleness.** Only after issuance GREEN, extend strict `POST /orders/B/reinspections` with required `proofId` alongside its existing fields. Bind the intended linking actor and exact retry identity. RED covers one atomic proof consumption/report/audit, exact retry, changed proof conflict, competing correction/reinspection and one successor. Lock/re-read all ADR-0108 bindings and issuer session/qualification/assignments; mutate then revert must still invalidate. Cover observation/identity/candidate, ownership, authorization, audience, erasure and authority races with real PostgreSQL contention. Issuance success is not consumption evidence.
- **Transfer admission.** Then exercise Listing identity/id, seller and commissioner changes, including another Dealership employee, with comparative proof plus B's current publisher authority, fresh consent, physical authorization and revalidated association. No inherited A consent. Forward migration replaces only the temporary admission constraints; no relaxed access or policy changes.
- **Survival/erasure.** After valid consumption, A changes, authority loss or erasure cannot block B writes/release under B's independent gates. Before consumption erasure refuses. Extend HTTP/storage and worker purge acceptance, preserving historical commissioner truth and required deletion of personal linkage/restricted material. No A findings/evidence/PDF access or copying, no draft successor disclosure and no revival of an older badge on B withdrawal.

## Handoff and validation

Recommended next assignment is the predecessor binding HTTP RED in step 1, followed by its narrow source GREEN; do not dispatch pair issuance against this unpinned foundation. Resolve structured evidence capture representation before step 2, then assign the bounded issuance/comparative-authority suite. Storage layout, provenance reference delivery and lock/generation implementation remain engineering questions; D2/D3 do not.

Docs-only work is exempt from behavioral RED. Validation: `pnpm check:agent-docs`, `pnpm check:glossary`, local Markdown link existence checks and `git diff --check`. No source/schema/test/canonical-policy edits or existing-test rewrites; no services, Docker/DB, Railway, credentials, CI dispatch/poll/wait, agents or GitHub content mutation. The docs checkpoint is pushed for root assembly; no issue PR. Hosted foundation behavior, later RED/GREEN, integration review and deployed acceptance remain unproven here.
