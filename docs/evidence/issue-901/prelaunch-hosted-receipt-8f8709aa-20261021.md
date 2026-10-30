# Hosted receipt for `8f8709aa`, 2026-10-21

This is a read-only evidence receipt for hosted run `39603533735` and exact-head runtime `39603533703`. It records what those runs prove; it does not change the acceptance contract or claim release readiness.

## Candidate and logs

- Hosted candidate: `8f8709aa`; hosted run `39603533735`. `75582fb2` is the later unpublished Support/Q3 assembly; the current root assembly is `6a66bc1a`, which includes the observer.
- Exact-head image runtime: `39603533703`, PASS.
- API raw log: `/tmp/carberk-resume-20261021/8f8709aa-api-119233909732.raw.log`, SHA-256 `d6276d6b0f8f082dfa95d51fa8e7525ba8896885cf897984fae0c89139673f02`.
- DB raw log: `/tmp/carberk-resume-20261021/8f8709aa-db-119233909805.raw.log`, SHA-256 `7a6ded5a220e3b94eff02c01a6a610ac5156a86613a262d0ffd36acb7037068f`.
- Plain logs are the corresponding `.plain.log` files. The DB footer reports `35 passed / 36 files` and `359 passed / 371 tests`, with 12 intended Q3 bootstrap failures. The API receipt reports `316 / 317 files` and `3064 / 3067 tests`.

## Hosted result

| Area | Evidence | Status |
|---|---|---|
| Lane, static, frontend | Hosted run `39603533735` | pass |
| Documentation lane | Hosted run `39603533735` | skipped |
| Exact-head image runtime | Run `39603533703` | pass |
| DB suite | DB raw/plain log; 35/36 files, 359/371 tests; Q3 is the intended red | fail |
| API suite | API raw/plain log; 316/317 files, 3064/3067 tests | fail |
| Worker | 56/56 files, 369/369 tests; CleanRetiredUploads 23/23 (including NP4), ServiceLifecycle 8/8 (including direct purge) | pass |
| API BusinessMembership | 12/12 tests | pass |
| S2A | 6/6 hosted checks | pass |
| Q3 argument guard | Missing/extra argument assertion passes; 12 intended missing-command/bootstrap assertions remain red | partial, red |

The API failures are the three retained full-v3 historical teardown races. Support reset-barrier observation and the publish/attach suspended-`PUT` checks still time out before exact reset completion. The tests remain in place. No timeout was raised and no assertion was weakened.

The Support and Q3 source added after `8f8709aa` have no hosted evidence in this receipt. Their status is **runtime unknown**, even where local assembly or later-head inspection exists. Observer `a3e935e2` is assembled in current root `6a66bc1a`; its affected suite is 182/182 with syntax, docs and diff checks passing. Independent focused review is pending, and the observer still refuses prior-ingress issuer binding and complete worker-log gaps.

## Acceptance interpretation

This receipt establishes exact hosted outcomes only. It does not establish account deletion, object retention, audit retention, lawful erasure, deployed acceptance, or the later-head Support/Q3 behavior. The three retained API races stay red until equivalent product and reviewed operator proofs pass on the same assembled candidate and justify retirement. Do not repair these historical teardown tests by default. The DB Q3 red remains an implementation/runtime gap, not a skipped requirement.
