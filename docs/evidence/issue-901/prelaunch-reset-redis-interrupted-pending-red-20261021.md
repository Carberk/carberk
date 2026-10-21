# Interrupted Redis pending RED checkpoint, 2026-10-21

This checkpoint preserves a separate disposable PostgreSQL/Redis test draft for the next #901 writer. It does not claim recovery RED evidence.

The exact assembled predecessor `13f1f09b4a637f555ac762b9276e41be3d3988b0` failed hosted DB job `119400811343` in PR Checks `39651254447`: 375/377 tests passed. The raw log is `/tmp/carberk-resume-20261021/13f1f09b-db-119400811343.raw.log`, SHA-256 `964a3a1cd5ebfac2fe9700e8907e29d1e7e5190c23b51df6d4a180a322aee466`. The recovery oracle failed before its intended initial-completion setup with `Clean reset refused: Redis operation incomplete`. The older inventory oracle also has error-text drift, expected `Redis completion receipt authority unavailable` and received `target`.

Because initial completion did not establish a real marker and empty Redis post-state, no interrupted-pending recovery assertion may be labeled RED from that run. The next source writer must repair or diagnose that setup path first, then rerun the existing completion oracle before using the new transport cases.

The draft test is [staging-clean-reset-redis-interrupted.e2e.spec.ts](../../../packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts). It preserves all three existing DB specs byte-for-byte. Its setup classifier requires uninterrupted completion and then verifies, using disposable resources, the following sequence:

1. A real Redis transport drop before the mutation Lua command leaves a committed PostgreSQL pending intent, no marker, unchanged Redis bytes, and zero later writes. A fresh replay remains a read-only refusal.
2. A real transport drop after forwarding the mutation Lua command but before forwarding its RESP reply leaves the actual pending PostgreSQL intent, canonical completed marker with no TTL, exact empty disposable post-state, preserved keys, and unchanged rows authority. Only after those checks does the first recovery assertion expect code 0. Current source is expected to refuse this pending state, so this is the intended later RED.
3. Once recovery is implemented, the first replay must record completion once and subsequent replays must preserve PostgreSQL `xmin`/`ctid`, Redis bytes, and write count.

The transport draft has not had runtime or standalone framing tests. Its loopback proxy forwards real RESP frames and discards only the selected Lua reply. It does not fabricate a row, marker, Redis effect, production hook, controller activation, target, container, Docker/CI/GitHub write, or dependency. It never logs command arguments or payload bytes.

Offline evidence for this checkpoint: focused staging guard tests passed 22/22; targeted ESLint passed with no errors or warnings; `git diff --check` passed; the repository TypeScript gate remains unavailable in this worktree because generated Prisma and workspace contract types are absent. Disposable Testcontainers were not run locally by instruction. Hosted initial-completion evidence is blocked by the predecessor failure above.

Commands used `COREPACK_ENABLE_NETWORK=0 npm_config_offline=true` where applicable:

- `node --test scripts/staging-clean-reset.test.mjs scripts/staging-clean-reset-remote.test.mjs`: 22/22 pass.
- From `packages/db`, `pnpm exec eslint scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts scripts/redis-interruption-transport.ts --max-warnings 0`: pass.
- `pnpm exec tsc --noEmit -p packages/db/tsconfig.json`: fails on absent generated Prisma and built contract declarations. No diagnostic names either new file. Full output is `/tmp/issue-901-interrupted-db-typecheck.log`.
- `pnpm exec tsc --noEmit -p /tmp/issue-901-interrupted-tsconfig.json`: pass. The temporary config extends the DB config, includes only the two new files and supplies the DB workspace's existing `@types` directory.
- `node --check` on both new TypeScript files and `scripts/staging-clean-reset-remote.mjs`: pass with host Node 24.13.0.
- `git diff --exit-code 13f1f09b4a637f555ac762b9276e41be3d3988b0 --` the three old DB reset specs: pass. Their SHA-256 values remain `7e5182e3878e09874efa7f2cd57815b65042ec9c05cf22cac820b3ef1b2ded0c`, `3107af471f2efe82e218077a7144ca9537efc3da056417e588fabb2d29e0e1e9`, and `81cbc8942d77e2a7961524b0bdf2aaf60e6fdac587150ba633c03381abb637db` for rows, Redis inventory, and Redis recovery respectively.

The first pnpm execution populated the worktree's dependencies from the existing lockfile and local store. No manifest or lockfile changed. No dependency or service API was changed. Docs: existing Node TCP, RESP framing and the unchanged ioredis transport remap were used; no external documentation lookup was made during this stopped draft. A source writer must review and validate the proxy before relying on it as behavioral evidence.

The current host worktree was reused at the supplied SHA. Scaffold branch `t3/issue-901-redis-interrupted-pending-red` remains at the base. Branch `agent/issue-901-redis-interrupted-pending-red-20261021` was reserved and pushed before edits. No issue comment, PR, CI dispatch or live-target operation was created. No further writer was launched; the parent must assign one source-repair owner.

No production source was changed. The next writer owns source diagnosis/repair; this branch is only the bounded test and evidence checkpoint.
