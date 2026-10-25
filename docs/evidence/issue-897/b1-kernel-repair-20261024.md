# B1 kernel repair, held checkpoint

Status: NOT READY for parent kernel acceptance. This bounded continuation preserves a substantive guard/discovery repair and authored executable scenarios. The campaign prelude and full server-derived purge/effect closure remain incomplete. Do not integrate this as a completed kernel, activate strict guards, start caller integration, or select hosted CI on this receipt alone. This is an implementation shortfall and missing verification, not missing founder consent or an unsettled product policy.

## Ownership and history

- Sole implementation writer in `/Users/bagtyyar/.t3/worktrees/carberk/t3-f2eb6cf5`, branch `t3/f2eb6cf5`.
- Supplied held base `66aaa39ca234fe8c8b166abd13e12c45647c061a`, tree `15dab4aff703c85a6389c1daa86b38e4a0eecb34`.
- The clean host scaffold initially pointed at `9bcbf1e6`. Only this owned scaffold was moved to the supplied held base. No parent or historical worktree was changed.
- Reservation pushed to this new owned branch. Test preparation checkpoint `6ebbf3e3`; source checkpoint `1a451b1d6d71578e2773b4e967aa65dea6a462db`, tree `f3757e7a55d00211fca40050cfb5681c1070388b`.
- Final receipt checkpoint SHA/tree are recorded after commit in `/tmp/897-b1-kernel-repair-20261024-handoff.md`.

The latest founder instruction authorizes this one bounded repair continuation. It does not reset prior attempts or caps. The earlier three related iterations, `90cc679d`, `9f45ee9f`, `40ead201`, stopped no-code `778f962a`, and held `66aaa39c` retain their historical dispositions. No new writer, independent review, acceptance retry or operational run was selected. Parent owns integration, acceptance, CI and release gates. PR904 remains the supplied remote `0ca85a62`; this writer neither opened a PR nor changed that branch. Push workflows were inspected as main/tag-only before pushing the owned branch.

The complete handoff, approved contract, overriding audit, recovery decision, prior writer handoff, prior receipts and required repository/skill guidance were read. Contract SHA-256 verified as `c15455516d773fe55d5151035b4afceef9348099c60d51578826c38b5eac3725`. The implementation role's explicit no-agent instruction governs this task; no agents were spawned.

## Preserved repair

The new forward migration is `20261024010000_diagnostic_source_guard_repair`. Every historical migration and retained mirror, including held `20261023130000_diagnostic_source_kernel`, remains byte-identical. The new mirror matches byte-for-byte, SHA-256 `786aa19839002c915cf00038f888c85e0b27a4d20b0905a1aac4edf5db5a1be3`. Prisma's model shape is unchanged; an SQL-inventory comment distinguishes the new exact profile, schema SHA-256 `4ae34bfb8ae50fb5a8bd83b04fa1eb819cbb63abf5e427f007dfc508ae15b546`. Prior schema inventories and checksums remain intact.

The repair replaces the blanket DML guard installation with a finite 22-table source guard matrix. Dependency-only media, service, measurement and artifact DML retains its existing owner. Every managed source/dependency table retains its dormant TRUNCATE refusal. Ordinary User/Business/Session/TOTP creation is distinguished from authority-changing updates/deletes. Statement checks cover protected UPDATE target columns; targeted no-op row writes require exact receipt coverage. A second BEFORE ROW check compares effective protected OLD/NEW values, including PKs, after the existing BEFORE mutators. The names sort after those mutators, and preparation refuses if a later enabled BEFORE ROW trigger would defeat that order. No guard discovers or acquires earlier-class locks.

Identity provenance's existing AFTER UPDATE/DELETE invalidator remains attached. Its forward function ignores only changes confined to four lease bookkeeping fields. Effective material, rights, cleanup and erasure changes retain the previous invalidation/disposal logic, including changes introduced by a BEFORE trigger. This avoids narrowing an UPDATE-OF trigger in a way that misses effective source changes. Existing Listing invalidation and normalized VIN identity/association rules remain unchanged. A no-op protected target can no longer bypass exact row coverage merely because projected tuples compare equal. Actual observed-identity changes remain sticky; date/mileage and normalized VIN formatting equivalence retain their approved semantics.

Membership discovery now includes OLD and proposed NEW business selectors, so post-lock rediscovery sees a competing absent OWNER/membership insertion rather than merely locking the business FK endpoint. The existing graph/work limits are unchanged. Preparation's pre-held-lock refusal now also recognizes the existing single-bigint campaign namespace locks through their actual unsigned `pg_locks` halves. Kernel two-int namespaces remain unchanged and physically disjoint. This does not complete the separate ordinary-writer campaign prelude.

All strict activation remains dormant. Preparation still refuses until privileged later DDL enables the required guards. There is no activation helper, production caller, automatic-admission change, legacy anchor backfill, alternate receipt, lock-plan API, generic transaction engine or automatic retry.

An initial uncommitted broad campaign/purge draft was inspected and discarded from delivery because it did not preserve the existing owners' exact cleanup, retention and attribution semantics. Its rejected diff is preserved only in `/tmp/897-b1-repair-initial-draft.diff`. No behavior from that draft was executed or accepted.

## Authored PostgreSQL evidence

`packages/db/tests/diagnostic-source-kernel.e2e.spec.ts` contains 32 definitions, 44 cases after parameter expansion. ALL SQL CASES ARE UNEXECUTED. Testcontainers, migrations and SQL were never started locally. No red/green result, real deadlock outcome or HTTP201 result is claimed.

New scenarios use a genuine Prisma client and interactive transactions through the exported `packages/db/src/index.ts` interface, including `withDiagnosticSourceCommand`, `assertDiagnosticSourceCommand` and `sealDiagnosticFirstObservation`. Source writes and first observation/component writes use real Prisma methods. They cover returned result/persistence, callback rollback, omitted mandatory effects, finished/wrong-operation/nested receipts and both granted first-slot seals without repinning. Deliberate raw-PG attacks remain raw.

Other authored cases cover ordinary Session creation versus authority updates, ordinary Listing counters/prices, uncovered equal-projection target writes, effective PK mutation by another BEFORE trigger, normalized VIN formatting, later observed-identity ABA on either visit with the other visit preserved, provenance leases, absent OWNER-edge insertion in both root-subject orderings, cross-class/campaign physical key separation, pre-held campaign locks, additional upload/collector/service/TOTP locking prefixes, and uncovered User-to-Session FK cascade refusal with unrelated rows preserved.

The old simulated physical-key case was replaced with a search for two DISTINCT IDs colliding under the actual PostgreSQL encoder, real preparation on both IDs, a `pg_blocking_pids` barrier, deduplication and exact target isolation assertions. The collision search is bounded at 300,000 candidate keys and runs on a connection with the existing five-second SQL timeout. It has not run, so neither a collision result nor its performance is established. No test timeout, transaction timeout, product cap, original HTTP positive/negative or B5 pin changed.

The existing suite fixture simulates pre-activation legacy data with privileged guard toggles in its disposable test database. This is not production activation or a completed rewrite of legitimate HTTP/bootstrap fixtures. Actual callers and those fixtures remain in the deferred caller phase.

## Verification and development results

| Command | Result |
|---|---|
| `pnpm install --offline --frozen-lockfile --ignore-scripts` | PASS; existing locked dependencies, no scripts or lockfile change |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db generate` | PASS; offline codegen with a non-listening dummy URL, no connection |
| `pnpm --filter @auto-tm/contracts exec tsc -p tsconfig.build.json --emitDeclarationOnly` | PASS; ignored declarations needed by DB typechecks; no runtime JS build |
| `pnpm --filter @auto-tm/db typecheck` | PASS, configured TS7 |
| `pnpm --filter @auto-tm/db exec tsc6 --noEmit` | PASS, configured TS6 |
| `pnpm --filter @auto-tm/db exec eslint tests/diagnostic-source-kernel.e2e.spec.ts --max-warnings 0` | PASS |
| `pnpm --filter @auto-tm/db lint` | BLOCKED/FAIL: five unchanged files cannot resolve the unbuilt `@auto-tm/contracts` JS entry. No rule disabled or runtime build run |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db exec prisma validate` | PASS; static schema validation only |
| `node --test scripts/diagnostic-source-kernel-schema.test.mjs scripts/diagnostic-source-guard-repair-schema.test.mjs scripts/diagnostic-ownership-grants-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs` | PASS, 6/6 metadata/profile/physical-key checks; no SQL proof |
| `node --check scripts/staging-schema.mjs` and new guard-repair schema test | PASS |
| `PYTHONPATH=/tmp/897-sql-parser python3 /tmp/897-b1-repair-grammar.py` | PASS using existing pglast 7.21; seven top-level statements, seven parsed function/block representations, both SQL function bodies and all 66 rendered CREATE TRIGGER statements. No catalog planning or execution |
| Historical migration/mirror, DB runtime source, apps and test-config diff against held base | PASS, unchanged |
| `git diff --check` | PASS |

Initial TS7 checks reported absent generated/built dependencies and a fixture type conversion; codegen, declaration compilation and the explicit fixture JSON boundary resolved the type errors. The first declaration command omitted the build config and emitted declarations beside source files; only those newly generated untracked files were removed, then declarations were emitted to ignored `dist`. The first static profile run correctly detected the new inventory; the historical kernel test now pins its exact historical snapshot and a new test verifies the current additive inventory. These development failures are retained in `/tmp/897-b1-repair-*.log`. They are not SQL acceptance attempts or evidence that SQL passes.

Logs and grammar helper remain under `/tmp`. Docs: internal-only kernel repair using existing repository/package interfaces; no dependency/API upgrade or external service lookup was needed. No runtime package import gate was run because JS builds are excluded. Full repository tests/typechecks/CI, SQL migration application, concurrency, role behavior and performance remain parent-owned missing evidence.

## Criterion disposition and exact remaining gaps

| Parent finding / criterion | Disposition |
|---|---|
| Executed SQL verification | BLOCKED. Zero SQL tests executed. Hosted execution and exact-candidate reviews remain required |
| Exported TS transaction-interface coverage | AUTHORED through genuine Prisma transactions; compile/lint pass, SQL behavior unknown |
| Production caller boundary | NOT STARTED as instructed. No production caller validates the repaired kernel yet |
| Selective effective guards and ordinary exclusions | SUBSTANTIVE PARTIAL REPAIR. Matrix/order/target checks and exclusions authored; real SQL and full owner/FK/fixture closure missing |
| Campaign fencing | INCOMPLETE. Pre-held namespace detection repaired only. Standalone persisted-ownership ordinary-writer prelude, deterministic exact affected table/namespace sets, enforcement against newly discovered namespaces, and scalar/Session/reset-prelude races remain missing. The old source-path namespace scan and registry-wide table locks remain held |
| Purge/effect closure | INCOMPLETE. Full diagnostic/service/video/measurement union, other-subject attribution-null updates, cleanup intents, center/template/bootstrap effects, mandatory audits, continuity request/proof disposal and covered FK cascades remain unimplemented. Existing caller-declared effects have not been promoted to server-derived plans |
| VIN/equal-projection behavior | Target-coverage repair authored; approved normalization and existing Listing invalidators preserved. A real valid-proof scenario proving every equal-projection/VIN-trigger invalidation combination remains missing |
| Required SQL race families | PARTIAL. OWNER/observed-identity/collision/key-space/uncovered-cascade cases added, none executed. NEW raw/report/proof/grant/request phantoms, retained consumed-edge races, complete both-side brand/model/year/seller/business/order-Listing/member-recreation ABA, expiry/revoke/use-time races, consumed payload disposal/minimum retry, comprehensive foreign isolation, account/service-actor/upload/collector opposing orders, ordinary campaign writers and covered purge cascades still need executable cases |
| Immutable migration/mirror/schema/profile/key inventory | PASS static. No historical migration changed; new mirror and additive profile agree |
| Full package lint/runtime consumers | BLOCKED by unbuilt contracts JS and excluded builds; changed-file lint and both DB compilers pass |

The full approved objective is broader than this coherent repair checkpoint. Parent must keep the kernel held and must not advance callers from this receipt. No automatic replacement, additional implementation round, hosted run or cap reset is selected here.

B2-B4 accepted work, B5 observer modules/pins/config and all API/worker source remain unchanged. No local/hosted SQL, Docker, DB service, HTTP environment, Railway retry, deployment/reset/reseed, native/device, runtime build, signing, store, merge, bootstrap execution or observer collection occurred. No owned processes remain. The final owned branch is pushed without force and no PR is opened.
