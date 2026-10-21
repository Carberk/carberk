# Read-only quiescence observer checkpoint

Writer for #901/#897, sole integration PR #904. Base `e195d2330da2853d4989506d70dde1a0e1b14ddf`; branch `agent/issue-901-quiescence-observer-20261021`; owned host worktree `t3-f3a126a5`. The branch was reserved/pushed at base. An uncommitted exploratory draft preceded reservation and was replaced before the checkpoint. No other checkout was changed.

## RED and bounded GREEN

RED commit `4005a2c1`: `node --test scripts/staging-quiescence.test.mjs` failed with `AssertionError: Missing expected rejection`. The imported empty observer accepted an extra caller `quiesced` claim instead of refusing before effects. The earlier missing-module exploratory failure is not counted. Raw output: `/tmp/issue901-quiescence-red.log`.

The real RailwayPlatform now delegates to an isolated observer, with a separate fixed remote program. Tests execute that program through transparent network/process/Redis/PostgreSQL boundary fakes. No local SQL or real services run. Refusal coverage includes missing/extra/stale/ambiguous authorities, credential scope, concurrent active deployments despite a correct latest deployment, replicas, changed inventory, nonce replay, all queue counts, heartbeat scope, log identity/startup and database visibility/time. Mutation/executor tripwires remain zero.

Source audit: maintenance `/readyz` has no SHA; both existing `/readyz` and `/healthz` are checked locally in the attested deployment and at the authoritative public API origin. HTTP product code is unchanged. Heartbeat uses `OPERATIONS_SCOPE`, including its `development` default, rather than an assumed staging prefix. BullMQ uses the default `bull` prefix; its constructor metadata write is disabled with `skipMetasUpdate`, and the audited package version is pinned. Unsupported `getWorkers()` results refuse. PostgreSQL supplies `now()` in a fresh read-only transaction, with complete activity visibility required, and counts other client backends on that database. Child libpq environment excludes host/service overrides.

## Evidence gaps remain closed

Even when every bounded read passes, the observer throws `QUIESCENCE_EVIDENCE_GAP`: current source has no persisted authoritative prior-ingress grant-issuer binding, and Railway's bounded log read supplies no retention/completeness receipt proving consumer startup never occurred. The public schema confirms the active deployment list, but does not resolve those gaps. No caller field can fill them. No observation, closure or grant-window proof is returned; `evaluateQuiescence`/`evaluateWindow`, CLI/controller/ledger and reset entry are unchanged.

Unit adapter GREEN is not live/hosted quiescence proof. No authenticated Railway call/CLI, credential lookup, live operation, deployment, local service/SQL, CI dispatch/wait, PR or subagent was used. Integration owner must resolve the two authoritative evidence gaps before activation.

## Public documentation receipts

- [Railway CLI public schema](https://github.com/railwayapp/cli/blob/b62467ef1b5303e3e340283ed96425dcf9612993/src/gql/schema.json): `ServiceInstance.activeDeployments` is explicitly “all currently active (deployed and running) deployments”. It also establishes latestDeployment, service/environment IDs, all selected Deployment/instance fields/statuses and deployment log fields/tags/limit. Download SHA256 `3c3d1448f2a746d6e5977ba3aa205889f959c427be5cfe37c72e79b1fa65f2be`. No authenticated schema discovery.
- [BullMQ published 5.76.8 package](https://registry.npmjs.org/bullmq/-/bullmq-5.76.8.tgz) and official [Queue](https://github.com/taskforcesh/bullmq/blob/v5.76.8/src/classes/queue.ts)/[QueueGetters](https://github.com/taskforcesh/bullmq/blob/v5.76.8/src/classes/queue-getters.ts) source: constructor metadata suppression, CLIENT LIST worker matching and unsupported sentinel. Published `queue.js` SHA256 `1b9422aba95b8d4753b1a3b19ef8937fb6547eba1f7c35bf6ae771f379a2a591`.

- PostgreSQL 16 official [activity visibility](https://www.postgresql.org/docs/16/monitoring-stats.html), [role privilege inspection](https://www.postgresql.org/docs/16/functions-info.html), and [transaction clock](https://www.postgresql.org/docs/16/functions-datetime.html): complete statistics privileges, `USAGE` rather than bare `MEMBER`, and `now()` as transaction-start time. Runtime version/behavior remains unexercised; unsupported behavior refuses.

## Actual checks

- Observer boundary suite: 72/72 pass; `/tmp/issue901-quiescence-green.log`.
- Earlier clean-reset/observer/Railway regression suite: 114/114 pass before final implementation; not final-source acceptance.
- Initial `pnpm test:unit` and `pnpm typecheck`: blocked at Prisma config because `DATABASE_URL` was absent.
- `DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm typecheck`: 11 tasks passed. The inert build-only URL permits Prisma generation; no database connection or SQL is performed by that build.
- `DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm test:unit`: 10 tasks passed, with the configured unit lane unchanged; `/tmp/issue901-quiescence-unit-build.log`.
- `pnpm test:root`: 509 passed, 1 existing optional S3 skip, 0 failed; `/tmp/issue901-quiescence-root.log`. Includes the original 52 observer cases.
- `node --test scripts/staging-quiescence.test.mjs scripts/staging-clean-reset.test.mjs scripts/staging-railway.test.mjs`: 162/162 passed; `/tmp/issue901-quiescence-affected.log`.
- After those broad runs, 19 additional target/each-queue refusals and the PostgreSQL `USAGE` privilege predicate were verified by the final 72/72 observer run. PostgreSQL docs distinguish role membership from immediately usable privileges; the guard requires the latter. No existing test, guard, timeout or concurrency setting changed.
- `node --check` on the two new modules and fake boundary, and `git diff --check`: passed. Root scripts have no configured ESLint lane; no app/package source was edited. No hosted checks were dispatched.
