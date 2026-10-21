# Diagnostic identity evidence capture contract

Bounded engineering handoff for #914 within #897, sole integration PR #904. Supplied base `aa46a0b09066f33d3f608809ab04054f2d92fe06`; reservation `agent/issue-914-identity-evidence-contract-20261021`. This document proposes transport and persistence choices under accepted [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) and [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md). It implements no behavior and changes no canonical specification. Root owns assignment and hosted RED/GREEN evidence.

Deliver one coherent classified evidence/correction slice after the independently owned report-binding predecessor in [the next RED contract](diagnostic-pair-proof-next-red-contract-20261021.md). Manual/corrected proof issuance must wait for both. Proof issuance, consumption, transfers and their admission tests remain separate.

## Existing boundaries and selected approach

The [identity-history checkpoint](diagnostic-identity-history-source-20261021.md), [intake source](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts) and [strict contract](../../../packages/contracts/src/schemas/diagnostics.ts) retain immutable observation records. `/vehicle` appends observations but has no structured physical identifiers, supporting references or justified correction edge. `manualReference` is text, not physical continuity proof.

[Report evidence](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticEvidence.ts) requires a draft report/finding and can be delivered to report readers. Do not put identity material into a dummy finding or reuse that reader authority. Reuse [DiagnosticObjects](../../../apps/api/src/modules/diagnostics/domain/ports/DiagnosticObjects.ts), its private bucket, sanitizer, conditional immutable writes, exact hash/length reads and lease/epoch cleanup pattern. Add narrow order-owned provenance metadata and structured evidence records. No new storage service or generic evidence framework is needed. Existing object key syntax `diagnostic-evidence/<globally unique provenance UUID>/<sanitized SHA-256>` suffices; enforce UUID/key uniqueness across both metadata owners.

Reuse the classification vocabulary of [ServiceRightsSchema](../../../packages/contracts/src/schemas/serviceMessaging.ts), with a strict diagnostic subset below. Do not use Support's 90-day rule, History's archive/distribution authority, communication attachments or a `ServiceRights` parser's permissive unknown-key behavior as diagnostic authorization. Diagnostics owns its validation and lifecycle, with no import of another context's implementation.

## Current authority and collection gate

All routes below start `/api/v1/diagnostics`, require the existing bearer Session and return `Cache-Control: no-store, private`, including errors. Capture/staging/upload require the current `diagnostics.technician` grant, unexpired center qualification and active assignment to this order, a live admitted synthetic order, `arrived` status and recorded physical authorization. Recheck current authority in each transaction and after asynchronous storage I/O. This is the existing observation-authoring role, not permission to attest continuity or change policy. Reception/reviewer grants alone do not authorize capture. No new elevated role is introduced.

Single-order reads use the existing identity-history staff-only path, including its explicit exclusion of commissioner fallback. Comparative reads require independent current staff authority on both orders. Comparative attestation later requires the separately qualified reviewer defined by ADR-0108. A B-only technician cannot read A by passing its id, even if A is publicly readable. Marketplace admin, seller, Dealership membership, payment and lineage confer no identity-evidence access.

Before accepting even structured identifier text, persist its classification. Before accepting bytes, persist their classification and immutable upload intent. The strict `rights` object is:

```json
{
  "category":"vehicle_observation",
  "purpose":"Synthetic diagnostic identity comparison",
  "basis":"Owned synthetic fixture only",
  "provenance":"Generated chassis fixture, not a customer document",
  "identifiability":"pseudonymous",
  "use":["service"],
  "schedule":{"kind":"until","until":"2026-12-01T00:00:00.000Z","reason":"Synthetic fixture authorization"},
  "supplierRestrictions":"No export or redistribution",
  "hold":null
}
```

Use the existing field length/date constraints, strict objects at every level, category exactly `vehicle_observation`, identifiability `personal` or `pseudonymous`, use exactly `["service"]`, schedule only the existing explicit `until` variant and hold `null` for this bounded synthetic slice. The date above is a fixture value, not a retention default or approved production period. Require a future authorized end date and nonempty purpose, basis, provenance and schedule reason; never manufacture missing rights. Identity text, VINs, object hashes and correction explanations remain restricted identifiable material. Audience is server-derived `staff_only`, independent of report audience. Account-erasure handling is mandatory and cannot be disabled by this input.

This subset permits synthetic HTTP acceptance without asserting new archival, export or hold powers. Existing lawful holds must still fence deletion under the governing lifecycle; this route cannot create, cancel or extend them. An existing hold does not grant ordinary reads after rights expire or erasure fences access.

## Exact transport

Symbols O, I0, I1, E0, E1, P0 and P1 below are UUIDs obtained through HTTP or fixture UUID allocation. V is the current order version. Hashes are lowercase 64-hex SHA-256. Fields shown are exhaustive; reject unknown fields, including `synthetic`, audience, actor, hash or authority assertions supplied in a body. Times/actors/hashes in responses are server-derived. No route returns storage keys, signed URLs or eligibility decisions.

### Classified provenance before bytes

`POST /orders/O/identity-provenance` takes exactly:

```json
{"id":"P0","expectedOrderVersion":7,"contentType":"image/png","sizeBytes":68,"rights":{}}
```

`rights` is the complete object defined above, not an empty object. Input types use existing image upload support: JPEG, PNG or WebP, positive declared input size at most 10 MiB. Return 201 with exactly `{"id":"P0","state":"staged"}`. Staging checks V but does not increment order version or select identity evidence. Same id and identical staged intent retries return the same 201; a changed intent on this order is 409 `DIAGNOSTIC_EVIDENCE_CONFLICT`. Cross-order ids receive generic denial. Reject missing classification before creating intent or accepting bytes.

`PUT /orders/O/identity-provenance/P0?expectedOrderVersion=7` takes raw `application/octet-stream`, `X-Evidence-Type: image/png`, and exactly the declared number of bytes. Strict query has only `expectedOrderVersion`. Return 200 with exactly:

```json
{"id":"P0","state":"verified","mime":"image/webp","sizeBytes":42,"sha256":"<sanitized-byte hash>"}
```

The size/hash example denotes the retained sanitized output, not the original upload. Apply existing 10 MiB/25-million-pixel/single-image sanitizer constraints, strip metadata and verify the retained object's bytes before marking verified. Pin an exact test fixture's literal output length/hash in the test after preparing that fixture; do not compute expected values through production code. An exact verified retry returns the same metadata, without another order version. Different sanitized bytes for P0 are 409 `DIAGNOSTIC_EVIDENCE_CONFLICT`; invalid/mismatched bytes/type/size are 400 `REPORT_EVIDENCE_INVALID`. A concurrent write lease uses the existing 400 `DIAGNOSTIC_EVIDENCE_BUSY` mapping. No partial object can become evidence after authority, erasure, rights or epoch changed.

`GET /orders/O/identity-provenance/P0` streams only verified permitted retained bytes to current staff on O, with `Content-Type: image/webp` and `X-Content-Type-Options: nosniff`. Reauthorize and compare epoch after read, immediately before delivery. For comparative delivery use `GET /orders/B/reinspection-comparison/provenance/P0?predecessorId=A`; enforce both-order staff authority and membership in that comparison's pinned evidence/correction set. Do not route comparison downloads through a commissioner/public report endpoint. A provenance id alone grants nothing.

### Append structured evidence and corrections

`POST /orders/O/identity-evidence` takes exactly:

```json
{
  "id":"E0","expectedOrderVersion":7,"identityRecordId":"I0",
  "identifiers":[{"kind":"chassis_stamp","location":"Right frame rail","value":"SYN-CHASSIS-014","provenanceIds":["P0"]}],
  "rights":{},"correction":null
}
```

`rights` is complete as above. `identifiers` has 1..20 strict objects, with kind `vin_stamp`, `chassis_stamp` or `manufacturer_plate`; trimmed location 1..300 and value 1..500 characters; 1..20 unique provenance UUIDs per identifier. Reject duplicate kind/location entries. Preserve the recorded value; additionally derive uppercase trimmed VIN for `vin_stamp` comparison. Do not normalize other identifiers into VINs. Every referenced provenance item must be verified, classified, unexpired, unerased, same order and permitted for this purpose. Copy its immutable id/hash/mime/size into the committed record. URLs, arbitrary strings, unverified/staged ids, report-finding evidence and another order's material are not references.

For a justified correction use a new id E1 and this nonnull replacement for `correction`:

```json
{"supersedesId":"E0","explanation":"Transcribed 014 as 041; new close-up shows 014"}
```

Explanation is trimmed 1..1000 characters. The complete new record contains corrected identifiers and supporting references, never a patch. E0 supplies the original values and original observation; E1 supplies the corrected values and corrected observation. Require at least one new verified provenance reference supporting the correction. If observation fields changed, first append I1 using existing `/vehicle`, then capture E1 against I1. If only structured identifier transcription changed, E1 may refer to I0. Require the new raw observation to be current for a new root, or current/unchanged for a same-observation correction. A correction may supersede only the current leaf of a retained chain on O. No cycles, forks or cross-order corrections. Multiple independent observations may have separate roots; the server must never infer a correction from chronology or equal text.

Success is 201 with exactly the following strict record. `observation` is the complete existing five-field immutable observation, not the latest intake:

```json
{
  "id":"E1","orderId":"O","orderVersion":9,"identityRecordId":"I1",
  "observationHash":"<I1 observation hash>",
  "observation":{"observedAt":"2026-10-21T10:00:00.000Z","mileageKm":123000,"method":"manual","vin":null,"manualReference":"Synthetic fixture"},
  "identifiers":[{"kind":"chassis_stamp","location":"Right frame rail","value":"SYN-CHASSIS-014","provenanceIds":["P1"]}],
  "provenance":[{"id":"P1","sha256":"<sanitized-byte hash>","mime":"image/webp","sizeBytes":42}],
  "rights":{},"correction":{"supersedesId":"E0","explanation":"Transcribed 014 as 041; new close-up shows 014"},
  "recordHash":"<immutable evidence hash>","recordedBy":"T","recordedAt":"2026-10-21T12:00:00.000Z"
}
```

In every actual response, `rights` contains the full persisted strict classification. Each successful append increments O.version exactly once; `orderVersion` is that resulting version. It does not append another raw observation or change `observedVehicle`. A root is allowed only if that raw identity record has no structured evidence yet; later changes require an explicit correction edge. Exact id/body retries return the existing 201 record after current authorization, even when the old expected version is stale. Changed content under the same id is 409 `DIAGNOSTIC_EVIDENCE_CONFLICT`; other stale versions or an overtaken correction leaf are 409 `DIAGNOSTIC_STALE_VERSION`. Retry recognition must precede stale-version rejection but never bypass current rights/erasure checks.

`GET /orders/O/identity-evidence` returns 200 with exactly a bare array of those records in resulting orderVersion order. No pagination, erased placeholders or added fields. Keep the existing `/identity-records` response byte-shape unchanged. Return only permitted retained chains, without partial chains whose required ancestors are unavailable. A comparison needing an expired, erased or otherwise unavailable pin/ancestor refuses with generic 403. Neither read treats later observations as explanations for old ones.

## Report pins and protected comparison

At new report draft creation, pin the raw identity id/hash and the current structured evidence leaf id/hash if one exists. Same-visit report corrections inherit those pins. A report created before structured capture keeps its absent evidence pin; later capture cannot repair its historical proof eligibility. This adds to the report-binding writer's raw pin, without asking that writer to implement this slice. Preserve old snapshots and their hashes. Do not backfill or derive historical pins from date/mileage/current intake.

For the previous contract's `GET /orders/B/reinspection-comparison?predecessorId=A`, keep its predecessor/candidate envelope. Define each `identity` object strictly as:

```json
{
  "observation":{},"evidence":null,"corrections":[],
  "evidenceGeneration":0,"correctionHeadHash":null
}
```

`observation` is the complete pinned raw five-field observation. `evidence` is the full structured record above or null. `corrections` is an ordered array of complete records reached through explicit supersedes edges from that pin, not unrelated newer observations. Include the chain ancestors needed to show original values if the pin is itself a corrected leaf, once each in append order, excluding the leaf already in `evidence`. `correctionHeadHash` is the latest descendant record hash, or null without descendants. `evidenceGeneration` is the order's monotonic identity-evidence generation read in the same transaction, including erasure/rights invalidation; it never decreases.

A selects its report's immutable raw/evidence pin. B selects its current raw observation and current evidence leaf. The outer `identityRecordId` remains the raw record id and `identityRecordHash` remains its existing immutable observationHash, preserving the raw-binding predecessor. The structured evidence id/hash and correction head/generation are additional independent bindings. Later proof issuance MUST persist and recheck them for both orders along with every other ADR-0108 binding. Matching the old raw hash alone is insufficient. This is an explicit implementation addition to the earlier minimal proof transport, not permission to omit evidence from proof staleness.

Return A's unchanged evidence separately from its later correction chain. A justified correction can support the later reviewer decision without rewriting what A originally recorded. Missing evidence returns null/empty data to an authorized comparison reader and cannot produce manual/corrected proof success. No findings, PDFs, contacts, unrelated history or third-order references belong here. No ordinary report response or PDF gains these fields.

Equal normalized VIN with A's stamped chassis `SYN-CHASSIS-014` and B's `SYN-CHASSIS-999` is contradictory evidence, not automatic success. Capture retains the contradiction truthfully. It cannot label it resolved; later issuance must refuse unresolved contradiction even when VINs match. A freeform reference such as `same car as A` supplies neither structured evidence nor comparative attestation.

## Persistence, races and deletion

Use two narrow forward-only tables alongside existing raw identity records: order-owned provenance upload intents and immutable structured evidence records. The latter stores raw record FK/hash, full identifiers, copied provenance metadata, rights, correction parent, actor/time and record hash. Keep operational status/epoch/cleanup leases outside immutable content. Add nullable structured evidence pins to future report records without rewriting old snapshots. Database guards enforce order/raw/provenance ownership, immutable committed content and one correction successor. A service-only check is insufficient for these persisted bindings.

Use a versioned canonical JSON array for recordHash, with a fixed documented field order: tag `diagnostic-identity-evidence/v1`, id, order id, resulting order version, raw record id/hash, identifiers in submitted order, provenance sorted by id, complete normalized rights, correction or null, recorder at capture and timestamp. Object hashes bind sanitized retained bytes; raw observationHash remains unchanged. Hashes are restricted content, not an anonymization mechanism. Staff attribution may detach on deletion without recalculating historical content hashes; `recordedBy` then returns null and the hash continues to bind the original capture rather than the redacted response; retain no recoverable deleted user mapping in hash input copies after erasure. No digest mismatch is repaired by editing evidence.

Lock/recheck users/current authority, applicable Listing locks, orders, evidence leaves and provenance rows in the repository's compatible deterministic order. Append, provenance binding, version/generation increment and a content-free capture/correction audit commit atomically. A concurrent `/vehicle`, capture, correction, revocation or erasure either wins before validation or makes the competing write refuse; rollback leaves no partial record/version/audit. Record ids, VINs, explanations, rights text and hashes do not enter audit details or logs. Storage I/O stays outside DB transactions, with durable intent, bounded write lease, epoch revalidation and exact readback as in existing evidence uploads.

An attached provenance item cannot be abandoned or garbage-collected as an unused report image. Unattached intents may use the existing upload lifecycle cleanup rules, not a new diagnostic retention TTL. At rights expiry, fence reads and use the declared deletion treatment subject to an existing lawful scoped hold. Erasure first fences order/evidence/provenance access and increments generations/epochs, then clears restricted content, hashes and personal linkage where required and schedules exact object cleanup. Keep live write leases until in-flight I/O settles; repeat cleanup verifies absence. Extend the [account erasure owner](../../../apps/worker/src/jobs/diagnosticAccountErasure.ts) before intake is erased. No new preservation exception follows from an evidence pin. Existing hold/rights rules decide any permitted retained material; a hold preserves only for its purpose and grants no reader access. Erased/missing references never remain usable by a comparison or unused proof. Staff deletion detaches attribution on other people's retained records and removes current access. Do not erase another commissioner's material solely because its observing staff account is deleted.

## Denial and error oracles

Authorize before semantic lookup errors or stale/reference diagnostics. For a validly authenticated but unauthorized caller, real, unknown, cross-order, erased and unretained ids yield the same 403 envelope:

```json
{"statusCode":403,"code":"DIAGNOSTIC_NO_ACCESS","message":"Inspection request could not be completed","timestamp":"<runtime string>","requestId":"unknown"}
```

The requestId above is the existing HTTP harness value; compare production request ids only after stripping that field and timestamp. No extra details, versions, hashes, correction/provenance existence or byte prefixes. Missing/invalid authentication follows the existing global guard, with no resource facts. Strict syntax failures use 400 `DIAGNOSTIC_INVALID_INPUT` and `Invalid diagnostic request`; this syntactic response must be independent of target existence. Authorized invalid provenance, absent rights, expired rights or erased content uses generic 403; stale/conflict and invalid-byte errors are only available after current authorization. An authorized exact object read that fails integrity/storage delivery returns generic 503 `DIAGNOSTIC_EVIDENCE_UNAVAILABLE`, no bytes, key or upstream error. Recheck authority before returning even that failure so revocation remains generic 403.

## One ordered HTTP RED to GREEN assignment

Use one new production-boundary suite following [identity-history composition](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityHistory.e2e.spec.ts) and [report/storage journeys](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReports.e2e.spec.ts). Real Nest module, current JWT/session/grants/qualifications, PostgreSQL and the existing object-storage test boundary. Only fixture authority/time/storage edges may be controlled; never mock repositories, authority or a future proof model. Set up order/physical authorization/arrival/raw observations through existing HTTP. Do not import future generated Prisma types to force RED.

1. First new assertion: technician `POST /orders/O/identity-provenance` with the complete synthetic classification above expects literal HTTP 201 and exactly `{id:P0,state:"staged"}`. At supplied base the route is absent, so predicted behavioral RED is 404 versus 201 after setup succeeds. Root must observe it before source work; this document claims no executed RED. Minimal GREEN supplies classified intent, binary upload, evidence append/read, correction linkage and lifecycle as one slice.
2. Upload fixed synthetic image, assert 200, exact key set, literal sanitized MIME/size/hash and protected byte read. Capture E0 against I0 at V, assert 201, resulting V+1, literal `SYN-CHASSIS-041`, location, full rights, actor/time and P0 hash. Retrying changes neither list length nor returned orderVersion. Changed id content conflicts. No report is needed to capture evidence.
3. Create/finalize A after E0. Append I1 if needed, upload P1 and append E1 correcting to `SYN-CHASSIS-014` with the literal explanation above. History retains E0 byte-for-byte, distinct E1 hash/id, explicit parent, both original/corrected raw observations and both provenance bindings. A's released representation/hash and raw/evidence pin stay unchanged; comparison shows E0 plus E1 as a later correction. An unrelated raw observation stays outside that chain. A later same-visit report correction inherits the original pins. Capture after an earlier unpinned report does not fill its historical evidence pin.
4. Assert 400 for unknown keys, empty identifiers/explanation and URL references; 403 for syntactically valid missing, foreign, unverified or expired provenance. Assert 409 stale write and competing correction loser, followed by unchanged readback except the single winning append. Exact retry succeeds once without duplicate history. Revocation through existing HTTP immediately denies the same JWT, including a held object read before delivery; equivalent unknown/erased id requests have identical normalized denial bodies.
5. B's same VIN and contradictory chassis must read back `SYN-CHASSIS-999`; capture cannot silently merge it with A. A visit with only `manualReference:"same car as A"` has no structured evidence. Add the later issuance refusals to the separate proof suite once issuance exists; this slice must not create a pretend proof to test them. Comparison/download denies B-only staff, commissioner, admin, expired/revoked staff and missing either assignment. Current both-order staff sees only pinned material and explicit correction edges.
6. Use the existing purge harness for commissioner erasure and staff detachment, plus held storage write/read races. Assert post-fence HTTP 403 without bytes, inaccessible hashes/text/linkage, and exact object cleanup after writer settlement, without deleting a different commissioner's material. Test declared synthetic rights expiry using the clock boundary. Do not model an unapproved real hold as ordinary technician input. Hosted transaction/storage evidence is required for GREEN; offline docs checks prove none of it.

## Source ownership map and unresolved gates

| Owner | Narrow change for the later source assignment |
|---|---|
| Contracts, `packages/contracts/src/schemas/diagnostics.ts` | Strict stage/append/response/read schemas; diagnostic subset of existing rights vocabulary; preserve raw history/report reader shapes |
| Diagnostics presentation and port | Order-only classified provenance/evidence routes, binary parser reuse, error mapping, comparison membership download |
| Diagnostics intake/evidence persistence and authority | Atomic append/correction, current technician capture versus staff read, both-order comparison, reference validation and generations; reuse existing object adapter |
| Report persistence, coordinated with report-binding writer | Nullable structured pin alongside independently delivered raw pin; creation selects current leaf, same-visit corrections inherit; no snapshot rewrite |
| DB schema and forward migration | Narrow tables, report pins, immutable/check/FK/unique guards and erasure exceptions; reset manifest/schema invariant updates where required |
| Worker diagnostics cleanup/account erasure | Exact provenance intent cleanup, attached-item retention, rights expiry/access fence, erase-before-intake ordering and staff detachment |
| One HTTP suite and affected purge/storage suite | The ordered observable assertions above; no rewriting existing tests to erase established coverage |

This writing task owns only this new document. No source/schema/test/canonical spec is changed here; other writers own report-binding tests. No nested agents, services, DB/Docker, Railway, credentials, CI operations, GitHub content mutation or separate PR.

No unresolved founder choice is needed for manual/VIN comparison or comparative authority. A real operational/policy gap remains: ADR-0104/0108 do not supply source-specific lawful collection bases, actual retention/deletion schedules, export permissions or hold authority for real identity evidence. Engineering cannot choose these from a hash, staff role or synthetic example. Root must obtain the applicable approved rights/hold record before enabling real collection; keep it closed if unavailable. This is a collection/readiness gate, not a reason to weaken the synthetic evidence contract or reopen accepted continuity policy.

Docs-only validation is exempt from behavioral RED. PASS: `pnpm check:agent-docs`, `pnpm check:glossary`, all 12 local Markdown links resolve, and `git diff --check`. Docs: no external dependency/API lookup was needed; the design uses inspected repository contracts and accepted decisions. No runtime, hosted or deployed result is claimed. Push the document checkpoint for root assembly and stop.
