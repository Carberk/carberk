# Stale inventory backend diagnostic, 2026-10-23

Bounded implementation writer for #897/#901 through sole draft [PR #904](https://github.com/Carberk/carberk/pull/904). Reserved and pushed `agent/issue-901-db-stale-inventory-backend-20261023` before edits from `2c2298deb84481c9f3abb3e74f8097162a972023`, tree `8228a6171438e9b1055a4c3f8b353194a71c7cca`. Owned worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-f6ec67cd`; scaffold `t3/f6ec67cd` remains at the supplied base. Status is diagnostic checkpoint, hosted RED unresolved. Parent owns assembly, execution record, independent review and acceptance.

## Attribution

Saved [run 39899448847, job 120237438953](https://github.com/Carberk/carberk/actions/runs/39899448847/job/120237438953) identifies exact supplied head and reports 40 files / 391 tests PASS, one file / one test FAIL. Raw `/tmp/carberk-resume-20261021/2c2298-db-job.log` is preserved, independently SHA-256 checked as `020b8fa4127a0d1fe2fcbd592a02b5bebe9541aa6e865456157fedbf5c1eddec`; metadata remains beside it. At original line 283 the stale-observation `row` subcase expected exit 1, `Clean reset refused: Inventory changed since observation`, no receipt. It received exit 1, `Clean reset refused: other database backends present`, no receipt. This suite emitted no same-observation backend attribution. Backend PID, application, origin and owner are UNKNOWN. No local reproduction or hosted rerun was authorized or attempted.

Source establishes the following, separately from runtime ownership:

- The relevant suite owns a separate `PostgreSqlContainer("postgres:16-alpine")`. Its installed, lockfile-pinned `@testcontainers/postgresql` 12.2.0 default healthcheck runs `pg_isready` against its target database `test` through localhost, interval 250 ms, timeout 1000 ms, retries 1000. CI's DB job runs `pnpm test:db`; it provides no shared PostgreSQL service. Other suites create their own containers. Both checked workflow definitions agree.
- Fixture `query()` awaits `Client.end()` in `finally`. Installed `pg` resolves that promise on its connection `end`, forwarded from stream `close`. The synchronous SQL subprocess also awaits `Client.end()`. This establishes local close completion, not server activity-removal time. No successful-path unawaited close or fixture connection leak was proven.
- `settle()` reads target activity through a max-one pool on `/postgres` and returns after zero target client backends. `run()` awaits it before synchronous `execute()`. This is an observation before the guard, not exclusion of later connections.
- The exact stale digest must be compared before the production program can enter its locked reset transaction. Given the earlier successful fresh observation and changed disposable digest, this refusal occurs in the initial inventory guard, ahead of the stale-digest check. The existing log supplies no PID for that observation.
- The earlier [maintenance probe receipt](maintenance-health-probe-20261022.md) attributes PID 480 in interrupted-Redis run 39697405425, job 119558140041, to `pg-isready`. That fixture's healthcheck now targets `/postgres`. The failing S2A fixture still uses the default. Prior PID 467 was unattributed. Neither observation identifies this run's backend. Healthcheck causation here remains a hypothesis.
- `git diff 1d8128d5 2c2298de -- packages/db scripts/staging-clean-reset-remote.mjs scripts/testing/query-disposable-postgres.cjs .github` is empty. The newer failure does not establish a DB/reset/schema regression between those candidates.

## Diagnostic change and preserved behavior

Only the affected fixture, existing transport test and this receipt change. The fixture enables the existing loopback-only, opt-in diagnostic transport. It forwards only validated bounded PID/application/origin/state-category lines and child close times. It records the latest fixture query's PID and local connect/close times, successful zero-settle time and child start/exit times. Snapshot query lifetimes are kept as one latest-close record, avoiding a log per table. Query clients receive the already recognized fixed `staging-test-fixture` application name. No SQL, query values, usernames, connection strings, raw stderr or arbitrary database strings are printed.

The existing transport collects at most 16 sorted PIDs and fixed categories in the same activity aggregate that supplies the original guard count, consumes a private result and leaves public output intact. This is a test-only SQL perturbation and may affect timing. It introduces no extra target connection, wait or retry. Its `state` category distinguishes recognized from unavailable states; it does not print the exact state, query text or backend start timestamp. A later maintenance sample cannot retrospectively identify a short-lived backend.

The production program and helper implementation are unchanged. Identity/inventory bindings, exact stale oracle, intentional extra-backend denial, atomic snapshots/no-partial-writes checks, receipt rules, schema, CI, healthcheck configuration and all existing budgets remain unchanged. All six complete `it()` call texts in the affected fixture match the supplied base, SHA-256 over LF-joined calls `779d498463d06a0d9c7a5b791dface648f0027897ca2b1b3f5be9860d47474a1`. All other reset specs and protected full-v3 files are untouched. No test was widened, skipped or deleted. Overview ownership and limitations do not change.

## Verification and limits

Diagnostic test-first checkpoint `4fa0d401` was pushed before fixture implementation. `node --test scripts/testing/query-disposable-postgres.test.cjs` produced 12 PASS / 1 FAIL for missing attribution forwarding in this fixture, saved at `/tmp/issue-901-stale-diagnostic-red.log`. This is diagnostic-contract RED, not a reproduction of the unexpected backend. The extended existing test executes the extracted forwarding statement against valid and private malformed stderr; it does not execute the complete PostgreSQL fixture.

| Command or criterion | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | PASS; lockfile unchanged |
| `pnpm --filter @auto-tm/contracts build` | PASS |
| `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test pnpm --filter @auto-tm/db generate` | PASS; placeholder configuration only |
| `node --test scripts/testing/query-disposable-postgres.test.cjs scripts/staging-clean-reset-remote.test.mjs scripts/staging-clean-reset.test.mjs` | PASS, 37/37 |
| `node --check scripts/testing/query-disposable-postgres.cjs` and its test file | PASS |
| `pnpm --filter @auto-tm/db lint` | PASS |
| `pnpm --filter @auto-tm/db typecheck` | PASS |
| `pnpm --filter @auto-tm/db test:unit` | PASS, 5 offline lifetime tests plus 119 Vitest tests |
| `pnpm --filter @auto-tm/db exec vitest list scripts/staging-clean-reset.e2e.spec.ts --json` | Six cases collected only |
| `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test pnpm test:unit` | PASS, 10/10 tasks, 7 cached |
| Same placeholder with `pnpm typecheck` | PASS, 11/11 tasks, 7 cached |
| `pnpm test:agent-docs` | PASS, documentation check and 8/8 tests |
| Original test AST comparison and `git diff --check` | PASS |
| Actual backend attribution, PostgreSQL SQL acceptance and original stale-observation scenario | UNKNOWN / blocked on next hosted observation |

Check logs remain under `/tmp/issue-901-stale-*`; preservation result is `/tmp/issue-901-stale-preservation.json`. Docs: not applicable to internal diagnostic wiring; existing installed pg close lifecycle and testcontainers configuration were inspected as source evidence. No dependency/API upgrade or healthcheck API change.

Parent's next observation is the normal full hosted DB gate on the assembled SHA, preserving scheduling context and all existing tests. Retain the stderr block for the stale test's rows request and its child ordinal. A nonzero activity record should distinguish `pg-isready:loopback`, `known-fixture`, prior `sql-child` or `other`; correlate its PID with the local close/exit records. A passing run is not cause attribution. An `other` or missing record leaves ownership unresolved and requires a further bounded evidence decision, not a healthcheck fix by assumption. Keep the exact stale/no-receipt oracle and target-backend negative control. A supported lifecycle repair would still need affected and full hosted verification.

No Docker, live local services/e2e, CI polling/rerun/dispatch, quota or credential search, Railway call, staging/production operation or device action occurred. Three Railway refusals remain terminal. Separate #914 checkpoints `45a8b549`/`a27e7db0` were not assembled; persisted facts/SQL/locks/erasure remain missing and public automatic production admission stays closed. No signed-AAB, staging companion, emulator or founder-readiness claim is made. No Standards/Spec approval or task completion is asserted. Bounded writer terminal after pushed handoff; no children, no pending questions or owned running processes. Root cause UNKNOWN; parent owns the next hosted evidence.
