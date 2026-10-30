# Request lifecycle P2028 diagnosis

This note investigates the hosted `run39951828758` failure in API job `120407974762` for `DiagnosticContinuityProofIssuance.e2e.spec.ts`, test `preserves request-bound B after real A rights disposal and fences erased B metadata`. The first checkpoint used base `d9cc1896ff95d37c73885e973ccd10d1222b8dd1` (tree `a419af389ffb71be7a54b65869eb359610ba764d`). The current branch also incorporates integration `0a995b55f541675141f6a99704678f3466076a75`, preserving its font-path change and unrelated classified-fixture receipt.

## Observed failure

The failure is at line 1512, while committing this separate interactive transaction:

```ts
await db.$transaction(async tx => {
  await tx.$queryRaw`SELECT diagnostic_dispose_ownership(NULL::text, ${new Date(lifecycleExpiry)}::timestamp)`;
});
```

The hosted error is Prisma 7.8.0 `P2028`, operation `commit`, timeout `5000`, `timeTaken: 0`. The raw log reports: `A commit cannot be executed on an expired transaction`. The stack points through Prisma `ClientEngine.ts` and `getPrismaClient.ts`, then line 1512. No assertion after the transaction ran. Therefore this run does not prove that the SQL body was slow, that the transaction rolled back successfully, or that request-bound B recovery was incorrect.

Evidence hashes:

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/carberk-resume-20261021/d9cc-api.log` | `ad3debc11aeb213e3ba4df1e26234ca59ede8536645533d077734221ecfb3894` |
| `/tmp/carberk-resume-20261021/d9cc-api.plain.log` | `66f3935221131cc830d69db36dc35aed400d5ca0dfd038c75e33b231b5a20ec5` |

Commands used: `shasum -a 256 /tmp/carberk-resume-20261021/d9cc-api.log /tmp/carberk-resume-20261021/d9cc-api.plain.log`; `rg -n -C 10 'P2028|timeTaken|1512' /tmp/carberk-resume-20261021/d9cc-api.plain.log`.

## Clock and Prisma evidence

The suite enables `vi.useFakeTimers({ toFake: ["Date"] })` and sets the system date to `2026-10-21T12:00:00.000Z` in `beforeAll`. `atLifecycleTime` replaces the two injected domain clocks, calls `vi.setSystemTime(new Date(instant))`, runs the callback, then restores both clocks and the prior fake date. It does not fake timers or monotonic scheduling. The failing callback therefore runs with wall-clock `Date.now()` frozen at `12:05`, while real promise and SQL execution continue.

The exact installed Prisma 7.8.0 client source map was inspected offline. `getPrismaClient.ts` starts an interactive transaction and later calls engine `transaction('commit', ...)`. The client-engine transaction manager records `startedAt: Date.now()`, creates the timeout with real `setTimeout`, and reports timeout metadata as `Date.now() - startedAt`. Its timeout close path removes the transaction from the active map and marks it `timed_out`; a later commit is converted to `P2028` with operation `commit`. Frozen `Date` therefore directly explains metadata `timeTaken: 0` after a timeout, but does not by itself show that the timeout fired early or late. The timer remains real because the suite fakes only `Date`.

The migration's `diagnostic_dispose_ownership` function takes an ordered lock prefix, recomputes targets, deletes proof payloads, and updates ownership components. The source shows potentially blocking row locks and several statements, but source inspection cannot establish the hosted SQL duration or lock wait. The error occurs at transaction commit, so the log does not distinguish an expensive function body, a lock wait, a client-side deadline race, or a clock-induced deadline state.

## Ranked hypotheses and falsifiable predictions

1. **Clock interaction with Prisma deadline bookkeeping.** Prediction: a minimal named Prisma transaction with a trivial `SELECT 1`, run under this suite's `toFake: ["Date"]` and `setSystemTime` transition, can produce the same commit P2028 without the disposal function. The same probe with real `Date` should not. This would isolate client deadline state from SQL and request logic. The current evidence does not rank this above the SQL/lock hypothesis.
2. **The disposal function or a lock held by another operation exceeds the five-second interactive timeout.** Prediction: with real wall-clock time and the same database state, query timing or a server-side statement/lock observation shows at least five seconds before commit; increasing only the transaction timeout changes the result. The current artifact contains no such timing or lock evidence.
3. **A transaction-manager race closes the transaction before commit.** Prediction: a fixed, allowlisted phase record shows callback entry/exit before the timeout boundary but a timeout/commit ordering race, with no corresponding SQL duration. This remains distinct from a slow SQL body.
4. **Request-bound B correctness or erasure caused the failure.** Prediction: the transaction commits and only a later request/recovery assertion fails. The hosted stack disproves this for this run because the commit itself failed first.

## What is proven and unknown

Proven: the hosted run reached the lifecycle disposal transaction; Prisma 7.8.0 returned `P2028` while committing it; the reported metadata was `operation=commit`, `timeout=5000`, `timeTaken=0`; the test's Date fake was active; no later lifecycle assertion executed; the exact migration function includes ordered locks and multiple writes. Root cause is UNKNOWN.

Unknown: real SQL duration, lock waits or blocking sessions; whether the client timeout timer fired from real elapsed time; whether fake `Date` alone reproduces the failure; whether the database transaction rolled back; and whether request-bound B recovery passes after a successful disposal.

An offline reachability probe ran with `node --input-type=module` and `import('@prisma/client/runtime/client.js')`. The installed runtime exports `getPrismaClient` and public error/types, but not `TransactionManager`; its manager and adapter wiring are internal to the bundled runtime. Constructing a faithful in-memory adapter through the public client would require a generated schema/client and would no longer be a bounded test of the exact manager path. No copied manager implementation was used as proof. The pure manager comparison is therefore UNSAFE/UNAVAILABLE without package internals or an application client, and was stopped.

The failing transaction now has a fixed, local failure record. It samples `node:perf_hooks` monotonic timestamps at transaction start, callback entry, query completion, callback exit, transaction resolution or rejection, plus numeric fake `Date` values before and after. On failure it emits one JSON record containing only allowlisted `P2028`, `commit`, `5000`, and numeric `timeTaken` fields when present, then rethrows the identical error. It adds no SQL, query, identifiers, payloads, URLs, environment values, or extra database calls. This record distinguishes five real seconds inside the callback/query from callback completion followed by a commit rejection, but it cannot prove database rollback.

## Smallest next action

Use the next ordinary hosted run's single sanitized failure record. If monotonic callback/query elapsed time is near five seconds, investigate SQL/lock duration with a separately approved bounded database probe. If callback completion is quick but commit rejects, compare the Date-only fake with a real-Date run using a supported Prisma test seam before proposing any correction. No source-only clock remedy is justified.

## Verification

Production and schema bytes are unchanged by this milestone. The only source change in this milestone is the bounded diagnostic record around the existing lifecycle transaction; SQL, interaction order, clocks, assertions, budgets, retries, and concurrency are preserved. The logger guard was tested with null, undefined, strings, unrelated objects, malformed metadata, and valid P2028-shaped values. `pnpm --filter @auto-tm/contracts build` passed as an offline prerequisite. The DB build was not run because `packages/db/scripts/build.cjs` unconditionally invokes `prisma generate`, which this task forbids. `pnpm --filter @auto-tm/api lint` passed. `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit` were run after the contracts build and remain blocked by the missing generated `@auto-tm/db` declarations; their logs are recorded below. `git diff --check`, `pnpm check:agent-docs`, and `pnpm check:glossary` passed. No service, DB, HTTP, e2e, or wildcard test was run.

## Assembly checkpoint manifest

Authorized docs checkpoint `0593e3757d2bdcd3ba91fa21a6b934630c793762` (tree `2e332b86bd883bb45d6431ff46680de2d4984146`) was merged from base `0a995b55f541675141f6a99704678f3466076a75`. The renderer receipt remains byte-identical to that checkpoint. The source preservation probe reconstructed the lifecycle test byte-for-byte after removing only this milestone's logger block and `node:perf_hooks` import. The changed paths relative to `0a995b55f541675141f6a99704678f3466076a75` are exactly this receipt, this lifecycle test, and the incorporated renderer receipt.

Local command and artifact hashes:

| Command/artifact | SHA-256 or result |
| --- | --- |
| `pnpm --filter @auto-tm/contracts build` log | `b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616` (pass) |
| synthetic logger and source-preservation probe log | `ea9d93be636ba594a749a07f4b6a770211ec076eca0cf78143123aa372922b50` (pass) |
| focused API lint from `apps/api` package cwd | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca4959911b7852b855` (pass) |
| `pnpm --filter @auto-tm/api typecheck` log | `a463ae3b9e5f53d3c04a922aa0f8f84e49e877a6932fece9589916a7d984fcd7`; blocked by unresolved `@auto-tm/db` declarations |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` log | `c832dfaed93c3c72f0941701139d12d1c1180726c2dce5b8ff8a33019af38353`; same generated-DB blocker |
| `git diff --check` | pass |
| `pnpm check:agent-docs` | pass |
| `pnpm check:glossary` | pass, 31 terms |

The DB build was inspected but intentionally not executed: its first command is `pnpm exec prisma generate`; no connection/listener path was needed to establish this blocker. No package-wide tests, services, migrations, seeds, or generated Prisma client were run.

## Setup completion checkpoint

The earlier declaration failures were unmet build prerequisites, not established baseline source errors. With the explicitly authorized offline generation step, the exact command below completed without a database connection:

```sh
DATABASE_URL='postgresql://offline:offline@localhost:5432/offline_codegen_only' pnpm --filter @auto-tm/db build
```

`packages/db/prisma.config.ts` read the syntactically valid inert URL; Prisma generated the client and the package build completed. No migrate, seed, listener, service, Docker, or database action ran. The generated client is ignored; `git status --porcelain` remained clean before the receipt edit.

Post-build verification manifest:

| Command/artifact | SHA-256 or result |
| --- | --- |
| DB build log | `4b8557c53bd906627ee758c02ae4cfe0dbdfaaf1dc908d0c94ac7bc752239371` (pass) |
| API `pnpm --filter @auto-tm/api typecheck` log | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` (pass) |
| API `pnpm --filter @auto-tm/api exec tsc6 --noEmit` log | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca4959911b7852b855` (pass) |
| Focused lifecycle lint from `apps/api` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca4959911b7852b855` (pass) |
| `git diff --check` | pass |
| `pnpm check:agent-docs` log | `8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20` (pass) |
| `pnpm check:glossary` log | `d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621` (pass) |

The prior blocked typecheck logs remain historical evidence of the missing declaration setup before this prerequisite; they are superseded by the passing post-build checks above. No tracked product, schema, test, or generated source bytes changed.
