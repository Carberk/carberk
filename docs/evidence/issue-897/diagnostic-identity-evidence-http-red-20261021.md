# Diagnostic identity evidence HTTP RED preparation

Bounded test checkpoint for #914 within #897, sole integration PR #904. Base `155888271a0e53af5279a69298576019bcbae6b3`; branch `agent/issue-914-identity-evidence-http-red-20261021`, reserved and pushed before edits. Reused host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-96fd7a16`; scaffold `t3/issue-914-identity-evidence-http-red` remains at the supplied base. No production implementation or runtime acceptance is claimed.

Only [the new HTTP suite](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityEvidence.e2e.spec.ts) and this note are owned. The suite implements the ordered [capture contract](diagnostic-identity-evidence-capture-contract-20261021.md) under [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md), [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) and the [next RED contract](diagnostic-pair-proof-next-red-contract-20261021.md).

## First expected RED

Run the new suite on disposable hosted PostgreSQL/private MinIO with the repository's existing HTTP harness. The first test creates a synthetic public order through HTTP, assigns qualified staff, records physical/publication authorization, arrives and records I0. Its first new assertion is the assigned technician's `POST /api/v1/diagnostics/orders/O/identity-provenance` with P0, the current order version, `image/png`, input size 95 and the complete literal synthetic rights object. It expects HTTP **201** and exactly `{id:P0,state:"staged"}`. At this base the route is absent, so the predicted behavioral RED is **404 versus 201** after ordinary intake succeeds.

Root must observe and record that failure before authorizing production source work. No HTTP test, DB connection, storage request, service startup, CI dispatch or CI polling was performed here. Compilation is not behavioral RED. The report-binding slice in `d124d8c4` is independently actual-RED-pending; this checkpoint does not assert its GREEN.

## Prepared coverage

| Contract | Observable oracle in the new suite | Runtime result |
|---|---|---|
| Classified collection before bytes | Exact staged intent/retry and verified metadata, raw binary upload, version unchanged, protected byte download | Pending root run |
| E0 against I0 | Complete strict response, literal chassis/location/rights/actor/time, raw five-field observation/hash binding, one version increment, exact retry and conflicting retry | Pending root run |
| I1/E1 justified correction | Original `SYN-CHASSIS-041`, corrected `SYN-CHASSIS-014`, explicit E0 parent/explanation, new blue provenance, unchanged E0/hash and ordered list | Pending root run |
| Report pin and snapshot | First-draft raw pin despite reobservation, structured leaf despite correction during draft, original release snapshot hash unchanged after later correction, editorial successor inherits pins | Pending root run |
| Restricted comparison | Exact predecessor/candidate wrapper, pinned E0 plus E1, corrected leaf includes ancestor once, unrelated later observation/root/download excluded | Pending root run |
| Reader compatibility | Exact raw-history shape; ordinary staff/commissioner/public report and document-list responses unchanged across capture; literal identity/hash/rights no-leak checks | Pending root run |
| Strict collection input | Table of unknown fields, empty/oversized identifiers/explanation, URL/duplicate references, nested rights/schedule/hold violations, unsupported size/type, malformed binary/query | Pending root run |
| Retained provenance | Missing, foreign-order, staged/unverified, expired references refused; missing classification cannot create an upload intent | Pending root run |
| Retry/race integrity | Stale append refused, two corrections yield exactly one 201 and one 409, exact old-version retries retain one record, overtaken leaf refuses, unchanged raw history and only one version increment | Pending root run |
| Truthful insufficiency | Equal VIN retains contradictory `SYN-CHASSIS-014`/`SYN-CHASSIS-999`; `same car as A` alone has null evidence; later capture cannot fill an earlier report's absent evidence pin | Pending root run |
| Current authority/no leak | B-only technician, either-order-only reviewer, commissioner, admin, other user and unassigned technician denied; real/unknown references share strict 403; stale/reference diagnostics do not bypass authorization | Pending root run |
| Async delivery and expiry | Same JWT loses A or B assignment while actual S3 read result is held; no bytes delivered; current Session deletion and expired qualification deny; declared rights expiry fences reads/retries/comparison | Pending root run |
| Storage failure | Delete only an owned retained object, then assert exact generic 503 without bytes/key/hash/upstream detail; unauthorized reader still gets generic 403 | Pending root run |

All production repositories, authority, JWT/Session checks, grants, qualifications, order assignments, Nest `DiagnosticsModule`, sanitizer and private S3 adapter remain real. Only established synthetic admission/time fixture authority and a held actual storage-port read are controlled. Identity, reports, evidence and corrections are created through HTTP. There are no future generated model imports, fabricated proofs or DB-seeded diagnostic records. Fixture DB writes create current users/Sessions/grants/qualifications/catalog/Listing only, and exercise Session/qualification revocation.

The synthetic images are 4x4 solid-color PNG tiles prepared offline with installed Sharp 0.34.5 and libwebp 1.6.0. They make no claim to show a real chassis. Input/output base64, lengths and sanitized SHA-256 are literal in the suite, never derived through production helpers at assertion time:

| Fixture | PNG bytes | Retained WebP bytes | Literal SHA-256 |
|---|---|---|---|
| Red | 95 | 72 | `2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1` |
| Blue | 94 | 70 | `b7b11262b6b5f09879357d0857c949d7713b380c8b3a4682b0421390a0c7f873` |

The same-length conflicting-upload case uses blue PNG plus one trailing zero byte, independently checked offline to retain the pinned blue WebP output. Dynamic raw/evidence/snapshot hashes are read through HTTP, checked for strict shape and preserved by exact comparisons; the suite does not duplicate production canonical hashing.

## Limits and source handoff

- This is prepared acceptance, not observed RED/GREEN. Hosted transactions, storage, concurrency scheduling and setup remain unverified. The correction race proves one observable winner, not a deterministic blocked-transaction interleaving. Audit atomicity and DB invariant enforcement need their affected persistence tests; no audit-read API is invented here.
- Structured account purge, staff attribution detachment, erased-reference equivalence, generation/epoch invalidation during erasure, holds, held uploads/write leases, worker settlement and exact post-settlement object cleanup are deferred to the affected worker/purge suite. Another writer owns the product raw-identity account-erasure test. Rights-expiry denial here does not prove worker deletion. No erased row, hold permission or cleanup completion is fabricated.
- PDF coverage preserves the existing document-list shape. No PDF row/body is fabricated and no rendered PDF is generated here. Existing report/PDF suites remain required.
- No issuance, consumption, linking, transfer or later proof refusal is implemented/tested. Contradictory/insufficient evidence is retained truthfully; the later proof suite must refuse it rather than infer success.
- The structured comparison intentionally expands the first binding slice's raw five-field `identity` to `{observation,evidence,corrections,evidenceGeneration,correctionHeadHash}`. The later source writer must mechanically adapt `DiagnosticReportIdentityBinding.e2e.spec.ts` to that wrapper while preserving every raw-pin, authority and unchanged-snapshot assertion. This checkpoint leaves it untouched.
- Cleanup uses only this suite's center/user aliases, known report leaves and allocated provenance UUIDs with the two pinned object hashes. It never lists/deletes a bucket or performs unscoped DB cleanup. Future evidence/provenance FK teardown compatibility must be verified with the implemented schema; no future table/delegate is guessed here. Held reads release and drain in `finally`. Keep this active worktree for root integration; no retirement was attempted.

## Offline verification

PASS: contracts build; DB generate/build with inert `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline`, no connection; API TypeScript 7 configured typecheck and TypeScript 6 `tsc6 --noEmit --ignoreDeprecations 6.0`; focused ESLint with zero warnings; agent-doc/glossary gates; local note links; `git diff --check`.

Preparation command corrections: Prisma requires `DATABASE_URL`, not `PRISMA_DATABASE_URL`; this workspace exposes TS7 as `tsc`, not `tsgo`. An early API check ran before DB build completed and failed to resolve DB declarations. Checks were rerun after the dependency build, and new-test type errors were corrected before the passing runs. These failures are not behavior RED.

Docs: not applicable to external API changes. No dependency/version changes; installed repository test composition, adapter implementation/types and offline fixture encoding were used. Full tests, hosted acceptance and final integration review remain root-owned. No separate PR or GitHub content mutation was made.
