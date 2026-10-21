# Hosted receipt for 2b00c38e, 2026-10-21

Candidate `2b00c38ec28d6180d4fd32ccc248e8735dd44d53`, tree `dafde1c05aedf31522fcc9363d490423794b4879`, through sole draft PR #904. This receipt classifies completed hosted runs on that candidate. It does not establish checks on a later candidate or deployed acceptance.

## Exact results

PR Checks [39660947360](https://github.com/Carberk/carberk/actions/runs/39660947360): lane, static, DB and frontend pass; docs skip; API and aggregate `pr` fail. Image runtime [39660947355](https://github.com/Carberk/carberk/actions/runs/39660947355) passes.

| Check | Result | Interpretation |
|---|---|---|
| DB job `119433585275` | 40/40 files, 387/387 tests pass | Includes actual interrupted Redis completion recovery and negative controls. |
| Worker suites in API job | 57/57 files, 373/373 tests pass | Includes diagnostic identity retention. |
| API job `119433585642` | 321/323 files, 3086/3090 tests pass | One new intended proof-issuance failure and three retained legacy reset failures. |
| Private comparative proof issuance | 0/1 | Setup reaches the absent issuance route; actual response is 404, expected 201. |
| Diagnostic lifecycle and existing identity foundations | Pass | No new failure in lifecycle, original classified evidence, history, report binding or erasure. |

## Redis recovery is runtime GREEN

The [predecessor receipt](prelaunch-hosted-receipt-2e4b5a09-20261021.md) preserves the genuine recovery RED. Source checkpoint `a1512b34`, assembled as `ea563a4e`, now passes on this candidate. Recovery requires the real pending PostgreSQL intent, exact canonical permanent completed marker and empty disposable post-state. It completes once through PostgreSQL compare-and-set without Redis recovery writes. Changed authority, context, rows, marker or restored disposable state refuses. The three protected original DB reset suites remain unchanged.

Actual Redis process restart and persisted-marker-loss continuity still need separate tests. This result does not establish them. Object cleanup, reproducible reference overlays, reseeding, producer exclusion, storage-capability drain and safe reopening also remain incomplete. No environment was reset.

## Private proof issuance is actual intended RED

The new `DiagnosticContinuityProofIssuance.e2e.spec.ts` passes its existing HTTP/storage setup through line 275. Two separately authorized private orders share a nonnull commissioner. An independent qualified reviewer is assigned to both. Each visit has manual identity observations and classified uploaded evidence. A's finalized report keeps its original raw/evidence pin after a later A observation. Restricted comparison and evidence-byte reads succeed.

At line 276 the issuance request receives 404 instead of 201. This is the missing criterion, rather than a setup, import or dependency failure. Later assertions about the restricted proof response, audit and lack of a B report or A successor remain unreached. No issuance implementation or durable proof exists yet. ADR-0108 is approved; it needs no further policy approval for this bounded slice.

An isolated test writer is extending current-session authority, independence, provenance, isolation and non-disclosure refusal cases. Those tests must reach their own genuine hosted failures before source implements the refusal behavior. The first happy-path RED does not prove later security assertions.

## Retained failures and limits

`CampaignFullV3.e2e.spec.ts` retains the same three failures: the Support barrier at line 2299 and publish/attach suspended-PUT assertions at line 3288. No assertion, timeout budget or skip changed. They remain until equivalent product and operator replacement coverage is GREEN on the same assembled candidate. The candidate is not release GREEN.

No reset, deletion, deployment, promotion, merge, store submission or infrastructure change occurred. Scoped Carberk Railway access remains refused; no account-wide alternative, credential lookup or retry is authorized by this receipt. Approved seed/reference edits remain unknown until target-specific inventory can run. Configuration, credentials, signing identities and infrastructure must survive any future authorized reset. Native, browser, deployed, restoration, independent review and signed Android release gates remain open.

## Raw evidence

- API `/tmp/carberk-resume-20261021/2b00c38e-api-119433585642.raw.log`, SHA-256 `99e2a9aa365d83041f10067a84a7c5ca605602973eef4eb902bc6586e7d95450`.
- DB `/tmp/carberk-resume-20261021/2b00c38e-db-119433585275.raw.log`, SHA-256 `77e19c3a8718f44b1040a326f41bac1ab18187620418822dfd1732a812aa3f63`.

The raw files and completed PR check rollup were read during recovery. This receipt is documentation-only and needs no RED test. Its local checks cover documentation links, glossary and diff integrity. No CI rerun was requested.
