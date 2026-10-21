# Redis inventory source checkpoint, 2026-10-21

#901 source writer under #897, sole integration draft PR #904. Base `95006d7265b9e43f99d44dfafd900cb643bd21c4` (tree `3ba982c9…`); reservation `agent/issue-901-clean-reset-redis-inventory-source-20261021` was pushed before edits. This implements the read-only branch proposed in the [Redis RED checkpoint](prelaunch-reset-redis-red-20261021.md) under the [acceptance contract](prelaunch-clean-acceptance-contract-20261021.md). Only `scripts/staging-clean-reset-remote.mjs` and this note change. The Redis spec is byte-identical. No other source, test, schema, configuration, dependency, CLI, controller or ledger phase changed.

## What the fixed program now does

- **Shapes.** `redis-inventoried` and `redis` are added to the existing exact-key table. Both require `identity.origins` to be exactly `{database,redis}`. `redis` also requires `expectedInventory` to be exactly `{digest:<64 hex>}`. `inventoried` and `rows` keep `{database}` origins and their existing validation, PostgreSQL path and receipts.
- **Target.** The shared environment, candidate and `DATABASE_URL` checks still run without connecting. The Redis branch then compares project, environment, API, worker and Redis origin with the operator CLI's pinned staging identity (mirrored from `scripts/staging.mjs`). It canonicalizes `REDIS_URL` without credentials, accepting only `redis:` with database 0, and requires an exact match with the claimed origin. Every mismatch refuses `target` before a client is constructed. The branch returns before `child_process` or PostgreSQL is reached.
- **Deletion.** Every well-formed `redis` request, including retries and different operation, reservation or candidate values, refuses `Redis completion receipt authority unavailable` before a Redis client exists. The program has no delete path, replay, tombstone preservation or receipt store.
- **Observation.** A raw ioredis client (lazy connection, no retry or offline queue, 10 s connect and 30 s command timeouts) runs one `EVAL` script with the `#!lua flags=no-writes` declaration. Redis rejects any write from that script. Because the script is atomic, the snapshot is coherent and no two-pass comparison is needed. BullMQ `Queue` is never constructed because its constructor writes `meta`. The script refuses if `DBSIZE` is above 50,000 keys, if returned key, DUMP and member bytes exceed 64 MiB, or if index members exceed 100,000. It reads `TYPE`, cardinality, `PEXPIRETIME` and `DUMP` only for keys in the application namespaces `bull:`, `identity:`, `email:`, `measurement:` and `operations:`. Foreign key names and values stay inside Redis.
- **Receipt.** The receipt shape matches the proposal. `queues` lists the 12 S1 `QUEUES`, imported from `scripts/staging-clean-reset.mjs` rather than copied, with `repeatRecords` counted from the `repeat` zset (legacy repeats and schedulers). Each entry is `{keyDigest,type,count,contentDigest,expiresAt}`. `digest` is the SHA-256 of the entry array sorted by `keyDigest`. Errors use only the fixed refusal names; client and script diagnostics are suppressed.

## Ownership rules and sources

Recognition is exact and type-checked. Any other key in an application namespace refuses `unknown Redis application state`.

| State | Source | Rule |
|---|---|---|
| Queue fixed keys | BullMQ 5.76.8 `QueueKeys`, `obliterate-2.lua` | Known queue only. The table below gives the required type for each fixed key. `delay` (obliterate only, no 5.76.8 producer) is not admitted. |
| Job hash and job sub-keys | `removeJobKeys.lua`, lock in `obliterate`/`moveToFinished` | Job id must be a member of wait, active, paused, delayed, prioritized, completed, failed or waiting-children. The hash and each sub-key must have its required type. |
| Repeat/scheduler records | `addRepeatableJob-2.lua`, `addJobScheduler-11.lua` | `repeat:<id>` hash, where `<id>` is a member of the queue's `repeat` zset. |
| `de:campaign-*` on `email-code` | `BullMqEmailCodeSenderAdapter`, `staging-campaign.mjs` | Refuses `Redis control disposition unavailable`. Other `de:`/`dn:` keys are unknown (no producer). |
| `identity:reserved-phone-attempt:<64 hex>` string | `RedisReservedPhoneAttemptLedger` | Entry |
| `email:daily-sends:YYYY-MM-DD` set | `RedisDailySendCap` | Entry |
| `measurement:cap:v1:<int>:<token ≤128>` string | `RedisMeasurementRateLimiter` | Entry. The adapter accepts any subject string. Production subjects are 64-hex pseudonyms, but the admitted token is bounded `[A-Za-z0-9_-]`, which also matches the synthetic fixture. |
| `operations:<scope>:worker` (any type) | `worker-heartbeat.module.ts` | Refuses `Redis producer or active job present` |
| `operations:<scope>:{snapshot,technical,incident,alert-receipt,smtp-alert-receipt}` string | watchdog, `RedisOperationsSnapshot` | Monitoring state. It is excluded from entries and never deleted. |

Fixed key types:

| Fixed key | Required type |
|---|---|
| `meta` | hash |
| `id` | string |
| `events` | stream |
| `marker` | zset |
| `wait` | list |
| `active` | list |
| `paused` | list |
| `delayed` | zset |
| `prioritized` | zset |
| `completed` | zset |
| `failed` | zset |
| `waiting-children` | zset |
| `repeat` | zset |
| `stalled` | set |
| `stalled-check` | string |
| `limiter` | string |
| `pc` | string |
| `metrics:{completed,failed}` | hash |
| `metrics:*:data` | list |

Job sub-key types:

| Job sub-key | Required type |
|---|---|
| `logs` | list |
| `lock` | string |
| `dependencies` | set |
| `processed` | hash |
| `failed` | hash |
| `unsuccessful` | zset |

When more than one refusal applies, the order is unknown state, then control, then producer. A non-empty `active` list is a producer refusal. A non-UTF-8 key in an application namespace is unknown.

## Checks run (offline only)

| Check | Result |
|---|---|
| `pnpm install --offline --frozen-lockfile` | Store only; tracked files unchanged |
| `node --check`; serialized `cleanResetProgram` parsed with `new Function` | Pass |
| `node --test scripts/staging-clean-reset.test.mjs` | 20/20 pass |
| `vitest list` of the Redis spec | Five tests collected; nothing executed |
| `git diff 95006d72 -- packages/db/scripts/staging-clean-reset-redis.e2e.spec.ts` | Empty |
| `/tmp/issue-901-redis-inv-harness/run.mjs` (fake ioredis reply, not Redis) | Results below |

The harness confirmed these behaviors:

- The valid inventory returns code 0 with the exact receipt keys. Email counts are `1/3/1/1/0/0/0/0` with 2 repeat records.
- No foreign key or credential text appears in the output.
- These cases refuse as unknown state: an unknown queue, unknown queue metadata, a wrongly typed job, an unindexed job hash, an unknown `identity:` key and a non-campaign `de:` key.
- A campaign tombstone refuses as control state.
- A heartbeat and an active job with its lock each refuse as producer state.
- A monitoring key is excluded from entries.
- Bounds, a client error, deletion, deletion retry and every claim or environment mismatch refuse. Claim and environment mismatches refuse with zero clients.
- The DB `inventoried` path still reaches `child_process`.

ESLint has no flat config covering root `scripts/`, the same as on the base.

## Limits

- **No runtime GREEN is claimed.** No Docker or Redis was run, by instruction. The disposable-Redis e2e must run in the parent's hosted batch.
- These Redis behaviors are unverified until that run: shebang `no-writes` scripts calling `KEYS`, `DUMP` and `PEXPIRETIME` (Redis ≥ 7) and `TYPE` returning a status table.
- If the real BullMQ setup leaves a key type outside the tables above, that key will refuse as unknown. That outcome is a deliberate fail-closed result, not a fixture failure to be widened.
- The script uses `KEYS` and blocks Redis for the length of one bounded scan. That is acceptable only for a staging reset window, and managed Redis that disables `KEYS` or `EVAL` refuses generically.
- The deployed container's `require('ioredis')` resolution is unverified. The CLI, controller and ledger have no `redis-inventoried` activation.
- The observation is not quiescence or producer closure. It does not inspect `CLIENT LIST`. A worker that holds no job and writes no heartbeat is invisible to it.
- Durable Redis receipt and recovery, compare-and-delete, replay, zero-after-reset proof, verified control-tombstone retention and full ownership beyond the producers listed above remain unresolved root decisions.
- No live Railway, Redis, PostgreSQL or S3 access, credential reads, CI dispatch or polling, issue or PR mutation, or nested agents were used.
- Keep this worktree and branch for root assembly.
