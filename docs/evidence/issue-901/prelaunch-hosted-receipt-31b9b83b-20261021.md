# Hosted receipt for 31b9b83b, 2026-10-21

Candidate `31b9b83b646eafde04141aa2f81c6c7c2d5bc680`, tree `ffd4bf40774ac410a3f3d657b30438e09b1bf2d8`, through sole draft PR #904. These results apply only to that candidate; the subsequent consumption test checkpoint is described separately and needs its own hosted run.

PR Checks [39691115985](https://github.com/Carberk/carberk/actions/runs/39691115985): lane, static and frontend pass; docs skip; DB, API and aggregate `pr` fail. Image runtime [39691116028](https://github.com/Carberk/carberk/actions/runs/39691116028) passes.

| Gate | Actual result | Limit |
|---|---|---|
| DB `119537514301` | 40/41 files, 390/391 tests pass | One interrupted-Redis case fails in the final read-only replay case. The new diagnostic records the locked-reset inventory as one backend, PID `467`, with verdict `backends`; the child connection is separately recorded as PID `460`. The refusal is `Clean reset refused: other database backends present`. No repair or cause is selected. |
| Seed reconstruction | Pass in the prior assembled DB evidence | The approved deployed reference edits are still not established; this does not authorize a reset. |
| Worker, within API job | 57/57 files, 373/373 tests pass | Existing worker correctness passes; deployed producer exclusion and grant-drain proof remain open. |
| API `119537514253` | 323/324 files, 3159/3162 tests pass | All 69 private proof issuance cases pass. The three failures are the retained CampaignFullV3 Support barrier and suspended publish/attach PUT assertions; their later ordering assertions are unreached. |
| Private proof issuance and rollback | 69/69 cases pass | Real manual/manual issuance, restricted reads, invalidation, and PostgreSQL audit rollback execute. Consumption is not present in this candidate. |
| Retained reset tails | Three RED assertions | Support barrier at `CampaignFullV3.e2e.spec.ts:2299`; publish and attach suspended-PUT assertions at `:3288`. No assertion, timeout or skip changes. |

The DB diagnostic is test-only and loopback-disposable. It records the exact backend count and bounded PID list from the same `pg_stat_activity` aggregate that feeds the existing guard, plus child lifecycle and maintenance brackets. The result identifies the refusal stage and an unattributed backend PID, but does not establish whether that backend is a leaked fixture connection, server-side close lag or another cause. The production reset program, refusal policy, waits, retries and test bodies are unchanged.

The API run proves the previously assembled private issuance and rollback work remains green. It does not execute the later six-case private manual proof-consumption slice. The inspected checkpoint `72ae7fe9a1c7b422a30beffa8d4486377482960d` is now assembled as `344865b8` and contains only those test/evidence additions; its first hosted run must preserve the expected strict-input RED before source implementation.

Private raw logs are retained outside Git in `/tmp/carberk-resume-20261021`:

- `31b9-db-119537514301.raw.log`, SHA-256 `03bcac3f7315112a2a768c592aeb1831e39847e4543c5c59f8224eb8bbbe8de2`.
- `31b9-api-119537514253.raw.log`, SHA-256 `6d64af648b5823233d440452807433a5cb8317d765f9bbb7cae3d6eb920d4a5c`.

No environment reset, deletion, deployment, merge, promotion, store submission or infrastructure mutation occurred. Railway scoped-access refusals remain in force and were not retried or bypassed. Exact live inventory, approved reference edits, enforceable producer exclusion, accepted-storage-request drain, object cleanup/reseed/reopen, independent review, native/deployed acceptance, staging restoration and signed release evidence remain open.
