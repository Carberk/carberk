# Hosted receipt for f31f4e82, 2026-10-22

Candidate `f31f4e828ad6ff8d80ed35253e791ca005e57dff`, tree `7681abf68c85893591476880242dcfda70fa69ac`, through sole draft PR #904. These results apply only to that candidate, before the holder IPC repair, maintenance health-probe correction and later test additions.

PR Checks [39703875881](https://github.com/Carberk/carberk/actions/runs/39703875881) completed FAILURE. Lane, static, DB and frontend pass; docs skip; API and aggregate `pr` fail. The recorded image runtime [39703875912](https://github.com/Carberk/carberk/actions/runs/39703875912) passes. No manual rerun or CI polling was used. One recovery snapshot established terminal state, followed by the exact failed job log.

| Gate | Actual result | Limit |
| --- | --- | --- |
| DB `119579283812` | 41/41 files, 391/391 tests pass | Reserved-fixture 14/14 and interrupted Redis 6/6 pass. This predates both fixture repairs and does not establish their hosted closure or eliminate intermittency. |
| Worker within API job | 57/57 files, 373/373 tests pass | Does not establish the later consumed-private-link erasure case or deployed worker exclusion. |
| API `119579283936` | 323/324 files and 3184/3187 tests pass | Only the three retained CampaignFullV3 reset tails fail. |
| Private continuity proofs | All 91 cases pass in 178725 ms | Includes the original 75 and all 16 added consumption-authority cases. The five later contention/audit cases, three lifecycle cases and separate automatic-VIN case are absent. |
| Support reset race | Existing barrier failure at `CampaignFullV3.e2e.spec.ts:2299`, via helper `:2120` | `Support barrier not observed within existing lock budget; no ordering evidence`. Later ordering assertions remain unreached. |
| Publish/attach reset races | Both existing suspended-PUT assertions fail at `CampaignFullV3.e2e.spec.ts:3288` | `PUT must still be suspended after exact reset, not timed out`. Later late-write/no-resurrection assertions remain unreached. |

All 91 private proof cases are runtime GREEN on this exact predecessor. They do not complete automatic, mixed/corrected or public-transfer admission, product erasure acceptance, or the remaining selected release scope. No original reset assertion, skip, budget or retry was changed. The three failures remain required evidence gaps, not permission to remove product security or worker acceptance.

Private raw logs remain outside Git in `/tmp/carberk-resume-20261021`:

- `f31f4e82-api-119579283936.raw.log`, SHA256 `cd8f73eb9031e278b13a864b32710ade3c999a57e54dcde937ee88fceec65e8b`.
- `f31f4e82-db-119579283812.raw.log`, SHA256 `c5e40f5c1b8edbae77a57b882af4c7dcc096fd03116b5a7d0dff19fd3f23b77d`.
- `f31f4e82-run-terminal.json` contains the exact run/head/job identities. Focused extracts used ANSI and literal escape-sequence sanitization.

No reset, deployment, local service, Docker, Railway access retry, merge, promotion or store submission occurred. Live inventory, reproducible intentional reference edits, preserved configuration and enforceable producer/storage quiescence remain reset prerequisites. Disposable prelaunch records do not remove authorization, isolation, deletion, retention or worker requirements. Independent fixed-SHA review, native/deployed acceptance, staging restoration and the signed release artifact remain open.
