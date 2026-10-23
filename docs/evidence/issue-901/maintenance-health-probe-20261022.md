# Maintenance health probe fixture checkpoint

First bounded fixture correction for the attributed health probe in #901, within founder-selected #897. Sole PR remains #904, owned by root. This writer reserved and pushed `agent/issue-901-maintenance-health-probe` from `6bf6821a333a6f23331d5de1fa1ebeedc12ad300`, the supplied parent assembly over published diagnostic baseline `f31f4e828ad6ff8d80ed35253e791ca005e57dff`. Host scaffold `t3/27021c4f` remains at the supplied base. No PR or integration-branch mutation. OTP helper IPC repair is separate.

## Prior runtime evidence, not a new red/green claim

Read the supplied `/tmp/carberk-resume-20261021/health-probe-minimal-closure-next-20261022.md` and saved hosted logs. [Run 39697405425, DB 119558140041](https://github.com/Carberk/carberk/actions/runs/39697405425/job/119558140041) is genuine prior fixture failure. In the marker-loss restart case, SQL child 218, PID 473, reported the same-observation inventory count 1, selected PID 480, attribution `480:pg-isready:loopback:known`, and `phase=redis stage=initial-inventory backends=1`. Child 218 closed and exited; maintenance observations around the run saw zero. The visible failure was `expected undefined to be 'lua-reply'` at `expect(proxy.dropped()).toBe(interruption)`, before the intended restart assertions. This attributes that interfering observation to the recurring probe. Earlier PID 467 remains unattributed.

[Baseline f31 DB run 39703875881, job 119579283812](https://github.com/Carberk/carberk/actions/runs/39703875881/job/119579283812) already passed 41 files / 391 tests, including the original six interrupted cases, before this repair. It is evidence of intermittency, not repair closure. No new hosted tests ran here; no new test-first RED or runtime GREEN is claimed. The added maintenance control is a guard-semantics acceptance control, not a deterministic reproduction of the short-lived probe race. Its prior RED is unknown. Setup was not weakened to manufacture a failure.

## Source boundary and official API verification

Actual edit boundary is `packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`, original `beforeEach` line 292. It directly starts `PostgreSqlContainer("postgres:16-alpine")`; no disposable-postgres helper exists at the formerly proposed path. Baseline and supplied parent have identical fixture file SHA-256 `f54d0577f632133e1e783d1a9a466587d8561bfd20f6862c2a601ec04c44aefa`.

Lockfile resolves `@testcontainers/postgresql` and `testcontainers` to 12.2.0. `npm view @testcontainers/postgresql time --json` reports 12.2.0 published `2026-09-28T15:47:58.386Z`. Cutoff was not assumed; official version-tagged docs were read before editing.

- Docs: [official v12.2.0 wait strategies](https://github.com/testcontainers/testcontainers-node/blob/v12.2.0/docs/features/wait-strategies.md#health-check), confirms `withHealthCheck`, CMD-SHELL tuple, millisecond intervals/timeouts and retries.
- Docs: [official v12.2.0 PostgreSQL docs](https://github.com/testcontainers/testcontainers-node/blob/v12.2.0/docs/modules/postgresql.md), confirms PostgreSQL module usage and maintenance database distinction.
- Docs: [PostgreSQL 16 pg_isready](https://www.postgresql.org/docs/16/app-pg-isready.html), confirms `--dbname` selects the connection database.
- Installed `@testcontainers/postgresql/build/postgresql-container.js` constructor sets `Wait.forAll([Wait.forHealthCheck(), Wait.forListeningPorts()])` and startup timeout 120000. `start()` installs its default only when `!this.healthCheck`; default credentials/database are `test`, and its command is `PGPASSWORD=test pg_isready --host localhost --username test --dbname test` with interval 250, timeout 1000, retries 1000.
- Installed `testcontainers/build/generic-container/generic-container.d.ts` exposes `withHealthCheck(healthCheck: HealthCheck): this`; `build/types.d.ts` accepts `["CMD-SHELL", string]` plus numeric interval/timeout/retries. Its implementation sets Docker Healthcheck without replacing the existing wait strategy. Both compiler versions accept the change.

The explicit fixture check copies those defaults and changes only the command's database to `postgres`. Health plus port startup, synthetic credentials, ordinary target URI, migration deployment, settling and all budgets stay intact. The reset still uses unchanged `current_database()` backend inventory and guards. No backend ignore, disabled healthcheck or dependency upgrade.

## Behavioral controls and protected code

The unchanged `packages/db/scripts/staging-clean-reset.e2e.spec.ts` test `another backend on the database refuses observation and deletion` holds a real ordinary target `pg.Client`. The actual serialized program must refuse inventory and deletion with `Clean reset refused: other database backends present`; whole-database snapshots include every user-schema table, operator receipts and definitions before/after. This exact negative control is reused, not copied or modified.

The appended interrupted-fixture case `a held maintenance backend permits target inventory and row deletion` holds an equivalent ordinary `pg.Client` on `/postgres`. It checks the same live PID is a maintenance client backend before inventory, between inventory/deletion and after deletion. The actual unchanged serialized program crosses the existing real PostgreSQL child-process transport, returns completed rows, removes the seeded target user, stores the resulting receipt, and leaves Redis bytes/config/write count unchanged. No repository/container internals are mocked and no source-text test was added. Target migrations still establish target database readiness. The new case was collected only.

All original six `it()` expression texts are byte-for-byte equal to the supplied base. SHA-256 over their AST expression texts joined with one newline remains `cca5d3be05dd16c0529fda8910077700218a1fc87595f22490c689c1caa9733f`. There are now seven declarations. Production `scripts/staging-clean-reset-remote.mjs` SHA-256 remains `d280bdda8ae1a93cf82782f2a298306fb35515f565d2a06cc1715bf2e9378869`.

A 147-file protected manifest was captured and compared offline: all tracked paths matching `CampaignFullV3|staging-clean-reset|redis-interruption-transport|query-disposable-postgres|\.github/|packages/contracts/|schema.prisma|/migrations/`, excluding only the edited fixture. Every byte hash stayed equal. SHA-256 of JSON path/hash pairs in git path order is `c89265ee1a2e55b2fa8417620e9fe9eca9987821671b04dd531c6cb871fcdd77`. Only the fixture and this note change. The original fixture helper bodies, other reset suites, CampaignFullV3 bodies, production guards, retry/timeout/budget, schema, contracts, CI and authorization remain untouched.

## Offline checks

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | Passed, lockfile unchanged |
| `pnpm --filter @auto-tm/contracts build` | Passed |
| `pnpm --filter @auto-tm/db generate` | Initially stopped at config loading because DATABASE_URL was unset |
| `DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test pnpm --filter @auto-tm/db generate` | Passed, synthetic config input only, no service connection |
| `pnpm --filter @auto-tm/db exec vitest list scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts scripts/staging-clean-reset.e2e.spec.ts --json` | Collected 13 cases, including seven interrupted cases and reused target negative control; did not execute them |
| `pnpm --filter @auto-tm/db typecheck` | Passed, TypeScript 7 |
| `pnpm --filter @auto-tm/db exec tsc6 --noEmit` | Passed, TypeScript 6 |
| `pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts --max-warnings 0` | Passed |
| `pnpm --filter @auto-tm/db lint` | Passed |
| `pnpm --filter @auto-tm/db exec vitest run scripts/redis-interruption-transport.spec.ts` | 7 passed |
| `node --test scripts/testing/query-disposable-postgres.test.cjs scripts/staging-clean-reset-remote.test.mjs scripts/staging-clean-reset.test.mjs` | 36 passed |
| AST six-call comparison, protected-file hash comparison, `git diff --check` | Passed |

## Missing hosted acceptance, owned by root

Root must assemble this checkpoint into the sole integration candidate, review the exact diff and run the full hosted DB gate on that SHA. Require both the reused target-backend refusal/no-mutation control and new held-maintenance inventory/deletion control. Require all six original interrupted assertions to execute: uninterrupted initial completion, pending without marker with zero writes, lost Lua reply recovery and read-only replay, persisted-marker restart recovery, lost-marker restart refusal with empty queues, and completed-PG replay after marker loss plus contradictory-state refusal. Preserve original marker/restart/recovery/replay assertions and existing instrumentation; retain evidence of actual phase reach, not only a green summary. The other reset suites and full DB gate must also pass.

No hosted result on this correction exists. No local services, Docker, Railway, auth retry, deployment, reset, merge, promotion or submission occurred. The three earlier Railway refusals remain a hard boundary. Root owns remaining full-candidate verification and acceptance.
