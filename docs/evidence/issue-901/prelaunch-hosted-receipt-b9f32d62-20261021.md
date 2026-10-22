# Hosted receipt for b9f32d62, 2026-10-21

Candidate `b9f32d62e38a07f056f639dc37ec4f6d585f7162`, tree `c5d4f2556ba03941c57ab8d63ace3dc4c89e087b`, through sole draft PR #904. Results below apply to that candidate only.

PR Checks [39694240024](https://github.com/Carberk/carberk/actions/runs/39694240024): lane, static, DB and frontend pass; docs skip; API and aggregate `pr` fail. Image runtime [39694239822](https://github.com/Carberk/carberk/actions/runs/39694239822) passes.

| Gate | Actual result | Limit |
|---|---|---|
| DB `119547846931` | 41/41 files, 391/391 tests pass | This run passes the interrupted Redis and seed cases. The earlier conflicting backend observation remains unexplained; no repair was made. |
| Worker, within API job | 57/57 files, 373/373 tests pass | Deployed producer exclusion and accepted-storage-request drain remain open. |
| API `119547846812` | 322/324 files, 3162/3171 tests pass | Six intended private proof-consumption failures plus three retained full-v3 reset-tail failures. |
| Existing proof issuance, security, invalidation and audit rollback | Original 69/69 cases pass | Genuine issuance missing-route RED remains preserved in the predecessor receipts. This does not establish consumption. |
| Six new proof-consumption cases | HTTP 400 received, 201 expected | Ordinary issuance, restricted reads and comparative setup pass before each first consumption POST. Subsequent draft, retry, conflict and evidence-isolation assertions are unreached. |
| Retained full-v3 reset tails | Same three failures | Support barrier at `CampaignFullV3.e2e.spec.ts:2299`; publish and attach suspended-PUT assertions at `:3288`. Later ordering assertions remain unreached. |

The six consumption failures are at `DiagnosticContinuityProofIssuance.e2e.spec.ts:503`, `:547`, `:566` (three parameters) and `:587`. Source at this candidate has a strict reinspection schema without `proofId`; its admission still supports only the temporary public equal-VIN path. The reached HTTP 400 is the intended first RED for the bounded private manual/manual consumption slice. It proves none of its later assertions. The [original test checkpoint](../issue-897/diagnostic-private-manual-consumption-red-20261021.md) remains unchanged.

The [31b9 receipt](prelaunch-hosted-receipt-31b9b83b-20261021.md) remains historical. Its locked-reset count of one and unattributed PID 467 justify further test-only attribution, not a weaker reset guard, retry or timeout increase. The installed testcontainers health check is a candidate source of an ordinary client backend; no causal attribution is established by either run.

Private API log: `/tmp/carberk-resume-20261021/b9f-api-119547846812.raw.log`, SHA-256 `276ac9c7920ae836246c06dec72e24950e7f26c498f7dfef43809aca41cf3132`. No credential-bearing log content is committed.

Next owner: the isolated private manual consumption source writer, based on this exact candidate. Root owns assembly and hosted verification. Automatic/mixed/corrected identity, public transfer, concurrent consumption, later lifecycle acceptance and reset closure remain separate required work. Existing reset/CampaignFullV3 bodies remain unchanged.

No reset, deletion, deployment, merge, promotion, store submission or Railway retry occurred. Exact live inventory and approved reference edits, enforceable worker/producer exclusion, storage-request drain, object cleanup/reseed/reopen, independent review, native/deployed acceptance, staging restoration and signed release evidence remain open.
