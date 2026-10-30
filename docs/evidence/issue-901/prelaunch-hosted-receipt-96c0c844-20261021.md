# Hosted receipt for 96c0c844, 2026-10-21

Candidate `96c0c844cdfed5a0e5f1ce658e6788ea65d14f90`, tree `1884ce1a76650555a4b0cef55d981b27d6c92af7`, through sole draft PR #904. These completed results apply to that candidate; subsequent commits need their own applicable checks.

PR Checks [39686572675](https://github.com/Carberk/carberk/actions/runs/39686572675): lane, static and frontend pass; docs skip; DB, API and aggregate `pr` fail. Image runtime [39686572600](https://github.com/Carberk/carberk/actions/runs/39686572600) passes.

| Gate | Actual result | Limit |
|---|---|---|
| DB `119522309782` | 40/41 files, 390/391 tests pass | One interrupted-Redis case fails during ordinary PostgreSQL reset setup. |
| Reference-seed reconstruction | Complete test passes across two fresh migrated databases and repeated seeds | Includes semantic, identity and migration preservation assertions. Approved live reference edits remain unknown; this does not authorize a reset. |
| Interrupted Redis suite | Five of six cases pass | The remaining restart-recovery case stops at `receiptOf:146 -> prepare:288 -> lostReplyForRestart:399 -> case:551`, with `Clean reset refused: other database backends present` and no SQL diagnostic. Its actual restart/recovery assertions are unreached. |
| Worker, within API job | 57/57 files, 373/373 tests pass | Includes direct Support lifecycle and held-generator publish/attach cleanup tests. No deployed exclusion or grant-drain proof. |
| API `119522309679` | 323/324 files, 3159/3162 tests pass | Only three retained CampaignFullV3 reset tails fail. |
| Private proof issuance | All 66 tests pass | Real two-visit setup, issuance, restricted reads, strict bindings, authority/refusal cases and erased/unknown handle normalization execute. This verifies the first private manual/manual issuance slice, not consumption, broader identity/transfer scope or all lifecycle/race behavior. |
| Existing diagnostic foundations | Reports 15, identity evidence 9, evidence lifecycle 4, report identity binding 1, identity erasure 1 and history 1 pass | Named suite results only; full diagnostic release acceptance remains incomplete. |
| Retained reset tails | Support barrier at `CampaignFullV3.e2e.spec.ts:2299`; publish and attach suspended-PUT assertions at `:3288` | All three remain RED. Subsequent ordering/late-write assertions in those cases are unreached. No assertion, timeout or skip changes. |

The Support case reports `Support barrier not observed within existing lock budget; no ordering evidence` at helper line 2120. Both media cases report `PUT must still be suspended after exact reset, not timed out`. Prior diagnosis remains in the [reset-phase evidence](support-media-reset-phase-diagnostics-20261021.md). This receipt supplies no new root-cause conclusion or timing measurement. Retiring these operator teardown tests still requires equivalent product/operator replacement coverage on the same assembled candidate under the [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md).

The [backend diagnosis](pg-backend-lifetime-diagnosis-20261021.md), child checkpoint `0262fe390de1d2328a68158d6d7d308a374cf1e7`, is assembled as `7ad14e0d`. It changes only that report. The existing failure does not identify which inventory stage refused or attribute the conflicting backend. The next test-only diagnostic checkpoint observes the disposable transport lifecycle without changing production SQL, refusal policy, waits, retries or test bodies. No speculative fixture repair has been selected.

An independent test writer is adding real PostgreSQL audit-failure rollback and assignment-revoke/restore invalidation cases. Its checkpoint is not yet inspected or assembled, so those new assertions remain unexecuted. Consumption, exact retry, successor contention, automatic/mixed/corrected identity, public transfer and surviving successor behavior remain required.

Private raw logs are retained outside Git in `/tmp/carberk-resume-20261021`:

- `96c0-db-119522309782.raw.log`, SHA-256 `ef07e9dbe9eed654230ecd58f0bad251cf9feb29437b19aa29eaf618f9298723`.
- `96c0-api-119522309679.raw.log`, SHA-256 `9c7b637206b97343912a776ffcccd81829b0e12a6355ce95b469c3cf0303d27e`.

No environment reset, deletion, deployment, merge, promotion, store submission or infrastructure mutation occurred. The three refused Railway scoped-access requests are not retried or bypassed. Exact live inventory, approved reference edits, enforceable producer exclusion, accepted-storage-request drain, object cleanup/reseed/reopen, independent review, native/deployed acceptance, staging restoration and signed release evidence remain open.
