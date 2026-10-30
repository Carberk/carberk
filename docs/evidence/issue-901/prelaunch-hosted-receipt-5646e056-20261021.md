# Hosted receipt for 5646e056, 2026-10-21

Candidate `5646e056b5ce7f3602dd3b2d5edf3cf80eea3e26`, tree `523d6be91d029b2218b69a9ab6ee1f1857460a50`, through sole draft PR #904. These completed results apply to that exact candidate.

PR Checks [39682692250](https://github.com/Carberk/carberk/actions/runs/39682692250): lane, static and frontend pass; docs skip; DB, API and aggregate `pr` fail. Exact-head image runtime [39682692258](https://github.com/Carberk/carberk/actions/runs/39682692258) passes.

| Gate | Actual result | Limit |
|---|---|---|
| DB `119509158352` | 40/41 files, 390/391 tests pass | Only the new reference-seed snapshot fails. |
| Interrupted Redis suite | All six cases pass | Includes all three actual process-restart cases. This is disposable-service evidence, not deployed quiescence. |
| Seed reconstruction | First seeded snapshot differs from its expectation | Migration deployment, empty pre-seed state and first seed process complete. Identity checks, repeated seeding and the second database are unreached. |
| Worker, within API job | 57/57 files, 373/373 tests pass | No deployed worker exclusion or storage-grant drain proof. |
| API `119509158396` | 321/323 files, 3086/3155 tests pass | 66 missing private-proof routes and three retained full-v3 reset failures. |
| Private proof issuance | 66/66 fail after real setup | Positive issuance expects 201 and receives 404 at line 304. Direct refusal cases reach helper line 421. Read-dependent cases stop at ordinary issuance line 437. |
| Retained reset tails | Support barrier at line 2299; two suspended-PUT assertions at line 3288 | Same three failures as the previous receipt. No assertion, timeout or skip changed. |

The seed correction is test-only checkpoint `e4680cc46230bb6ea86fc2dcb31954f73662cec0`, assembled as `f115de20`. The [seed evidence](reference-seed-reconstruction-20261021.md) pins the 15 existing duplicate natural-key groups and literal persisted names, 2,420 model rows, 2,632 total identities and lexical SQL currency ordering. Raw source counts/checksums and full semantic comparisons remain. This diagnoses the expectation mismatch; corrected runtime remains pending.

Root reran DB lint, DB typecheck, TypeScript 6, seed test collection, runtime imports, agent docs, glossary and diff checks after assembly. All pass. The one intended seed case collects. The three original reset specs, interrupted Redis spec and both CampaignFullV3 specs are byte-identical to `5646e056`. No local container ran.

Raw evidence:

- DB `/tmp/carberk-resume-20261021/5646e056-db-119509158352.raw.log`, SHA-256 `1f14cfbb6e0e761c3d171b24a57ef9fbc0675f55f25f9c1ffec69455efc0f31f`.
- API `/tmp/carberk-resume-20261021/5646e056-api-119509158396.raw.log`, SHA-256 `df0d2d231fee66c14fa85314b17f857f08de4b809aaafccead347568dd50423b`.

No environment reset, deletion, deployment, merge, promotion, store submission or infrastructure mutation occurred. Scoped Railway access remains refused and was not retried. Approved live reference edits, enforceable producer exclusion, outstanding storage-grant drain, object cleanup/reseed/reopen, independent review, native/deployed acceptance, restoration and signed artifacts remain gates. Retiring old preservation tests still requires equivalent product and operator proof green on the same assembled candidate under the [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md). Public launch ends blanket data disposability.
