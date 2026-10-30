# Hosted 070 result and next candidate

Exact published head `070bd66c03a1efc5426f77dc5ee56ca96236e93e` has terminal [PR Checks 39844907607](https://github.com/Carberk/carberk/actions/runs/39844907607), conclusion FAILURE. [API 120055649855](https://github.com/Carberk/carberk/actions/runs/39844907607/job/120055649855) completed with 329 passing and four failing files, 3,253 passing and six failing tests. Worker passed 57 files/373 tests. [DB 120055649865](https://github.com/Carberk/carberk/actions/runs/39844907607/job/120055649865) passed 41 files/392 tests. Lane/static/frontend and image runtime passed; docs skipped under unchanged policy. Aggregate PR failed because API failed. This run finished rather than hitting the preceding run's job limit.

Root downloaded exact job metadata and logs under `/tmp/carberk-resume-20261021/070-*`. API raw SHA-256 is `d7eb946f35d8d44236b90406c4a159a6ec890b105e89381caa843d3c9487a0ca`; DB raw SHA-256 is `a2156149cd51a51b7beffdb791084572ee3743a99389483074477ab197ef571d`. The original logs remain alongside normalized text.

## Reached behavior

| Journey on exact 070 | Result and implication |
|---|---|
| Supported manual correction | HTTP PASS 1/1. |
| Uncorrected mixed manual/VIN in both directions | HTTP PASS 2/2. |
| Manual correction conflict/expired ancestor rights | HTTP PASS 2/2. |
| Mixed conflicting identity | HTTP PASS 2/2. |
| Unchanged normalized-VIN automatic proof | HTTP PASS 1/1. |
| Existing private issuance/security/consumption suite | HTTP PASS 99/99. |
| Improvement scorecard journey | HTTP PASS 4/4. Earlier c4 unavailable failure remains evidence at that SHA; no cause or code fix is inferred from this pass. Keep the full journey in subsequent candidate verification. |
| Supported VIN correction C2 | Genuine reached RED at issuance, line467: 403 instead of201 after its retained comparison setup. The [locally assembled VIN source](vin-correction-assembly-20261022.md) is not present on070 and awaits its own hosted result. |
| Public seller/Listing transfer P1 | Genuine reached RED at issuance, line497: 403 instead of201 after its retained comparison setup. Public source remains unfinished. Later read/consumption/lineage assertions are unreached. |

These results prove their named journeys at070, not full ADR-0108 completion or the later local source candidate. Corrected mixed, public transfer, staff UI and automatic eligibility decisions remain open.

## Consumed predecessor erasure journey

The isolated real worker ran and the test reached line563 of `DiagnosticConsumedPrivateLinkErasure.e2e.spec.ts`. Before that point it proved A's restricted proof deletion, original identity evidence redaction, provenance removal/rotated epoch and exact object absence, B's identity/provenance/object survival, unchanged report/raw/PDF rows, and both raw history responses.

The failure compares a buyer response with the staff response stored as `released`. The exact diff contains only `authorId` and `reviewerId`, expected staff ids but received null. Current `PrismaDiagnosticReports.dto` explicitly hides both fields for non-staff; the existing `DiagnosticReports.e2e.spec.ts` buyer reader assertion also requires null. This identifies a test-oracle mismatch at the reached assertion, not evidence that erasure deleted staff attribution. Stored report equality already passed immediately before it. A bounded test repair must compare each audience to its own before-erasure response and retain all deletion/isolation checks. No product disclosure should be widened to satisfy this expectation.

The subsequent documents/read refusals, exact retry, own finding write and retry-after-write assertions did not execute. They remain UNKNOWN until the corrected complete journey passes. Root has not changed the test in this classification checkpoint.

## Retained reset failures

Three `CampaignFullV3.e2e.spec.ts` cases remain failures. The selected Support-worker case stops at line2299 because the lock barrier was not observed within the existing budget. Its bounded diagnostic reports remainingAtEntryMs and remainingAtFailureMs both -3087, with the worker waiting on an advisory lock. This is evidence of the reached timing state; it does not establish product ordering or authorize a larger budget.

Both recorded publish/attach-generator cases reach line3288 and find the PUT already completed before release, where the test requires it still suspended after exact reset. Neither supplies the required ordering proof. Preserve these tests pending equivalent green product/operator coverage and an evidence-based disposition. Do not skip them, raise timeouts, or classify them as flaky from this log.

## Publication and sequencing

The published run is terminal, so the [verified local VIN assembly](vin-correction-assembly-20261022.md) and held prerequisite records can now be published without cancelling live CI. Root will verify the remote integration head before the normal fast-forward push. A single read-only Codex staff foundation auditor remains active from `9f2b0bfd`; no second assignment was dispatched.

Next gates are actual C2/new-negative runtime evidence, a bounded consumed-erasure oracle repair, public transfer/current publisher authority, corrected mixed identity, staff design/implementation and retained reset closure. Final independent fixed-SHA review, native/browser/deployed/operations acceptance, latest-main restoration and exact signed Android artifact remain required. This receipt is classification, not acceptance or independent review.

No CI rerun/cancel, local service, Railway retry, reset, deployment, merge, promotion, store submission or launch occurred. The three scoped Railway refusals remain terminal. Prelaunch reset prerequisites and separate store/public-launch decisions remain in force.
