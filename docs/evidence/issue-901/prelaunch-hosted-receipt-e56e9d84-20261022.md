# Hosted receipt for e56e9d84, 2026-10-22

Candidate `e56e9d84ace21e3924817acb094ea5b761baa55c`, tree `97f2fda2b343cc526969d06a8f941a73e70b73cb`, through sole draft PR #904. Results apply to this candidate only.

PR Checks [39697405425](https://github.com/Carberk/carberk/actions/runs/39697405425): lane, static and frontend pass; docs skip; DB, API and aggregate `pr` fail. Image runtime [39697405368](https://github.com/Carberk/carberk/actions/runs/39697405368), job `119558040909`, passes.

| Gate | Actual result | Limit |
| --- | --- | --- |
| DB `119558140041` | 40/41 files, 390/391 tests pass | One interrupted Redis restart case stops before its intended restart assertion. No runtime repair established. |
| Worker, within API job | 57/57 files, 373/373 tests pass | Deployed producer exclusion and accepted-storage-request drain remain open. |
| API `119558139737` | 322/324 files, 3162/3171 tests pass | Six intended private consumption REDs and three retained CampaignFullV3 reset tails. |
| Original proof issuance, security, invalidation and audit rollback | 69/69 cases pass | Does not establish consumption. |
| Six private consumption cases | First consumption POST receives HTTP 400, expected 201 | Ordinary issuance/comparison setup succeeds. Draft isolation, retry, conflict and one-use assertions after the POST remain unreached. |
| Retained CampaignFullV3 reset tails | Same three failures | Support barrier at `:2299`; publish and attach suspended-PUT assertions at `:3288`. Later ordering assertions remain unreached. |

The six consumption failures remain at `DiagnosticContinuityProofIssuance.e2e.spec.ts:503`, `:547`, `:566` (three parameters) and `:587`. The strict input at this candidate does not accept `proofId`. The completed source checkpoint `8e5dc539eb82e943ce7f4098ff6b3590f0c5f31f` is separate and has no hosted GREEN yet.

## Same-observation backend attribution

The DB failure is `staging-clean-reset-redis-interrupted.e2e.spec.ts`, “refuses pending PG after a real Redis restart loses the marker even with empty queues”. At `run():274`, `proxy.dropped()` is undefined instead of `lua-reply`, before the intended restart/refusal assertions.

The bounded instrumentation reports:

- Observer 429 sees zero other connections before the run at 225201–225204 ms.
- SQL child ordinal 218, PID 473, connects at 225318 ms, closes at 225578 ms and exits at 225587 ms.
- That child's actual initial-inventory observation selects one backend, PID 480, classified `pg-isready:loopback:known`.
- Observer 429 sees zero other connections afterward at 225588–225593 ms.

This is evidence of a loopback health probe in this instrumented guard observation. The guard's unsafe-backend refusal prevented the later Redis interruption. It does not prove the earlier unexplained PID 467 was the same source, establish a repair, or justify filtering out connections, relaxing quiescence, retrying or increasing a timeout. A read-only task is inspecting the smallest fixture lifecycle correction while preserving the unsafe-backend oracle and protected test bodies. Real product/operator quiescence remains a separate release requirement.

Private logs:

- `/tmp/carberk-resume-20261021/e56e-db-119558140041.log`, SHA-256 `2940bf82e5af734e2d0782b23d685164bf5608c2338e68e035dfc367bd33b5e8`.
- `/tmp/carberk-resume-20261021/e56e-api-119558139737.log`, SHA-256 `c16c5f240c5620371081f5229b4d34f3ed322a1e7ba96a62927b1b2556a06a18`.

No raw credential-bearing log content is committed. The earlier empty DB capture was an unavailable-log attempt, not terminal evidence; these populated logs replace it for classification.

## Next boundary

An isolated Opus 5.5 medium assembly writer inspects `8e5dc539` and assembles it onto exact e56e, preserves all protected tests/instrumentation and verifies affected offline gates. Root inspects that handoff, publishes the candidate to PR #904, and requires hosted migration/HTTP evidence. Automatic VIN, mixed and corrected identity, public transfer, concurrency, later lifecycle acceptance and reset closure remain required. Full fixed-SHA independent Standards/Spec review follows combined green CI.

No reset, deletion, deployment, merge, promotion, store submission or Railway access retry occurred. Live inventory and approved reference edits, enforceable worker/producer exclusion, storage-request drain, cleanup/reseed/reopen, native/deployed acceptance, staging restoration and signed release evidence remain open. Prelaunch disposability removes historical preservation requirements only.
