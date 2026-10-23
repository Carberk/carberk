# Terminal hosted receipt for 0169758a

Candidate `0169758a2f1df2259c4ce236532e6a0f99e4d063`, tree `b08bda1a2423e577a3b17766bfb1f6f66fe22ba1`, sole draft integration PR #904. This receipt records [PR Checks 39700863239](https://github.com/Carberk/carberk/actions/runs/39700863239) and [API image runtime 39700863202](https://github.com/Carberk/carberk/actions/runs/39700863202). Both are terminal. No environment reset, deployment, deletion, Railway access retry, merge, promotion or submission occurred.

| Lane | Terminal result |
|---|---|
| Static, frontend/root, lane, API image runtime | pass |
| Docs | skipped by lane |
| Worker | 373/373 pass |
| API | 3168/3171; three retained reset/race failures |
| DB | 390/391; transaction-holder completion phase missing |
| Aggregate `pr` | fail from API and DB |

## Diagnostic proof consumption

`DiagnosticContinuityProofIssuance.e2e.spec.ts` passes all 75 expanded cases. This preserves the original 69 issuance/read/security/invalidation/rollback cases and reaches all six private manual/manual consumption cases previously RED on e56. The disposable CI database applied the candidate migrations.

The six cases verify B's own empty draft and template, no copied A findings/evidence/PDF or new access, exact retry, changed proof/reason/order-version conflict, and refusal of a second successor using the consumed proof. Their first successful POST gates and subsequent assertions are reached. This is bounded runtime GREEN for those cases, not full ADR-0108 acceptance. Current-authority loss at consumption, consumption concurrency/atomic rollback/later erasure, automatic/mixed/corrected identities and public transfer remain required. The temporary public equal-VIN fallback remains.

## Three unchanged API failures

All are in protected `CampaignFullV3.e2e.spec.ts`:

- Support reset-first worker case fails at line 2299 through `supportRaceWait`, line 2120: `Support barrier not observed within existing lock budget; no ordering evidence`.
- Publish and attach generator cases fail at line 3288: `PUT must still be suspended after exact reset, not timed out`, expected false, actual true.

Their later ordering and no-resurrection assertions remain unreached. The protected bodies, budgets and guards are unchanged. These cases require passing acceptance or equivalent product/operator evidence before retirement. Test failure alone does not establish a product leak or a harmless fixture defect.

## Distinct DB failure

`packages/db/scripts/staging-reserved-fixture.e2e.spec.ts`, “does not resurrect an OTP when its producer transaction dies before the Redis enqueue”, fails at line 363 because `terminated-cleanly` is missing from the holder's IPC phases. Earlier assertions establish exit `{code: 0, signal: null}`, `backend-57P01` and `connection-ended`. Later producer-exit and final no-resurrected-OTP assertions remain unreached.

All interrupted-Redis cases pass in this run. This does not establish repair of the earlier loopback `pg_isready` collision or attribution of earlier PID467.

Root tested the actual forked `scripts/testing/campaign-transaction-holder.cjs` with a fake `pg` external boundary and real IPC. Unpressured control delivered completion in 20/20 runs. With deliberate IPC backpressure, the unchanged helper lost its final phase in 20/20 runs at both `exit` and `close`, while exiting 0. A temporary copy awaiting the final `process.send` callback delivered completion in 20/20 under identical pressure. This proves an unsafe forced-exit path under the synthetic conditions. It does not prove the exact pressure mechanism in the hosted runner, and no source repair is included in this receipt. A focused test-first helper repair is assigned separately; the protected caller must remain unchanged and later hosted evidence must reach every original assertion.

The probe files and before/after observations are preserved in `/tmp/carberk-resume-20261021/` and `/tmp/holder-*.cjs`. They use no service or database connection. Waiting for `close` alone did not recover the lost phase in this reproduction.

## Captured logs

| Job | Local raw log | SHA-256 |
|---|---|---|
| API 119569543934 | `/tmp/carberk-resume-20261021/0169758a-api-119569543934.log` | `1fce65fb8a19a409c71e0c0b76a8df8aab27bca02e76e06150b569aabe3bc19e` |
| DB 119569543879 | `/tmp/carberk-resume-20261021/0169758a-db-119569543879.log` | `e8db91bcc897b444dd3c10711859cada7039fbf9743fb3a4b2e0a618ad7ea38c` |

Captured with `gh api --allow-escape-sequences repos/Carberk/carberk/actions/jobs/<job>/logs`; displayed extracts removed terminal control sequences. This documents existing execution evidence and is exempt from artificial RED tests. Full green CI, independent review, native/deployed acceptance, restoration and signed release artifacts remain open.
