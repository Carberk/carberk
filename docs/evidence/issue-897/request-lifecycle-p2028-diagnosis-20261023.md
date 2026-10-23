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

Production and schema bytes are unchanged by this milestone. The only source change in this milestone is the bounded diagnostic record around the existing lifecycle transaction; SQL, interaction order, clocks, assertions, budgets, retries, and concurrency are preserved. `pnpm --filter @auto-tm/api lint` passed. `pnpm exec eslint <file>` was not a valid focused command because ESLint resolves its config from the package working directory. `pnpm --filter @auto-tm/api typecheck` was run and remains blocked by pre-existing missing workspace declarations (`@auto-tm/db` and `@auto-tm/contracts`) plus cascaded baseline errors; no build was run to resolve them. `git diff --check`, `pnpm check:agent-docs`, and `pnpm check:glossary` passed. No service, DB, HTTP, e2e, or wildcard test was run.
