# Campaign897 fixture implementation evidence

Owner: isolated implementation writer, `t3/campaign897-acceptance-fixtures`, supplied base `ef85f17f`.
Actual runtime: `gpt-6.1-sol`, medium reasoning effort. No application UI, SMTP, package, lockfile or application migration changes.

## Ordered evidence

- `eac6417f`: control/profile and Railway HTTP/process boundary RED. `node --test scripts/staging-control.test.mjs scripts/staging-railway.test.mjs`; actual assertion failures preserved at `/tmp/campaign897-identities-red.log`.
- `4477b46e`: missing active deployment journal RED. `node --test --test-name-pattern='complete active deployment journal' scripts/staging-railway.test.mjs`; actual missing rejection at `/tmp/campaign897-deployment-red.log`.
- The hosted RED checkpoint adds three campaign storage tests to `packages/db/scripts/staging-reserved-fixture.e2e.spec.ts` and an intentionally unavailable campaign adapter. Narrow #901 test assertions remain unchanged. The campaign storage tests must fail their `seeded.code === 0` expectation against actual migrated disposable PostgreSQL before accepting an implementation GREEN. No hosted run has been requested or observed by this writer.
- Default-closed gate RED: `node --test --test-name-pattern='disabled by default' scripts/staging-railway.test.mjs`, actual SQL boundary reached unexpectedly, `/tmp/campaign897-defaultclosed-red.log`.

## Proof boundary

Local fake-platform, HTTP and child-process boundaries establish coordination/refusal behavior only. They cannot prove SQL, foreign keys, rollback, storage predicates, real OTP/TOTP or asynchronous cleanup. The configured disposable PostgreSQL lane is the hosted `db` job. This writer has no configured disposable service credentials, must not use local Docker or shared staging, and may not create a PR. Assembly must run the ordered hosted RED then implementation checks through its existing configured CI lane. The prior Railway project-token Not Authorized hardblock was not retried.

Full campaign acceptance is blocked. The bounded profile covers only four synthetic identity prerequisites and auth-row tracking. No business, media, service/history, diagnostic center/template/report, measurement cohort or mature telemetry readiness is claimed. No staging lease, deployment, application fixture or infrastructure was created.
