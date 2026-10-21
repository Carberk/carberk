# Full-v3 ordinary media source handoff, 2026-10-21

This checkpoint resumes the stopped #901 source attempt from parent `3726d219a8d015f7cfb02e79a1ff72f399510edc`. The reservation branch is `agent/issue-901-v3-media-source-sol-20261021`. No integration push, issue mutation, PR, staging run, service run, agent or reviewer was used.

The source is limited to `scripts/staging-campaign.mjs`, `scripts/staging-remote.mjs`, the existing CampaignFullV3 child-process bridge, its root unit test, and this note. The v1 and v2 generated SQL and receipts remain byte-identical to `/tmp/i901/base.json`; the capture command and comparison are recorded in the handoff.

The v3 journal now records `media_uploads` and `listing_media`. It accepts only an active synthetic admitted business, a current owner or sales member, a conditional-v1 WebP image, the exact `pending/<uuid-v4>/original.webp` plus four variant manifest, and an adopted listing-media row whose upload, listing, key, business and current journal hashes agree. Draft payloads, publish details, business contact, audit rows, attach and Sales removal are checked against stored rows and the current candidate. Foreign upload IDs, directories, drafts, media, profile-photo keys and current-member changes remain barriers.

Reset writes an exact-key object ledger and its hash in the same transaction that commits `cleaning`. It calls a serialized child only after that transaction. The child requires explicit `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`, fixed `listing-photos`, an unversioned bucket, complete five-key directories, ten-second request bounds and exact HEAD absence. It performs no network operation under the database lock. A failed or partial delete leaves `cleaning` without a receipt. Finalization marks ledger keys absent and `disposed`; a terminal retry performs HEAD only and rejects resurrection. The manifest is bounded at 640 keys and never lists a bucket or prefix.

The only harness change forwards the disposable CI MinIO credentials explicitly in the existing `process.execPath` bridge, using `minioadmin` values from `infra/compose/docker-compose.ci.yml`. The deployed remote path forwards the service environment unchanged and has no credential default. The parent still validates the Railway media and public-media origins.

Known limits remain the accepted ADR-0088 scope: late orphan placeholders, legacy or personal uploads, video, operator conversion scripts and a producer racing outside the conditional writer fence are not claimed by this source slice. Worker stranded-claim recovery remains admissible without a live member, while an owned `PREPARING` upload blocks reset.

Offline checks run on this checkpoint:

- `node --check scripts/staging-campaign.mjs`
- `node --check scripts/staging-remote.mjs`
- `node --test scripts/staging-campaign.test.mjs`
- `node /tmp/i901/capture.mjs "$PWD" > /tmp/i901/sol-head.json`
- `diff -u /tmp/i901/sol-base.json /tmp/i901/sol-head.json` (no output)

No local Docker, database, MinIO, Railway, CI dispatch or hosted run was performed.
