# Structured identity lifecycle coverage checkpoint

Test checkpoint for #914 within #897, integration PR #904. Base `168448d733ac2c6509ee1af11e787250b2b306de`; the source is `988f5ceb`, assembled as `df008555`. Reservation `agent/issue-914-identity-lifecycle-coverage-20261021` was pushed at the base before any edits. This checkpoint covers the gaps listed in the [source handoff](diagnostic-identity-evidence-source-20261021.md) under the [capture contract](diagnostic-identity-evidence-capture-contract-20261021.md) and [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md).

It is tests only. No source changed. The existing suites are byte-unchanged: the oracle, erasure, binding and worker artifact suites. The writer did not run the 9 identity evidence HTTP cases; the later parent classification below records their hosted result.

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
