# 66 — Diagnostic inspection journeys

> Proposed revision, 2026-10-14 founder direction. Not implemented or scheduled. [Feature 50](../features/50-reports-tier.md) owns capability, privacy and report invariants. Its new-ADR and operational gates apply here. These flows do not reopen a live coming-soon interest prompt.

## One service, two audiences

Personal and dealer cars can use one center and one validated plan in Aşgabat. The commissioner chooses a private buyer inspection or a seller/dealer public listing inspection. This choice never removes the vehicle owner's physical-access authorization. The service price/duration are not yet defined. [The program](../business/inspection-program.md) owns operations; [feature 51](../features/51-pdf-export.md) owns output delivery.

```mermaid
flowchart TD
  Start[Customer or operator starts request] --> Audience{Commission and audience}
  Audience --> Buyer[Buyer-private inspection]
  Audience --> Seller[Seller or dealer public inspection]
  Buyer --> Access[Record owner authorization for physical access]
  Seller --> Consent[Record physical-access and publication authorization]
  Access --> Confirm[Center manually confirms appointment]
  Consent --> Confirm
  Confirm --> Inspect[Vehicle arrives at center / staff inspect using pinned template]
  Inspect --> Draft[Record results, body findings and evidence]
  Draft --> Review[Submit for authorized review]
  Review --> Return[Return with reason]
  Return --> Draft
  Review --> Final[Finalize immutable snapshot]
  Final --> Visibility{Recorded audience and publication gate}
  Visibility --> Private[Deliver to authorized buyer]
  Visibility --> Public[Publish complete matched public report]
  Private --> PrivatePDF[Authorized reader and PDF]
  Public --> PublicPDF[Public reader and PDF]
```

Audience is recorded during intake. It must not change because a worker clicks Finalize or a seller claims the Listing. Record physical authorization and separate public consent. Public review uses a different qualified reviewer; private self-review is audited. The authorized reader may release while PDF generation is pending.

## Seller or dealership journey

1. Publish/manage the car through the existing Carberk listing wizard. A report is optional; the same publishing flow serves personal and business contexts.
2. Request the real available inspection service through the approved listing-management/dealer-inventory placement. Before the center is ready, this entry does not advertise an unavailable service.
3. See plan scope, limitations, price and proposed time. The center manually confirms the appointment. Request confirmation is not a confirmed booking.
4. At the center, staff match the vehicle, record mileage and access/publication authorization, and explain any scope limits. Pay at the center under the agreed terms.
5. Technician fills the pinned checklist. For body findings, choose view and named panel, add current-damage and repair-evidence observations separately, and link notes/measurements/photos.
6. Reviewer checks completeness and audience. Return incomplete work with a reason or finalize the complete snapshot under the agreed staff policy.
7. Generate the public output from that snapshot. Attach only after explicit vehicle matching and publication gates. Public readers see inspection date/mileage, all findings, skipped scope and correction status.
8. The seller cannot rewrite findings or hide only defects. Disputes follow a recorded correction process; repairs that warrant reinspection produce a new physical observation record.

The report entry adds to the existing Listing detail design. It does not replace seller condition disclosure, public showroom identity, or contact actions.

## Buyer-private journey and buyer A/B example

Buyer A can commission an inspection to decide whether to buy. The seller authorizes physical inspection, but does not receive private-report access merely by owning the vehicle or Listing. Staff explain the agreed audience before the appointment.

```mermaid
sequenceDiagram
  participant A as Buyer A
  participant Owner as Vehicle owner
  participant Center as Carberk center
  participant B as Buyer B
  A->>Center: Request private inspection
  Owner->>Center: Authorize vehicle access
  Center->>A: Confirm service and terms
  Center->>Center: Inspect, review and finalize private report
  Center->>A: Authorized reader and PDF access
  A->>A: Decide against purchase
  B->>Center: Ask about the car
  Center->>B: Offer own inspection with owner authorization
  Note over Center,B: No access to A's report or disclosure through public Listing metadata
```

A's decision against buying does not turn the report into a public Listing asset. B cannot buy access to A's private report through the initial proposed flow. B may request their own service. The seller may arrange a public inspection that every buyer reads free. Refund rules are a separate operational decision, not a consequence encoded by this diagram.

Private-to-public conversion, private report delegation and reusing another commissioner's snapshot are deferred until consent, price and freshness rules are agreed. A screenshot or downloaded PDF may be forwarded by its recipient; Carberk cannot promise revocation of copies already exported. The controlled service must enforce access to its own reader, PDFs and evidence.

## Worker body finding interaction

```mermaid
flowchart LR
  View[Choose vehicle view] --> Panel[Choose stable named panel]
  Panel --> Assessment[Explicitly assess or mark unchecked]
  Assessment --> Findings[Add zero or more numbered findings]
  Findings --> Type[Current damage or repair evidence]
  Type --> Notes[Notes, uncertainty and measurements]
  Notes --> Photo[Attach approved evidence photos]
  Photo --> ReviewList[Review map and equivalent findings list]
  ReviewList --> Snapshot[Final snapshot feeds reader and PDF]
```

An untouched panel is unassessed. The worker must not interpret an empty drawing as original paint or damage-free. Current scratches/dents, observed repaint/replacement and supported accident history are distinct. On a small screen, the panel list remains usable without precise diagram tapping. The actual drawing uses original vehicle views, text labels and a monochrome-readable legend.

## Failure and recovery examples

| Event | Required target behavior |
|---|---|
| Vehicle unavailable or appointment not confirmed | Clearly distinguish pending request from confirmed service; apply the agreed cancellation policy |
| Vehicle identity does not match Listing | Prevent public association pending authorized resolution |
| Check cannot be performed | Record Not checked and reason; never fabricate a pass |
| Upload fails | Preserve draft and finding IDs; retry without losing notes or attaching another inspection's evidence |
| Membership/worker capability removed | Deny subsequent protected actions on the server; preserve business/inspection records under the agreed retention policy |
| Reviewer returns report | Show reason and resume the same pinned-template draft |
| PDF generation fails | Show accurate artifact state and retry; finalized report data remains unchanged |
| Seller dislikes a finding | No per-finding deletion or favorable-only public copy; use correction/dispute route |
| Later correction or reinspection | Preserve original snapshots/audiences; a new visit starts with fresh observations and no reused findings/evidence. Reinspection consumes the exact pair-bound proof under ADR-0108; never label old measurements as new |
| Unauthorized user guesses private report/media URL | Deny access without leaking private contents or public metadata |

Feature 50 and ADR-0104 govern accepted correction/withdrawal, reviewer, association and classified data policies. [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) adds the approved continuity flow. Capture immutable identity evidence for predecessor report A and new physical visit B. Equal normalized VIN permits automatic proof only for unchanged, consistent identity/ownership. For manual/manual, either manual/VIN direction, supported identity correction or changed public Listing/seller/commissioner, a qualified reviewer independently assigned to both orders and distinct from B's linking technician compares retained A material with B's physical observation. Record original/corrected values and provenance. Unresolved mismatch, different vehicle or insufficient material cannot link.

Private continuity requires the same nonnull commissioner even without a common Listing; different private commissioners and mixed audiences refuse. Public B requires current publisher authority, fresh consent and revalidated association. Bind proof to exact versions, hashes, audiences, commissioner references and applicable public identity/ownership digests. Recheck current technician and issuer/session authority, reviewer qualification/assignments where applicable, candidate state, erasure and uniqueness under locks; any intervening identity, ownership, observation, authorization, assignment or candidate change invalidates unused proof. Atomically consume once with B creation and audit; exact retries create no duplicate audit. Later A changes or erasure cannot retroactively break valid surviving B. A link grants no old findings, evidence, private report access or inherited consent. Restricted identity/proof provenance follows ADR-0104 purpose/rights/holds/erasure rules without new rights or retention duration, backfill, old snapshot rewrite or blanket TTL; hashes are not anonymous.

This software policy keeps real-service activation closed. Real center payment/refund methods and consent wording remain activation inputs.

## Evidence expected before launch

Exercise personal and dealer publishing without inspection; private A/public seller paths; unauthorized buyer B/dealer/staff access; evidence URL protection; template revision and correction history; body-map/list equivalence; failed PDF generation; all supported reader/PDF languages. Real center validation and operating approval are separate from passing software tests.

## Final campaign policy reconciliation, 2026-10-14

This candidate applies founder-approved defaults in ADR-0103/0104 and features 38/50; those final policies supersede earlier open-policy wording in this shaping document. Artifacts/source status remains unchanged. Staff/admin interfaces and generated exports support TK/RU/EN, including failures. Public inspection action appears on Results cards AND detail for available authorized public reports only, opens complete findings/date/mileage, and disappears on unavailable/withdrawn association. It is never a pass/quality guarantee or a private-report indicator.

Preserve immutable snapshots and original audiences. Public reports require separate qualified review; private self-review requires explicit authority/audit. Reader release may precede PDF readiness. Withdrawal hides public access but preserves authorized history. Useful vehicle/market observations and genuinely anonymized permitted insights may persist indefinitely; private/personal/provider data keep separate purpose/rights/deletion/hold controls, with no blanket new purge period. Center capability, price, duration, capacity and actual refund process gate live service opening rather than independent software delivery.
