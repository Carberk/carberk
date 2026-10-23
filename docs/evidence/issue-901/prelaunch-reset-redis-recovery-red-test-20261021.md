# Redis recovery executable RED checkpoint

#901 under #897 / sole integration PR #904. Supplied source base: `1eb5a0c6cb75c297397e99fc5717cefd3b2e29cf`. Existing reserved branch: `agent/issue-901-redis-recovery-red-20261021`. Historical blocker: `d0624ca7`, resolved by root's explicit internal protocol choices and the [design](prelaunch-reset-redis-recovery-design-20261021.md), pushed before this test in `73d5cd55` then `7acbdad0`. Only completed markers authorize recovery; PostgreSQL pending alone never proves effects.

The [focused spec](../../../packages/db/scripts/staging-clean-reset-redis-recovery.e2e.spec.ts) uses actual Testcontainers PostgreSQL and Redis, migrated application schema, real BullMQ lifecycle state for the existing twelve queues, and the actual serialized `cleanResetProgram`. Only connection transport is remapped. Ordinary S2A must actually complete; the test then reads and strictly validates its actual immutable stored row projection before canonical hashing. Actual Redis inventory must succeed without writes before the first new completion assertion. Synthetic target environment and recorded-controller context are protocol fixtures; they establish no real lease, producer closure, deployment status or operational authority.

## Assertions authored; runtime evidence pending

| Criterion | Test boundary |
|---|---|
| Initial bounded completion | Full strict Redis request with additive binding and exact `{digest,rowsReceiptDigest}`; zero disposable keys afterward; foreign/configuration/monitoring bytes preserved |
| Durable authority | Actual completed `redis_state` and canonical exact marker read from program effects; immutable rows projection and `committed_at` unchanged; no marker TTL; redacted receipts |
| Completed replay | Exact recorded post-state with marker, dropped real replay stdout, and absent marker all replay read-only; actual Redis MONITOR write counts and PG tuple versions supplement state snapshots |
| Marker refusals | Pending-shaped, malformed, unknown-version, cross-operation, wrong rows digest, wrong post-state, extra-field and foreign control marker variants derive from the real marker only |
| Binding/authority refusals | Missing/extra/coerced request fields, changed owner/lease/window/deployments/target, invalid deployment status/SHA/replica count, inventory mismatch, changed actual rows receipt, invalid actual `redis_state`, restored actual queue and missing DB authority; no further writes |

**Predicted first behavioral RED:** the successful bounded completion assertion receives code `1`, `Clean reset refused: target`, because current source accepts neither the additive `binding` nor the two-field inventory. Setup failures remain setup failures. No disposable runtime was run here; collection, lint and compiler output do not establish runtime RED. Root owns hosted classification before source authorization.

Not covered by this first executable checkpoint: interrupted PostgreSQL pending with no marker, lost Lua reply before PG completion, once-only pending-to-completed recovery, or Redis restart continuity. No stable fixed transport seam currently identifies/suspends those transitions. The test seeds no future positive intent/completion, creates no production test hook, and makes no claim that a dropped replay stdout models the Lua/PG gap. PG-completed marker absence is tested only with validated completion, exact post-state and no contradictory control marker.

## Offline checks and prerequisites

- `COREPACK_ENABLE_NETWORK=0 npm_config_offline=true pnpm --filter @auto-tm/db exec vitest list scripts/staging-clean-reset-redis-recovery.e2e.spec.ts`: passes, one test collected; no hooks run.
- Same offline prefix with `pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset-redis-recovery.e2e.spec.ts --max-warnings 0`: passes.
- DB `typecheck` (TS7) and `exec tsc6 --noEmit`: blocked by missing generated Prisma client and built contracts. After worker-local dependencies were hydrated offline, neither compiler reports a diagnostic in the new spec. Whole-workspace success is not claimed. Worker prerequisite typecheck also reports missing built DB/contracts outputs.
- `node scripts/check-agent-docs.mjs` and `git diff --check`: pass. No ownership/implementation limitation changed, so no overview update is needed.

Check logs are local `/tmp/issue-901-redis-recovery-{ts7,ts6,worker-prerequisite}.log`. The pnpm host reused cached packages (zero downloads), with no tracked dependency/config changes. Docs: existing harness APIs and local installed ioredis `Redis.d.ts`/README verified monitor/fence use; no dependency version or external service changed and no network documentation lookup was performed under the task constraint.

Remaining prerequisites: normal generated/build outputs for workspace typecheck; hosted disposable PostgreSQL/Redis and migration success; root review/assembly and actual behavioral RED. Controller/CLI closure, live reset, campaign control disposal, production authority, deploy/restart/cleanup acceptance and all product invariants remain unproved. No local Docker/services/runtime, live target/credential access, CI dispatch/polling, GitHub issue/PR mutation or nested agent work occurred. No production/source/schema, existing spec, dependency or global configuration file changed.
