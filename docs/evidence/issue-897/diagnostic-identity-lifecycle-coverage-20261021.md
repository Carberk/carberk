# Structured identity lifecycle coverage checkpoint

Test checkpoint for #914 within #897, integration PR #904. Base `13f1f09b4a637f555ac762b9276e41be3d3988b0`; this repair is on `agent/issue-914-lifecycle-clock-repair-20261021`, reserved and pushed before edits. The prior lifecycle suite source is the parent candidate. This checkpoint covers the gaps listed in the [source handoff](diagnostic-identity-evidence-source-20261021.md) under the [capture contract](diagnostic-identity-evidence-capture-contract-20261021.md) and [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md).

The original lifecycle checkpoint started at `168448d733ac2c6509ee1af11e787250b2b306de`, reservation `agent/issue-914-identity-lifecycle-coverage-20261021`; its source was `988f5ceb`, assembled as `df008555`.

It is tests only. No source changed. The existing suites are byte-unchanged: the oracle, erasure, binding and worker artifact suites. The writer did not run the 9 identity evidence HTTP cases; the later parent classification below records their hosted result.

## Clock repair diagnosis

The hosted RED was confined to the two `deleteAndPurge` calls: `deletionScheduledAt` used wall time (`2026-11-20T18:20:39.308Z` and `18:20:41.700Z`) instead of the fixed `purgeTime` (`2026-11-20T12:00:00.000Z`). `DeleteMe` injects the concrete identity `SystemClockAdapter`, while this suite previously overrode only the `IDENTITY_CLOCK_PORT` alias. The account-erasure oracle already establishes the supported seam: Vitest fake timers with `toFake: ["Date"]`, retaining real timers. The lifecycle suite now applies that setup and restores real timers during teardown. Persistence and product deletion semantics are unchanged.

This diagnoses a test harness setup defect, not a product clock bug. The repair is limited to the new lifecycle spec and this evidence file. It does not change the fixed 30-day literal, assertions, purge subprocess, worker suite, or any pre-existing reset race.

Ranked hypotheses and probes, using the supplied hosted RED instead of a prohibited local service replay:

1. If deletion bypasses the overridden alias, its injected provider will read wall time. Confirmed by `DeleteMe.ts` injecting `SystemClockAdapter`, `identity.module.ts` binding `IDENTITY_TOKENS.ClockPort` with `useExisting`, and `SystemClockAdapter.now()` returning `new Date()`. Replacing an alias provider does not replace the concrete provider. `DiagnosticIdentityErasure.e2e.spec.ts` already freezes Date to make its literal 30-day schedule pass.
2. If persistence rewrites the date, a database write/default/trigger would replace the supplied timestamp. `PrismaAccountDeletionUnitOfWork.scheduleDeletion` writes the supplied `deletionScheduledAt` directly; the hosted values exactly track wall time plus 30 days. No persistence change is needed.
3. If the suite's mutable diagnostic time leaked into deletion, it would still be advanced at the failing call. Its only assignment advances to `12:01` for expiry, and a `finally` restores `initialTime` before either failing deletion. Neither hosted value matches that synthetic advance.

Hosted input: PR Checks `39651254447`, API job `119400811377`, candidate `13f1f09b`. Raw `/tmp/carberk-resume-20261021/13f1f09b-api-119400811377.raw.log`, SHA-256 verified locally as `adca4578c9e867049532ed67fd303771ecb62b435ae1304212e21efc0191155a`. API 320/322 files and 3083/3088 tests passed. The two other new HTTP lifecycle cases passed, as did all four new worker retention cases. The original nine-case identity-evidence oracle passed; no speculative rejection repair is included. The separate Support/publish/attach reset races remain blockers.

## Clock repair offline verification

Logs are `/tmp/issue-914-lifecycle-clock-repair-*.log`. No dependency versions or lockfile changed. The first DB build lacked `DATABASE_URL`; the successful retry used the inert `postgresql://offline:offline@localhost:5432/offline` only for code generation, without opening a database connection.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --offline` | PASS, existing lock/store only |
| `pnpm --filter @auto-tm/contracts build` | PASS |
| `DATABASE_URL='postgresql://offline:offline@localhost:5432/offline' pnpm --filter @auto-tm/db build` | PASS, generated ignored client |
| `pnpm --filter @auto-tm/api typecheck` | PASS |
| `pnpm --filter @auto-tm/worker typecheck` | PASS |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS |
| `pnpm --filter @auto-tm/worker exec tsc6 --noEmit` | PASS |
| `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticIdentityEvidenceLifecycle.e2e.spec.ts --max-warnings 0` | PASS |
| `pnpm --filter @auto-tm/worker lint` | PASS |
| `git diff --check` | PASS |

Docs: no external dependency or API change; no documentation lookup needed. The module ownership and product behavior documented in the overviews remain unchanged.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Classify the exact scheduling failure before editing | Hosted timestamps, concrete clock injection, alias composition, persistence path and existing erasure oracle | PASS, harness setup |
| Repair only the clock setup in the new lifecycle suite | Date-only fake setup and guaranteed restoration; complete diff inspection | PASS |
| Preserve literal schedule, ordinary HTTP deletion, session revocation, isolation/OTP guards, real purge subprocess, upload barriers, generation/pins/foreign survival | All test bodies byte-unchanged from `13f1f09b`; worker and product source absent from diff | PASS by inspection |
| Same hosted assertions GREEN after repair | Parent must assemble and run hosted CI | BLOCKED at this bounded handoff |

No local services, Docker, HTTP/database tests, broad unit/root reruns, CI dispatch, live infrastructure or GitHub content mutations were performed. Only the requested reservation/checkpoint branch was pushed. Hosted GREEN for the repaired suite remains the parent's gate; offline checks do not prove it.

## New suites

`apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityEvidenceLifecycle.e2e.spec.ts` runs over real HTTP, PostgreSQL and the private S3 adapter, plus the existing purge subprocess harness. That harness keeps its foreign-account and OTP refusals verbatim.

1. A concurrent upload under a live write lease returns 400 `DIAGNOSTIC_EVIDENCE_BUSY`; different bytes return 409. The exact descriptor and lease are committed before bytes. The upload verifies exactly once, and retry is read-only.
2. Rights expire during a held storage write:
   - the late verify is denied with 403;
   - only the writer's own epoch moves the intent to `cleanup_pending`;
   - the lease is retained and the exact object remains until worker cleanup;
   - the fence is durable after the clock is restored.
3. Commissioner account erasure lands during a held write:
   - the purge fences the intent (new epoch, rights and creator cleared, lease kept) and bumps generation;
   - the resumed writer changes nothing;
   - an old-epoch restore matches 0 rows.
4. Commissioner erasure of evidence that has a correction, a report pin and two provenance objects:
   - content, hashes and linkage are cleared in place;
   - the report raw and evidence pins are cleared;
   - generation goes from 2 to 3;
   - the exact keys are queued with new epochs;
   - the comparison and both downloads deny.

   Then the staff deletion detaches `recordedById`/`createdById` only, with `recordHash` unchanged. The comparison shows `recordedBy: null` at report version 4. The other commissioner's and the foreign visit's rows, objects and comparison stay unchanged.

`apps/worker/src/jobs/diagnostics/DiagnosticIdentityRetention.e2e.spec.ts` is gated on hosted CI, like the existing worker suite. It uses direct fixtures under the migration guards and a synthetic 2001 clock.

1. Rights expiry:
   - nothing changes 1 ms before the boundary;
   - at the boundary, evidence is erased in place and generation increases by exactly one, including on a rerun;
   - provenance is fenced and its exact object removed in the same pass;
   - the raw observation and the unexpired control are unchanged.
2. Upload lifecycle at 24h:
   - the staged intent and the verified unattached item are retained at 24h − 1 ms and removed at 24h;
   - the attached item is retained;
   - a live-leased bound intent waits for its lease.
3. Retry accounting:
   - a storage failure increments attempts to 1 and sets `cleanup_storage` with a 60s lease;
   - the next run is skipped while the lease holds;
   - the retry removes the object, with attempts at 2;
   - each delete names exactly one key;
   - a resumed late writer is removed by the next rotation, with attempts at 3.
4. Account purge:
   - before any mutation, the test refuses unless the due accounts are exactly its own two and there is no code request older than 30 days, the job's global retention cutoff (this suite creates none);
   - the commissioner's evidence and raw record are erased before intake, and generation is bumped;
   - an old-epoch restore matches 0 rows;
   - the verified object is deleted at once and the held writer's object after its lease;
   - the deleted staff member is only detached on another commissioner's retained visit.

## Offline evidence

All logs are `/tmp/issue-914-lifecycle-*.log`, with the inert `DATABASE_URL`.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile --offline` | PASS |
| contracts and db build | PASS |
| typecheck (api, worker); both new specs are in the program | PASS |
| lint (api, worker) | PASS |
| nest build (api, worker) | PASS |
| API unit | 2417 pass, 2 skipped |
| worker unit | 292 pass |
| new worker suite offline | 4 skipped (hosted gate) |
| `node --test 'scripts/*.test.mjs'` | 578 pass |
| `check:runtime-imports` | PASS |
| `git diff --check` | PASS |

NOT RUN: any HTTP or database suite, Docker, MinIO or CI. RED or GREEN is not claimed. Each new assertion is the intended behavior read from source, the contract and the migration. Only a hosted run can show whether it holds.

## For parent classification (observed by inspection, unchanged)

- **Oracle harness inspection lead.** `DiagnosticIdentityEvidence.e2e.spec.ts:468` races `pending.then(() => { throw })`. The writer identified a possible unhandled rejection after the barrier wins. The new suite records early completion with a flag instead. The later hosted run below passed the unchanged oracle without that failure; this lead does not establish a defect or justify changing the oracle.
- **Uncovered fences in `upload`.** Fences between intent commit and the pre-put lease check, and `put`/readback failures, throw outside the queuing `try`. Those intents stay `staged` with a bound key until the 24h stale rule, not immediate cleanup. This is not covered by the new tests.
- **Expiry keeps attribution.** Rights-expiry erasure keeps `recordedById`. The tests leave it unasserted.
- **Attempts keep counting.** Completed provenance stays in the cleanup rotation and increments `cleanupAttempts` on every pass. The tests assert this current behavior.
- **First failure ends the pass.** A single storage failure ends the worker pass for the rest of the batch. This is the existing artifact and evidence pattern.
- The expired evidence report pin remains, as already recorded.

## Parent assembly and hosted predecessor classification

The parent inspected the complete original handoff and the stale-OTP guard, then assembled them as `6a6d5a4c` and `943607e6`. The guard matches the real purge job's strict `createdAt < now - 30 days` cutoff. The four original diagnostic suites and product worker source are unchanged from `efdc38b8`.

On that predecessor, PR Checks run `39646885372`, API job `119384848625`, passed the original identity-evidence oracle 9/9, report binding 1/1, real-worker account erasure 1/1 and identity history 1/1. The worker passed 56/56 files and 369/369 tests. The API passed 320/321 files and 3080/3083 tests; its three failures are the retained Support/publish/attach reset race tails. No unhandled-rejection failure was reported. Raw log SHA-256: `9a26b123a988838ab894ae324abf1795d968b1fc0143ff4d55d3e696fc8673ef`, stored at `/tmp/carberk-resume-20261021/efdc38b8-api-119384848625.raw.log`, with a separate ANSI-free derivative.

Affected combined offline checks on `943607e6` passed: API/worker typecheck, focused lint of both new specs, agent-docs, glossary and diff checks. The first typecheck used a stale generated Prisma client and failed; rebuilding contracts and DB regenerated the current client, after which both typechecks passed. Commands/results and logs are in `/tmp/issue-897-lifecycle-assembled-20261021`. No container suite was run locally, and no broad unit/root checks were repeated. The eight new lifecycle cases still require hosted execution; the predecessor results do not establish their GREEN.
