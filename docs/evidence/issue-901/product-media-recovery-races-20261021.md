# NP-4: generator PUT held across recovery and cleanup (#901, #886, #890, #891)

Base `c1039d6839a5cd19a1a84b9e4e54933bb3d26efe` (local `agent/release897-resume-assembly-20261021`, not yet integrated on origin). Branch `agent/issue-901-media-product-races-20261021`, fast-forwarded from `a43ee64e`. This is a test-only characterization for PR #904. It is not a RED. No source, schema, staging, `cf_*` reset, journal or operator SQL is involved.

## Contract

These are rows 33 and 34 of the [prelaunch clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) (NP-4). The product invariant has to hold without the operator's exact reset timing. While a conditional generator PUT is in flight, claim-deadline recovery and cleanup run to completion. When the request is released, it is refused and no bytes come back. Foreign adopted stock is unaffected.

## Proof

Two new cases in `apps/worker/src/jobs/CleanRetiredUploads.e2e.spec.ts`, against the hosted Postgres and pinned MinIO only:

- **NP-4 publish.** The claim target is a Listing that does not exist yet. One real PUT is started, shaped like the generator's variant write (`ConditionalImageStorage`: HEAD for the ETag, then `PutObject` with `IfMatch` and `CacheControl: no-store`). Its first bytes are consumed by the HTTP request, and the rest waits on a gate. Both checks below run while the request is still unsettled:
  - The deadline sweep releases the claim to `AVAILABLE`, with no cleanup row and all 5 objects kept.
  - The upload is then retired the ordinary way, as the API's `retireUnclaimed`/`retire` does it: under the upload lock, refused unless the upload is AVAILABLE with no adopter, recording the exact manifest as `PENDING`. The sweep then reaches `DONE`/`DELETED`, and every key answers 404.

  After release, the PUT's own status is 404, 409 or 412, the keys stay absent, and the foreign stock's state, absence of work and bytes are unchanged.
- **NP-4 attach.** The claim targets an existing Listing, with the same held PUT. Production `retireExpiredPreparations` runs alone first and gives `RETIRED`: claim cleared, target kept, work `PENDING` with the exact 5-key manifest, bytes present. The sweep then reaches `DONE`/`DELETED` and the keys are absent. Release gives the same refusal, with no resurrection and foreign stock intact.

Each case releases and drains its PUT in `finally`, so a failed assertion still surfaces. Probes made while the PUT is held use the product's 10 s request budget, which is not raised. Each test's timeout is 40 s. The test's objects are deleted by the suite's existing `afterAll`, and its rows by the existing `afterEach`.

Existing coverage is reused unchanged: `:217`/`:243` (late PUT after cleanup, publish release with no work), `:173`/`:468` (storage outage keeps PENDING work, 60 s first backoff doubling to the 6 h cap, retry reaches DONE), `:199` (crash and restart).

## Verification

Run offline from `apps/worker`: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm exec vitest run src/jobs/CleanRetiredUploads.e2e.spec.ts`. The vitest run collects 23 tests, all skipped because no hosted services are present. No services were run locally. The hosted run is `pnpm --filter @auto-tm/worker exec vitest run src/jobs/CleanRetiredUploads.e2e.spec.ts`, with the CI services that `scripts/ci-services.sh` starts.

## Assumptions and gap

- **Main risk, unproven offline.** The pinned MinIO (`RELEASE.2026-09-22T19-25-18Z`) might take the object namespace lock at a conditional PUT's precondition check and hold it while the body streams. In that case cleanup's DELETE and the probe HEADs would wait behind the held PUT and fail at the 10 s budget instead of hanging. The cases would then fail on `deleted: 1` or a probe abort. That would mean the store serializes the race; it would not by itself show a product defect. The root then decides whether the invariant becomes "no DONE while a PUT is in flight" and whether source changes.
- "Held at the transport boundary" means the HTTP request consumed the first body bytes. Server-side receipt is not observed separately.
- Publish retirement repeats the API's SQL, because the worker cannot import the API module. Its `nextAttemptAt` is set to the suite's year-2000 clock instead of the database default.
- The S3 outage path is covered by the unchanged tests at `:173`/`:468`, not inside the held race.
