# Redis initial completion source, 2026-10-21

Implementation handoff for #901/#897, parent-owned PR #904. Base `efdc38b840bc938b897db3c66d6735a8af77fda5`, tree `a031ee4fa7da056226806b00d07d7dedbde969c8`. The existing host worktree was reused; `agent/issue-901-redis-initial-completion-source-20261021` was reserved and pushed before edits. Scaffold `t3/redis-initial-completion-replay` remains at the base. First source checkpoint `e95ab2ec` was pushed; the final handoff also includes the focused guard tests and small validation corrections. No second worktree or subagent was used.

The [recovery design](prelaunch-reset-redis-recovery-design-20261021.md) and [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) govern this slice. The parent supplied actual behavioral RED on the exact base, PR Checks run `39646885372`, DB job `119384848671`: 37/38 files and 376/377 tests passed; the sole failure was recovery spec line 298, expected `{code:0,failure:""}`, actual `{code:1,failure:"Clean reset refused: target"}`. The writer independently checked that failure and SHA-256 `3900f0d05afe788882618aea05e37102f129e0772a1bc4446e0fecc49dd7fbfc` against `/tmp/carberk-resume-20261021/efdc38b8-db-119384848671.raw.log`. Deeper assertions were unreached. This handoff claims no runtime GREEN.

## Source behavior and evidence

| Criterion | Implementation / evidence | Status |
|---|---|---|
| Exact additive binding and digest pair | Fixed program validates exact owner/lease/window/deployment shape, canonical times, elapsed interval, candidate and target, plus `{digest,rowsReceiptDigest}`. Two offline serialized-program tests cover accepted ingress reaching a blocked resource port and malformed ingress refusing before any port. | Offline pass; hosted pending |
| Actual immutable rows authority | Strict stored projection is validated before canonical SHA-256. Current DB inventory must still match its recorded result. Intent/completion compare-and-set checks the same projection under the operator-table lock. `expected`, `result`, `committed_at` and all other rows fields remain unchanged. | Source inspected; hosted pending |
| Narrow operator extension | Exact known nine-column schema remains readable; the only admitted extension is tenth column `redis_state jsonb NOT NULL`, no default/extra object. New rows start with `{}`. An exact legacy store is extended transactionally before intent. Existing rows observation, deletion and replay retain their request/output contracts. | Source inspected; S2A rerun pending |
| Bounded atomic deletion | Lua re-observes bounded application state, independently classifies actual queue indexes/recognized keys, compares every observed key/type/count/absolute-expiry/DUMP byte, deletes only the classified observed disposable entries and writes the exact canonical completed marker in that execution. Fixed program derives all private keys; request-selected keys/prefixes are impossible. | Source inspected; hosted pending |
| Completion and replay | PG intent commits before Lua. PG completion follows exact completed-marker and zero-disposable post-state verification. Completed PG replay with a matching marker or absent marker is read-only. Changed context/rows, invalid states/markers, another reserved key, restored queues and absent PG authority refuse. | Source inspected; hosted pending |
| Default closure and preservation | CLI/controller, phase list, production authority, campaign controls, foreign keys/configuration and recognized monitoring preservation are unchanged. Redis mutation never uses FLUSH, prefix deletion or Queue obliteration. Redis errors/uncertain effects cannot report success. | Offline default-closed tests pass; preservation runtime pending |

The operator store remains operation-local, outside Prisma, as specified by the [S2A source contract](prelaunch-reset-s2a-db-source-20261021.md). Database-migrations guidance was read and applied to the additive, forward-only nullable/backfill/not-null extension under the exact-schema transaction. This is fixed-program source, not an applied migration. No existing migration was edited. Historical campaign machinery is untouched. Cleanup of the current operation receipt/marker remains separately gated; no TTL or cleanup path was added.

Binding is recorded synthetic controller context only. It proves no live lease ownership, producer closure, deployment status or safe live execution. No controller/lease adapter was enabled.

## Offline verification

All executed checks used no live DB/Redis client. Focused commands used the inert shell environment `COREPACK_ENABLE_NETWORK=0 npm_config_offline=true DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline REDIS_URL=redis://127.0.0.1:1/0`. The new guard tests run the real serialized program with explicitly synthetic target context and block the resource port; they fabricate no DB row, Redis effect or completion receipt.

- `node --check scripts/staging-clean-reset-remote.mjs` and `node --check scripts/staging-clean-reset-remote.test.mjs`: pass. `new Script(cleanResetProgram(...))` also parses the serialized program.
- `node --test scripts/staging-clean-reset.test.mjs scripts/staging-clean-reset-remote.test.mjs scripts/staging.test.mjs`: 39/39 pass, `/tmp/issue-901-redis-initial-focused.log`.
- Earlier `node --test scripts/staging-clean-reset.test.mjs`: 20/20, `/tmp/issue-901-redis-initial-reset-unit.log`.
- `node scripts/check-agent-docs.mjs`, `node scripts/check-domain-glossary.mjs`, `git diff --check`: pass. Logs `/tmp/issue-901-redis-initial-docs.log` and `/tmp/issue-901-redis-initial-glossary.log`.
- `pnpm test:staging-control`: interrupted by the writer while the broader Railway file had pending work. Output reports 129 passing tests and one cancelled file with `Promise resolution is still pending but the event loop has already resolved`. This is incomplete, not a pass, `/tmp/issue-901-redis-initial-staging-control.log`. No repair or broader rerun was attempted.

No dependencies are installed in this host worktree. Workspace TypeScript/lint and disposable DB runtime were not run. Docs: existing ioredis EVAL-buffer transport and Redis snapshot primitives are reused; no dependency or external service was changed and no network documentation lookup was performed under the source-only constraint. New Lua mutation behavior remains for the unchanged hosted oracle to validate. Full candidate verification and independent review belong to the parent.

## Preserved executable oracles

`git diff --exit-code efdc38b840bc938b897db3c66d6735a8af77fda5 --` all three files below passes. SHA-256:

- `packages/db/scripts/staging-clean-reset-redis-recovery.e2e.spec.ts`: `81cbc8942d77e2a7961524b0bdf2aaf60e6fdac587150ba633c03381abb637db`
- `packages/db/scripts/staging-clean-reset-redis.e2e.spec.ts`: `3107af471f2efe82e218077a7144ca9537efc3da056417e588fabb2d29e0e1e9`
- `packages/db/scripts/staging-clean-reset.e2e.spec.ts`: `7e5182e3878e09874efa7f2cd57815b65042ec9c05cf22cac820b3ef1b2ded0c`

## Remaining release blockers

The parent must publish and classify the same hosted oracle on the assembled candidate. Initial completion, completed replay/refusals, rows immutability and preservation are source claims until that run passes.

Every pre-existing pending PG record refuses, even with an apparent completed marker. Interrupted pending with no marker, lost Lua reply / Lua-to-PG completion gap, once-only pending-to-completed recovery and Redis restart continuity need the next real transport-boundary RED and later source. No pending/success record or production test hook was fabricated to imply coverage. A write error can leave partial effects and pending authority; Lua isolation is not rollback. Full recovery remains a release blocker.

No live target/service call, Docker, reset, deployment, credential/configuration/infrastructure change, dependency upgrade, CI dispatch/polling, GitHub content operation or PR creation occurred. Branch reservation/checkpoint pushes were authorized; linking parent PR #904 was T3 thread metadata only. Parent remains sole assembler and PR owner.

## First hosted repair

Assembled candidate `13f1f09b4a637f555ac762b9276e41be3d3988b0` failed PR Checks `39651254447`, DB job `119400811343`: 36/38 files and 375/377 tests passed. The unchanged recovery oracle stopped at initial completion with `Clean reset refused: Redis operation incomplete`. The old inventory oracle's final case expected `Redis completion receipt authority unavailable` but received `target`. All six rows cases and the other four inventory cases passed. Raw log `/tmp/carberk-resume-20261021/13f1f09b-db-119400811343.raw.log`, SHA-256 `964a3a1cd5ebfac2fe9700e8907e29d1e7e5190c23b51df6d4a180a322aee466`.

The source writer established that string replacement interpreted Lua dollar anchors as JavaScript replacement tokens and corrupted the generated mutation script. Checkpoint `9da5d9c51758e638a9b141fd97186101d40510fa`, assembled as `4cb6e077`, uses callback replacement to preserve the literal Lua. It also recognizes the exact legacy deletion request solely to return its existing no-authority refusal before any resource access. Malformed legacy requests and partial new bindings still refuse as `target`. The repair changes no recovery behavior, controller, phase list, target authority or live gate.

Root inspected the complete two-file source/test diff. Source/test syntax checks and 41 focused tests passed: 24 reset/remote cases plus 17 CLI cases. Logs are `/tmp/carberk-resume-20261021/redis-completion-repair-focused.log` and `/tmp/carberk-resume-20261021/redis-completion-repair-cli.log`. All three DB oracles remain byte-identical to `13f1f09b`. The writer also passed docs, glossary and diff checks. This is repair attempt one for the newly classified initial-completion failure; the same hosted oracle must establish runtime GREEN. No interrupted-recovery RED or completion is claimed.
