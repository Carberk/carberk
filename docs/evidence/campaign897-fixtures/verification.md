# Campaign897 fixture implementation evidence

Owner: isolated implementation writer, `t3/campaign897-acceptance-fixtures`, supplied base `ef85f17f`.
Actual runtime: `gpt-6.1-sol`, medium reasoning effort. No application UI, SMTP, package, lockfile or application migration changes.

## Ordered evidence

- `eac6417f`: control/profile and Railway HTTP/process boundary RED. `node --test scripts/staging-control.test.mjs scripts/staging-railway.test.mjs`; actual assertion failures preserved at `/tmp/campaign897-identities-red.log`.
- `4477b46e`: missing active deployment journal RED. `node --test --test-name-pattern='complete active deployment journal' scripts/staging-railway.test.mjs`; actual missing rejection at `/tmp/campaign897-deployment-red.log`.
- The initial hosted RED checkpoint adds three campaign storage tests to `packages/db/scripts/staging-reserved-fixture.e2e.spec.ts` and an intentionally unavailable campaign adapter. Narrow #901 test assertions remain unchanged. The campaign storage tests must fail their `seeded.code === 0` expectation against actual migrated disposable PostgreSQL before accepting an implementation GREEN. Assembly subsequently ran the complete four-test RED checkpoint; its verified result is recorded below.
- Default-closed gate RED: `node --test --test-name-pattern='disabled by default' scripts/staging-railway.test.mjs`, actual SQL boundary reached unexpectedly, `/tmp/campaign897-defaultclosed-red.log`.

## Proof boundary

Local fake-platform, HTTP and child-process boundaries establish coordination/refusal behavior only. They cannot prove SQL, foreign keys, rollback, storage predicates, real OTP/TOTP or asynchronous cleanup. The configured disposable PostgreSQL lane is the hosted `db` job. This writer has no configured disposable service credentials, must not use local Docker or shared staging, and may not create a PR. Assembly ran the ordered hosted RED and must run implementation GREEN through its existing configured CI lane. The prior Railway project-token Not Authorized hardblock was not retried.

Full campaign acceptance is blocked. The bounded profile covers only four synthetic identity prerequisites and auth-row tracking. No business, media, service/history, diagnostic center/template/report, measurement cohort or mature telemetry readiness is claimed. No staging lease, deployment, application fixture or infrastructure was created.

## Confirmed hosted RED and implementation proof

`300152807e8db9df0f028834fb47f40d5e030fc7` extends the ordered hosted RED checkpoint with the fourth storage test, racing an owned OTP into the gap between preflight and cleanup transaction. Assembly confirmed genuine hosted RED on `83d8acf38d1837be0c4f860193903af365569d55`: [PR Checks run 39104191526, DB job 117606486050](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/39104191526/job/117606486050). The writer inspected the downloaded full log at `/tmp/carberk-campaign-delivery-20261014/fixtures-red-db-39104191526.log`. Exactly four campaign fixture success assertions failed, expected `0`, received `1`, at lines 136, 170, 191 and 206. Thirty files and 280 tests passed; one file and four tests failed. There was no setup/import failure, and the three original narrow fixture tests passed. This established the required storage behavior RED before releasing the implementation checkpoint. Hosted SQL GREEN is pending assembly execution on the implementation SHA.

Available local checks, run against the bounded implementation:

| Command | Result | Local artifact |
|---|---|---|
| `pnpm test:staging-control` | 38 passed | `/tmp/campaign897-controls-final.log` |
| `pnpm test:root` | 295 passed, 1 service test skipped | `/tmp/campaign897-root.log` |
| `pnpm test:unit` | 10 successful Turbo tasks | `/tmp/campaign897-unit.log` |
| `pnpm typecheck` | 11 successful Turbo tasks | `/tmp/campaign897-typecheck.log` |
| `pnpm --filter @auto-tm/db typecheck` | passed | `/tmp/campaign897-db-typecheck.log` |
| `pnpm --filter @auto-tm/db lint` | passed | `/tmp/campaign897-db-lint.log` |
| `pnpm --filter @auto-tm/contracts build` | passed | `/tmp/campaign897-contracts-build.log` |
| `pnpm --filter @auto-tm/db build` | passed after building contracts | `/tmp/campaign897-db-build.log` |
| `node --check scripts/staging-campaign.mjs` and `git diff --check` | passed | terminal receipt |

Build/typecheck/unit generation used a generation-only `DATABASE_URL` pointing to unreachable loopback port 1. No database was contacted or created. An initial direct DB build lacked compiled contracts; following the documented prerequisite build resolved it. No package or lockfile change was needed. These checks exclude hosted SQL and do not establish authentication or complete cleanup.

Docs: https://www.postgresql.org/docs/16/trigger-definition.html confirms AFTER-trigger return values are ignored and trigger errors roll back their triggering statement in the same transaction. https://www.postgresql.org/docs/16/explicit-locking.html confirms write-table conflicts, transaction lock lifetime and the advisory-lock contract. Read on 18 October 2026. No dependency or provider API was upgraded. Real PostgreSQL behavior still requires the hosted tests.

Implemented cleanup disposition, still awaiting hosted GREEN, is bounded to pre-OTP auth rows, redacted synthetic audits and a retained `cf_` tombstone/hash journal/triggers. Any owned OTP, unknown downstream domain graph or foreign reference refuses cleanup. Queued delivery/sink, business/media/history/diagnostics/full roster and analytics states remain unsupported. Complete sign-in-to-content/media-to-reset acceptance is blocked, not passed. Independent Standards/Spec review and every deployed/restoration gate remain with assembly.


The implementation checkpoint adds only the fixed campaign adapter, the default-closed remote preparation gate and documentation to the ordered RED chain. Bootstrap is enabled only by the exact API-process variable `STAGING_CAMPAIGN_PROFILE_ENABLED`; no value was set by this writer. The four aliases and terminal disposal are the complete bounded capability. Production OTP/TOTP endpoints remain the only authentication path, and any tracked OTP causes reset refusal because queue/sink cleanup is not implemented. Full authenticated campaign acceptance remains closed.
