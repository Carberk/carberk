# Redis restart acceptance test checkpoint, 2026-10-21

Bounded test-only #901 slice for #897 in integration PR #904. Starting commit is `2b00c38ec28d6180d4fd32ccc248e8735dd44d53`, tree `dafde1c05aedf31522fcc9363d490423794b4879`. Host-owned worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-8b0fe5cf`. Scaffold branch `t3/issue-901-redis-restart-tests` remains at the base. Reservation branch `agent/issue-901-restart-continuity` was created and pushed before edits. Root remains the sole assembler. This checkpoint opens no PR and changes no production source.

The parent's final base evidence is DB job `119433585275`, PR Checks `39660947360`, completed SUCCESS on that exact base. The supplied raw log `/tmp/carberk-resume-20261021/2b00c38e-db-119433585275.raw.log` was read and independently hashed as `77e19c3a8718f44b1040a326f41bac1ab18187620418822dfd1732a812aa3f63`. It records 40/40 files and 387/387 tests passing, including all three interrupted cases and the negative controls within the third case. Existing lost-reply recovery is GREEN. That evidence does not cover the new restart cases.

## Added acceptance cases

The existing interrupted spec gains three cases and two test-only helpers. All original case bodies remain byte-identical. The serialized production program and established dropped-Lua-reply TCP transport execute unchanged against disposable PostgreSQL and Redis.

- Actual pending PostgreSQL plus the actual completed Lua marker: disable timed RDB saves, execute the established lost-reply path, synchronously SAVE its actual Redis state, verify a nonempty `/data/dump.rdb`, and restart the same container. Independent pre/post snapshots must match all Redis entries and selected configuration. Recovery must complete PostgreSQL once, leave Redis bytes and write count unchanged, and replay twice without changing PostgreSQL receipt bytes, xmin or ctid.
- Actual pending PostgreSQL with marker loss: execute that same lost-reply path with timed saves disabled and AOF off, verify no RDB file exists, then restart the real container. Redis must be empty, including loss of foreign values appropriate to this storage mode. Two recovery attempts must refuse with PostgreSQL, Redis and the monitored write count unchanged despite empty queues.
- Actual completed PostgreSQL with marker loss: complete through the real program, then restart without an RDB. Exact empty post-state and absent marker permit two read-only observed replays. An incompatible binding and a contradictory marker must refuse without further writes. A second real restart discards that negative marker without receipt cleanup. A job restored through a real BullMQ Queue must then cause repeated refusal with independent snapshots unchanged.

Every restart verifies the same container ID and a different Redis `INFO server` run_id. It disconnects the previous clients, refreshes the mapped port, opens a fresh Redis client and MONITOR, and fences the new stream with ECHO before taking the recovery baseline. PostgreSQL bytes/xmin/ctid must be unchanged across restart. The monitor counter stays cumulative; recovery comparisons use independent post-restart baselines. Selected configuration means the existing requirepass, maxmemory-policy and appendonly snapshot. Runtime `save ""` is deliberately not persisted via CONFIG REWRITE; the helper checks it before each restart. The tests assert RDB directory/filename and persistence mode explicitly. No queue/marker/receipt is reconstructed as positive success authority.

Controller binding and target environment remain explicitly synthetic recorded context. These tests establish no live lease, producer quiescence, deployment status, Railway persistence guarantee, or platform continuity. They do not activate the CLI/controller/reset, add TTLs, clean receipts, select another target or introduce historical ledger recovery.

## Offline commands and limits

Inspection read AGENTS, CONTEXT-MAP, the database overview, glossary, workflow, standards, verification, domain/runtime guidance, documentation lookup policy, worktree lifecycle, the recovery design and lost-reply source evidence, serialized source, interruption transport, current spec, package/workspace configuration, lockfile and installed dependency declarations/implementation. `git status`, `git branch --show-current`, `git rev-parse HEAD HEAD^{tree}`, `git worktree list --porcelain` and `git remote -v` established checkout identity. `git switch -c agent/issue-901-restart-continuity` and `git push -u origin agent/issue-901-restart-continuity` succeeded before edits.

Verification commands and results:

- `node --check packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts`: pass.
- `node scripts/check-agent-docs.mjs`: pass.
- `node scripts/check-domain-glossary.mjs`: pass, 31 terms.
- `git diff --check`: pass.
- Python byte comparisons using `git show 2b00c38:<path>`: all three protected specs and the contiguous original interrupted-case block match the base exactly. SHA-256 receipts follow below.
- `shasum -a 256 /tmp/carberk-resume-20261021/2b00c38e-db-119433585275.raw.log`: matches the parent receipt above. Bounded `rg` reads confirmed the recorded counts and interrupted suite result.
- `COREPACK_ENABLE_NETWORK=0 npm_config_offline=true pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts --max-warnings 0`: refused, exit 1. Log `/tmp/issue-901-restart-lint.log` reports `ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`, refusing the task run state directory at this worktree's `node_modules` because it is a symbolic link or not a directory. No lint result exists.

This isolated worktree initially had no node_modules. Temporary symlinks reused the assembler's existing node_modules at root, packages/db and apps/worker without installing or upgrading packages. After the pnpm refusal, all three links were removed. No alternate-tool lint/typecheck retry was made. Typecheck remains unrun, as do runtime tests. Root must supply an approved dependency setup and run affected lint/typecheck plus hosted disposable DB acceptance. No local Docker or service was started. No CI, GitHub content, credentials, quotas, Railway or live service calls were made.

## Dependency documentation receipts

Lockfile and installed assembler types show Testcontainers `12.2.0` and ioredis `5.10.1`. Installed Testcontainers declarations expose `restart(options?: Partial<RestartOptions>): Promise<void>`, `timeout: number`, `exec`, mapped-port refresh and container identity. Installed implementation and the exact official tag show restart retains the container and refreshes inspection/ports. Installed ioredis RedisCommander declarations confirm CONFIG, SAVE and INFO signatures. No dependency changed.

`npm view testcontainers time --json` and `npm view ioredis time --json` succeeded; captured metadata records release dates 2026-09-28 and 2026-03-19 respectively. The host supplies no training cutoff, so official documentation was read as required. Initial local node_modules glob reads found no installed files; matching installed versions were then read from the assembler worktree without writing there.

- Docs: https://raw.githubusercontent.com/testcontainers/testcontainers-node/v12.2.0/packages/testcontainers/src/generic-container/started-generic-container.ts verifies real container restart, timeout option and refreshed mapped ports. Download `/tmp/issue-901-restart-testcontainers-official.ts`.
- Docs: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ verifies RDB point-in-time storage, manual SAVE and data-loss limits. Download `/tmp/issue-901-restart-redis-persistence.html`.
- Docs: https://redis.io/docs/latest/commands/save/ verifies synchronous RDB snapshot completion. Download `/tmp/issue-901-restart-redis-save.html`.
- Docs: https://redis.io/docs/latest/commands/info/ verifies run_id identifies the Redis server instance. Download `/tmp/issue-901-restart-redis-info.html`.
- Docs: https://raw.githubusercontent.com/redis/ioredis/v5.10.1/README.md verifies the installed client's command interface. Download `/tmp/issue-901-restart-ioredis-official.md`.

All official downloads used `curl -fsSL`; commands succeeded. No overview update is needed because ownership, production behavior and documented boundaries are unchanged.

## Preserved oracle receipts

- `packages/db/scripts/staging-clean-reset.e2e.spec.ts`: `7e5182e3878e09874efa7f2cd57815b65042ec9c05cf22cac820b3ef1b2ded0c`.
- `packages/db/scripts/staging-clean-reset-redis.e2e.spec.ts`: `3107af471f2efe82e218077a7144ca9537efc3da056417e588fabb2d29e0e1e9`.
- `packages/db/scripts/staging-clean-reset-redis-recovery.e2e.spec.ts`: `81cbc8942d77e2a7961524b0bdf2aaf60e6fdac587150ba633c03381abb637db`.
- Original three interrupted case bodies, contiguous block starting at the first `it` and ending after the third case, with trailing whitespace stripped: `d4fb402b55dab940e1d45a5f2de1b7810baa87e3a881da9ac3f29adf80f96f80`.

## Root assembly verification

Root inspected checkpoint `a89acf00e2cec7119065f2c5e6abb4f721634029` and assembled it as `65654061`. The integration worktree already has ordinary dependency directories at root, `packages/db` and `apps/api`; none is a symlink. No dependency or task-state path was changed to retry the child's refused setup.

- `pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts --max-warnings 0`: pass. Log `/tmp/carberk-resume-20261021/restart-assembled-lint.log`.
- `pnpm --filter @auto-tm/db typecheck`: pass. Log `/tmp/carberk-resume-20261021/restart-assembled-typecheck.log`.
- Changed-spec syntax, documentation links, glossary and diff checks: pass.
- Direct byte comparisons: assembled spec matches the child checkpoint; all three protected specs and the contiguous original interrupted case bodies match `2b00c38e` exactly.

These are affected offline checks on the assembled files. The child's refusal remains recorded above. No local container was started and no new runtime result exists yet.

## Handoff gate

All three new restart runtime criteria are pending. No actual new RED or GREEN is claimed. The source already appears to implement these rules; seek hosted GREEN on the assembled candidate rather than inventing a source repair. Next action belongs to root: inspect this test-only checkpoint, provide normal dependencies, run lint/typecheck, assemble in sole PR #904, and run the hosted disposable DB lane. Preserve this branch/worktree until integration acceptance and normal lifecycle cleanup.
