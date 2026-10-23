# Hosted receipt for `c253ab93`, 2026-10-21

This is a read-only evidence receipt for PR checks run `39611345283` and exact-head runtime `39611345284` on published candidate `c253ab93`. It records what those runs prove. It does not change the acceptance contract, certify later source or claim release readiness. The [`8f8709aa` receipt](prelaunch-hosted-receipt-8f8709aa-20261021.md) remains the historical record for that candidate.

## Candidate and logs

- Hosted candidate: `c253ab93`; local root base `1af31330` adds only ADR-0108 documentation.
- API raw log: `/tmp/carberk-resume-20261021/c253ab93-api-119260821028.raw.log`, SHA-256 `a1378918185cebeb43f92ac968f7ce785058620a7e5e64720fb3cba4f6484a3d`; plain `.raw.plain.log`, SHA-256 `b6417b0305d23127734c9c75caa64f54ed9ebb2c03d2140b9bce40a348c7634f`.
- DB raw log: `/tmp/carberk-resume-20261021/c253ab93-db-119260820756.raw.log`, SHA-256 `27f7a85281191b932ef891d4b3b3d5d63da1b765b84c26d24ed9b3b67086bfcc`; plain `.plain.log`, SHA-256 `8919afa44cf5d89e7ec55b45b804eb5e977541af00154d81a7e4ffdf9ea780dd`.

## Hosted result

| Area | Evidence | Status |
|---|---|---|
| Lane, static, frontend | Run `39611345283` | pass |
| Documentation lane | Run `39611345283` | skipped |
| Exact-head image runtime | Run `39611345284` | pass |
| Worker | 56/56 files, 369/369 tests | pass |
| API suite | 316/317 files, 3064/3067 tests | fail |
| Support close/reopen journey | `closes and reopens owned Support with current assignment, response debt and repeatable exact reset` | pass |
| API BusinessMembership | 12/12 tests | pass |
| DB suite | 36/36 files, 371/371 tests | pass |
| Q3 bootstrap | `bootstrap-synthetic-diagnostic-center.e2e.spec.ts` 13/13; was the missing-command red at `8f8709aa` | pass |
| S2A | `staging-clean-reset.e2e.spec.ts` 6/6 | pass |

The aggregate check fails only because of the API suite. The only three API failures are in `CampaignFullV3.e2e.spec.ts`. They are the same three retained historical reset-tail tests:

- `skips a selected Support worker after an earlier exact reset disposes its durable namespace claim`: `Support barrier not observed within existing lock budget; no ordering evidence` at `:2120`, called from `:2299`.
- The publish and attach generator fence cases: `PUT must still be suspended after exact reset, not timed out` at `:3288`.

The tests remain in place. No timeout was raised and no assertion was weakened. They stay red until equivalent product and reviewed operator proofs pass on the same assembled candidate.

## Not established

- No reset, deletion or deployment occurred. Nothing here proves account deletion, object or audit retention, lawful erasure or deployed acceptance.
- Observer `a3e935e2` focused review found no blocking defect only while it always refuses. The history/active-job checkpoint `b2` is not final quiescence proof.
- ADR-0108 records the founder-approved option 1 for Q2 (D2/D3). The policy is decided. Its implementation (#914) is incomplete and has no hosted evidence here.
