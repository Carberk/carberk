# NP-4: generator PUT held across recovery and cleanup (#901, #886, #890, #891)

Base `c1039d6839a5cd19a1a84b9e4e54933bb3d26efe` (local `agent/release897-resume-assembly-20261021`, not yet integrated on origin). Branch `agent/issue-901-media-product-races-20261021`, fast-forwarded from `a43ee64e`. This is a test-only characterization for PR #904. It is not a RED. No source, schema, staging, `cf_*` reset, journal or operator SQL is involved.

## Contract

These are rows 33 and 34 of the [prelaunch clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) (NP-4). The product invariant has to hold without the operator's exact reset timing. While a conditional generator PUT is in flight, claim-deadline recovery and cleanup run to completion. When the request is released, it is refused and no bytes come back. Another account's adopted stock is unaffected.

## Proof

Two new cases in `apps/worker/src/jobs/CleanRetiredUploads.e2e.spec.ts`, against the hosted Postgres and pinned MinIO only:

- **NP-4 publish.** The claim target is a Listing that does not exist yet. One real PUT is started, shaped like the generator's variant write (`ConditionalImageStorage`: HEAD for the ETag, then `PutObject` with `IfMatch` and `CacheControl: no-store`). It carries the product's own `AbortSignal.timeout(10_000)`, as `ConditionalImageStorage` does, with no raised timeout, retry or concurrency. Its first bytes are consumed by the HTTP request, and the rest waits on a gate. Both checks below run while the request is still unsettled:
  - The deadline sweep releases the claim to `AVAILABLE`, with no cleanup row and all 5 objects kept.
  - A fixture transition, `prepareRetiredForCleanup`, then puts the AVAILABLE upload into the state the API's retirement leaves for the worker: `RETIRED`, with the exact manifest as `PENDING` work. It is not the API route and proves no API retirement behavior. The sweep then reaches `DONE`/`DELETED`, and every key answers 404.

  After release, the PUT's own status is 404, 409 or 412, and the keys stay absent. An aborted PUT reports `aborted`, which fails this assertion; it is never accepted as a refusal. The foreign stock is unchanged: its own User, its active Listing with that User as seller, its Listing media row, the upload (`ADOPTED`, that owner, claim on that Listing), no cleanup work, and byte-identical objects.
- **NP-4 attach.** The claim targets an existing Listing, with the same held PUT. Production `retireExpiredPreparations` runs alone first and gives `RETIRED`: claim cleared, target kept, work `PENDING` with the exact 5-key manifest, bytes present. The sweep then reaches `DONE`/`DELETED` and the keys are absent. Release gives the same refusal, with no resurrection and foreign stock intact.

Each case releases and drains its PUT in `finally`, so a failed assertion still surfaces. The PUT's own abort signal bounds its started, released and failed paths to the 10 s request budget; the 40 s test timeout is not that bound. So recovery, cleanup and probes must all finish inside the PUT's 10 s, or the case fails as `aborted`. Probes made while the PUT is held use the same budget. The objects, including the foreign account's, are deleted by the suite's existing `afterAll`. The rows are deleted by the existing `afterEach`, now scoped to exactly this suite's two User ids.

API retirement authorization is proven separately, against the real `PrismaUploadClaims.retireUnclaimed`, in `apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.e2e.spec.ts:432-475`. Those tests cover refusing another User's upload and existing Listing/Profile adopters under the lock, holding the row lock during reinspection, and retiring AVAILABLE but never adopted or held uploads. The worker cannot import the API, and no shared retirement seam exists. This slice changes no source to create one.

Existing coverage is reused unchanged: `:217`/`:243` (late PUT after cleanup, publish release with no work), `:173`/`:468` (storage outage keeps PENDING work, 60 s first backoff doubling to the 6 h cap, retry reaches DONE), `:199` (crash and restart).

## Verification

Run offline from `apps/worker`, after building workspace dependencies with a placeholder, unreachable `DATABASE_URL` so Prisma generates: `pnpm typecheck`, `pnpm lint`, and `pnpm exec vitest run src/jobs/CleanRetiredUploads.e2e.spec.ts`. The vitest run collects 23 tests, all skipped because no hosted services are present. None of them passed. No services were run locally, and there is no live or hosted pass. The hosted run is `pnpm --filter @auto-tm/worker exec vitest run src/jobs/CleanRetiredUploads.e2e.spec.ts`, with the CI services that `scripts/ci-services.sh` starts.

## Assumptions and gap

- **Main risk, unproven offline.** The pinned MinIO (`RELEASE.2026-09-22T19-25-18Z`) might take the object namespace lock at a conditional PUT's precondition check and hold it while the body streams. In that case cleanup's DELETE and the probe HEADs would wait behind the held PUT, and the PUT itself would abort at its 10 s budget. The cases would then fail on `deleted: 1`, a probe abort or an `aborted` outcome. That would mean the store serializes the race; it would not by itself show a product defect. The root then decides whether the invariant becomes "no DONE while a PUT is in flight" and whether source changes.
- "Held at the transport boundary" means only that the client's HTTP request read the first body bytes from the stream. That does not establish that MinIO received them, or that MinIO has started evaluating the request. The ordering of MinIO's own precondition check relative to cleanup is not observed.
- Publish retirement is a fixture transition, not API behavior. Its `nextAttemptAt` is set to the suite's year-2000 clock instead of the database default.
- The S3 outage path is covered by the unchanged tests at `:173`/`:468`, not inside the held race.
