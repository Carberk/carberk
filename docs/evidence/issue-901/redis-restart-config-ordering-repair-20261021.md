# Redis restart configuration ordering repair

This note records the bounded repair for the three restart cases in `packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`. The supplied base is `7283f2f1318a7208a5266e7a1762dba14c07184e`, tree `e5061622216da17eb48a5a9338c84de84da06d4b`. Hosted run `39679193185`, DB job `119497114852`, failed at line 381 before recovery assertions. The raw log is retained read-only at `/tmp/carberk-resume-20261021/7283f2f1-db-119497114852.raw.log`, SHA-256 `7fe8323f482af14df25d9d959545e0c5d58d4462922a855edc8cf8037f30a607`.

The four observed configuration digests were `d253d754580ec2d94d116bc08868be5c9e6e8432be92d7b379585026c8e57aa0`, `440413e61a10142282c05caecec95391326405d3dda37ae96a04482cc1c2fff3`, `534fddd285236b39d0e9ee82ac2ac40758baa7203558a65f1bf288457e81cbe1`, and `83fd12df821a36e1f93941b246b70a85a62d2e1a7159c256a99e50a9a799b049`. An exhaustive offline permutation probe using the disposable test values `requirepass=disposable-redis-secret`, `maxmemory-policy=noeviction`, and `appendonly=no` matched all four hashes exactly. The six possible reply orders produced six digests; the hosted failures are four of those six. This establishes ordering as the observed cause. It does not establish a hosted GREEN result.

The snapshot now maps each returned `CONFIG GET` option to its exact value, then hashes `canonical(config)`. `canonical` sorts object keys, so a Redis reply-order change leaves the digest stable while any option or value change produces a different digest. `requirepass` remains hashed and is never logged. The existing exact `save`, `appendonly`, `dir`, and `dbfilename` assertions and all restart, entry, PostgreSQL, write-count, recovery, replay, and negative-control assertions remain unchanged.

Ranked hypotheses:

1. **CONFIG reply ordering changed across the real process restart.** Confirmed by the exhaustive exact-hash permutation probe and the Redis source's dictionary iteration in `configGetCommand`.
2. **A selected configuration value changed.** Not supported by the four exact permutation matches. The offline probe also confirmed each changed option value changes the repaired digest.
3. **The test connected to a different Redis process or container.** Not supported by the hosted assertions that passed before line 381: container ID stayed equal and `INFO server` `run_id` changed. The probe cannot establish runtime identity.

Commands and results:

- `sha256sum /tmp/carberk-resume-20261021/7283f2f1-db-119497114852.raw.log`: passed with the supplied digest.
- `node /tmp/issue-901-redis-config-probe.cjs`: passed. This offline probe reads the base and patched spec, extracts the existing `canonical` and `snapshotRedis` functions, strips TypeScript types with Node, and evaluates them with a fake Redis transport returning each of the six pair permutations. All four hosted hashes matched the original function; the repaired function produced one digest for all permutations and a different digest for each individually changed option value. No Redis process, local container, or `redis-cli` was used. This is diagnostic evidence, not a committed unit test or container-backed runtime evidence.
- `pnpm --filter @auto-tm/db build` with `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused`: passed; generated the Prisma client.
- `pnpm --filter @auto-tm/db typecheck`: passed.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit`: passed.
- `pnpm --filter @auto-tm/db lint`: passed.
- `pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts --max-warnings 0`: passed.
- `pnpm --filter @auto-tm/db exec vitest list scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`: passed; six cases collected.
- `node scripts/check-runtime-imports.cjs`: passed.
- `node scripts/check-agent-docs.mjs`, `node scripts/check-domain-glossary.mjs`, `node --check packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`, and `git diff --check`: passed.
- Protected reset specs and the original interrupted test bodies were compared byte-for-byte with the supplied base and remain unchanged.

The hosted disposable DB lane remains the required gate. No local runtime result is claimed.

## Preparation and preservation

`git status --short`, `git rev-parse HEAD HEAD^{tree}`, `git branch --show-current`, `git worktree list --porcelain`, and local/remote branch inspection established the clean host-owned worktree at the exact supplied base. The unchanged scaffold branch is `t3/issue-901-redis-restart-config`. `git switch -c agent/issue-901-redis-restart-config-20261021` and `git push -u origin agent/issue-901-redis-restart-config-20261021` reserved the branch before edits. Root alone assembles this checkpoint into sole draft PR #904. No issue PR or nested agent was created.

The fresh checkout had no dependency directories. `COREPACK_ENABLE_NETWORK=0 pnpm install --offline --frozen-lockfile` populated ordinary directories from the local package store without changing tracked configuration. Initial DB typecheck, TypeScript 6 and lint runs failed because contracts output and the generated Prisma client were missing. `pnpm --filter @auto-tm/contracts build` passed. The first DB build required `DATABASE_URL`; the subsequent build used the inert localhost URL listed above and passed without connecting to a database. All affected checks then passed. Three intermediate shell reporting wrappers used zsh's read-only `status` variable and failed after their underlying commands; the final checks used `rc` and returned actual exit codes. None was a host guard refusal. One focused implementation attempt was made.

Docs: https://raw.githubusercontent.com/redis/redis/7.4/src/config.c, downloaded with `curl -fsSL` to `/tmp/issue-901-redis-config-official.c`, confirms that `configGetCommand` collects matched options in a dictionary and emits key/value associations through dictionary iteration. This supports ordering diagnosis; the disposable image is `redis:7-alpine`, and no exact image patch version is inferred. The installed ioredis declaration returns `unknown` for multi-option `CONFIG GET`; the patch narrows the existing RESP2 flat string reply and rejects an incomplete pair. No dependency API or version changed.

The three protected reset specs match the base byte-for-byte and retain their existing SHA-256 receipts from [the restart evidence](prelaunch-reset-redis-restart-test-20261021.md#preserved-oracle-receipts). The entire contiguous block of all six interrupted test bodies also matches the base, SHA-256 `37dc5a77f813b4d3f30870b11830742aa8559c2692a95d8b5880ea20e629463f`. Only the snapshot function and this note changed. No new committed helper test was needed because the existing restart cases exercise the observable preservation seam. DB overview ownership and limitations remain accurate. Legacy CampaignFullV3, production reset source, other suites, budgets and negative controls were not edited.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Distinguish ordering from changed selected values | Exhaustive six-permutation exact-hash probe | Pass, offline |
| Preserve exact configuration equality and password secrecy | Canonical option/value association; all original assertions unchanged; per-option mutation diagnostic | Pass, offline |
| Preserve protected specs and all test bodies | Direct byte comparisons to exact supplied base | Pass |
| Affected static checks, collection and guards | Commands above | Pass |
| Three restart recovery outcomes | Hosted disposable DB CI after root assembly | Pending |

No Railway access, quota query, Docker startup, reset execution, deployment, activation, or live infrastructure action occurred. The prior scoped Railway refusal was not retried. Root must assemble, independently review as required, and obtain hosted disposable DB evidence on the resulting candidate. Preserve this branch and worktree for that handoff.
