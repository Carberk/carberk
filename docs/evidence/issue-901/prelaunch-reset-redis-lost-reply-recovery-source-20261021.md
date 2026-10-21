# Redis lost-reply recovery source, 2026-10-21

Bounded #901 recovery handoff from published base `2e4b5a091788a97107a0e6a2b630b33581de2535` (tree `f2434def0b6930ea00eeffd60f2c807bdffa44a3`). Branch `agent/issue-901-redis-lost-reply-recovery-20261021` was reserved and pushed before edits. Previous repair branch `agent/issue-901-redis-completion-repair-20261021` and checkpoint `9da5d9c5` remain preserved. Parent is the sole assembler.

The hosted RED is DB job `119417651775`, PR checks `39656347576`, on candidate `2e4b5a09`. Raw log SHA-256 is `41e1a2667eb018600ae5f2f72c105b25f3fa0dc76e23cfa267c0fb09e0d86a3d`. It reports 39/40 files and 386/387 tests passing. All three old reset oracles pass unchanged. In the new interrupted oracle, initial completion, pending-without-marker refusal, actual Lua effect, dropped response, exact permanent completed marker, empty post-state, immutable rows and preservation all pass. The sole RED is line 396: recovery returns `Clean reset refused: Redis completion authority changed or pending`.

## Diagnosis and source change

The source rejected every non-empty `redis_state` unless it was already a completed record. That made the actual pending PostgreSQL row fail before the program inspected the real completed marker.

The [approved recovery design](prelaunch-reset-redis-recovery-design-20261021.md) and [acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) govern this change. The repair keeps the existing strict binding, target checks, rows projection digest and Redis read-only inventory. When the stored state is the exact pending shape, it now requires all of the following from the same current read:

- exact operation, target, binding and rows-receipt context;
- exact pending `preState` digest/count and canonical `intentAt`;
- a marker with the exact completed shape and matching context;
- canonical marker bytes, no expiry, `completedAt >= intentAt`;
- exact empty post-state and zero current disposable entries.

Only after those checks does the program call the existing PostgreSQL `store(pending, completed)` compare-and-set. The recovery branch returns before the Lua mutation script, so Redis receives no writes. Missing, malformed, mismatched or expired markers, changed rows authority/context, restored queues and unknown reserved state refuse. Completed replay remains read-only.

The new interrupted oracle was extended only from its actual pending row and actual completed marker. It restores only captured marker bytes after each negative fixture. It covers changed request/binding/rows context, malformed or mismatched marker values, marker formatting, TTL and absence, restored queue state and an unknown reserved control key. No positive pending/completed record is fabricated.

## Verification

Offline test/typecheck commands used `COREPACK_ENABLE_NETWORK=0 npm_config_offline=true DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline REDIS_URL=redis://127.0.0.1:1/0`; ESLint used the same offline pnpm flags. The extended negative controls were linted and compiled as part of the attempted typecheck, not executed against services. No local fake-client success is counted.

- `node --check scripts/staging-clean-reset-remote.mjs`, `node --check packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts` and serialized `new Script(cleanResetProgram({}))`: pass.
- `node --test scripts/staging-clean-reset-remote.test.mjs scripts/staging-clean-reset.test.mjs`: 24/24 pass (`/tmp/issue-901-lost-reply-focused.log`). No DB, Redis or container was started.
- `pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts --max-warnings 0`: pass (`/tmp/issue-901-lost-reply-lint.log`).
- `node scripts/check-agent-docs.mjs`, `node scripts/check-domain-glossary.mjs`, `git diff --check`: pass.
- `pnpm --filter @auto-tm/db typecheck` is blocked by missing generated Prisma/client and built contracts outputs; it reports no diagnostic in the interrupted spec. Related workspace diagnostics are not repaired in this bounded assignment (`/tmp/issue-901-lost-reply-typecheck.log`).
- No local runtime, Docker, dependency, CI, GitHub content, deployment, credential, reset or live service operation was performed.

Docs: not applicable, internal protocol validation only; no dependency or external API changed. The owning overview was updated for the changed pending-recovery limit. The worker/lifecycle sources, schema, phase list and contracts remain untouched.

The three protected DB specs remain byte-identical to the supplied base. SHA-256:

- `packages/db/scripts/staging-clean-reset.e2e.spec.ts`: `7e5182e3878e09874efa7f2cd57815b65042ec9c05cf22cac820b3ef1b2ded0c`
- `packages/db/scripts/staging-clean-reset-redis.e2e.spec.ts`: `3107af471f2efe82e218077a7144ca9537efc3da056417e588fabb2d29e0e1e9`
- `packages/db/scripts/staging-clean-reset-redis-recovery.e2e.spec.ts`: `81cbc8942d77e2a7961524b0bdf2aaf60e6fdac587150ba633c03381abb637db`

## Remaining gates

The parent must run the same hosted interrupted oracle on the assembled candidate and classify the actual positive recovery result. Redis restart continuity remains separate and unproven. The source does not retry Lua, repair a missing marker, assign a TTL, bypass an unresolved operation or enable controller/CLI/production activation. Full recovery and release remain gated on hosted GREEN and review.
