# Hosted receipt for 7283f2f1, 2026-10-21

Candidate `7283f2f1318a7208a5266e7a1762dba14c07184e`, tree `e5061622216da17eb48a5a9338c84de84da06d4b`, through sole draft PR #904. This receipt classifies completed hosted checks on that candidate. Later candidates need their own checks.

PR Checks [39679193185](https://github.com/Carberk/carberk/actions/runs/39679193185): lane, static and frontend pass; docs skip; DB, API and aggregate `pr` fail. Exact-head image runtime [39679193187](https://github.com/Carberk/carberk/actions/runs/39679193187) passes.

| Gate | Actual result | Limit |
|---|---|---|
| DB `119497114852` | 39/40 files, 387/390 tests pass | All three new restart cases stop at configuration snapshot equality before recovery assertions. |
| Worker, within API job | 57/57 files, 373/373 tests pass | Product worker evidence; no deployed quiescence proof. |
| API `119497114965` | 321/323 files, 3086/3155 tests pass | 66 missing private-proof route failures and three retained legacy reset failures. |
| Private proof issuance suite | 66/66 fail | Real setup reaches the missing route. Positive issuance expects 201 and receives 404 at line 304; direct refusal cases expect 403 and receive 404 at helper line 421. |
| Proof reads | Unreached after ordinary issuance | Read-dependent tests stop at `ordinaryProof` line 437, expected 201/received 404. This run proves no downstream read assertion. |

The private proof tests preserve the original positive body and use ordinary two-visit authorization, identity capture and classified retained evidence. No catalog collision or setup exception masks the missing issuance behavior. This genuine RED authorizes the bounded private same-commissioner, manual/manual issuance source slice under approved ADR-0108. Public transfer, corrected identity, proof consumption, exact retry, stale-generation races and lifecycle completion remain separate required work. Current qualified staff assigned independently to both visits may read restricted comparisons/proofs; issuance requires an independent qualified reviewer. B-only staff are denied.

The Redis restart cases reach `restartRedis` line 381 after the same-container/different-process checks. The failed comparison hashes the raw multi-option `CONFIG GET` result. Root assigned a focused ordering-versus-value diagnosis, preserving the configuration equality assertion and all original reset oracles. Recovery outcomes after restart remain unknown. The [2b00 receipt](prelaunch-hosted-receipt-2b00c38e-20261021.md) remains the prior runtime GREEN for uninterrupted and interrupted lost-reply recovery without process restart.

The same three protected `CampaignFullV3.e2e.spec.ts` tails remain RED: Support's barrier at line 2299 and publish/attach suspended-PUT assertions at line 3288. No budget, assertion or skip changed. Retirement still requires equivalent product and operator replacement proof GREEN on the same assembled candidate under the [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md).

Root also inspected and assembled the test-only seed reconstruction checkpoint `82e1a44d` as commits `93cdaabb`, `52bb9769` and `02e8c171`. One case collects through `vitest list tests/reference-seed-reconstruction.e2e.spec.ts --json`; changed-spec ESLint and DB typecheck pass in the ordinary integration dependency setup. A preceding incorrectly rooted runtime filter matched no files and supplies no test evidence. No local container ran. Hosted execution across two empty databases and repeated seeding is pending; approved live reference edits, overlays and logos remain unknown.

Raw evidence:

- DB `/tmp/carberk-resume-20261021/7283f2f1-db-119497114852.raw.log`, SHA-256 `7fe8323f482af14df25d9d959545e0c5d58d4462922a855edc8cf8037f30a607`.
- API `/tmp/carberk-resume-20261021/7283f2f1-api-119497114965.raw.log`, SHA-256 `51ec15c8b43a2685e351fea6315b5f5a72b3dc98e818cb8ceee8618a7835c605`.

No environment reset, deletion, deployment, merge, promotion, store submission or infrastructure mutation occurred. Scoped Railway access remains refused and was not retried. Approved seed edits, enforceable producer exclusion, outstanding storage-grant drain, object cleanup/reseed/reopen, independent review, native/deployed acceptance, restoration and signed release artifacts remain gates. Public launch ends blanket data disposability.
