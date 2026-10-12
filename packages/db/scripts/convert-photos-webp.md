# Convert stored photos to WebP

Run staging first. Preserve database/object backups through production read-back and native upload verification. Do not reseed either environment. The parent rollout owns live operations under issue #823 and ADR-0096.

## Pause and drain

Set `PHOTO_CONVERSION_MAINTENANCE=true` on both API and worker, then redeploy both. API starts only a dependency-free listener with no application routes or Socket.IO. `/healthz` returns 200 and identifies photo-conversion maintenance. `/readyz` returns 200 with `status: "maintenance"` and `businessReady: false`, so Railway's existing readiness-path deployment check admits the replacement. This is not normal business readiness. Every business request returns 503. Worker starts no Nest/Bull consumers and stays alive for operator SSH.

Wait until every prior API/worker instance stops and old requests/jobs drain. Confirm the API maintenance response and worker's "no queue consumers started" boot log. Wait **600 seconds after the last old API instance stops**, expiring every issued photo presign. Listing feature flags alone cannot stop chat/profile writes. Run commands over SSH inside the alive API container or an isolated runner using the same private service connections. Admin's mutations also stop because its API returns 503.

Normal startup remains unchanged when the flag is absent or `false`. Restore both services by removing it or setting it to `false`, then redeploying.

## Inventory and apply

The script reads `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, and optional `MINIO_REGION`. Keep each environment's plan and journal in protected persistent operator storage or transfer them there before redeploying. They contain private snapshot/reference data, use mode 0600, and contain no credentials. A fingerprint binds the plan to its database; it also pins the storage endpoint.

```sh
pnpm --filter @auto-tm/db exec tsx scripts/convert-photos-webp.ts dry-run /protected/staging-photos.json
PHOTO_CONVERSION_WRITERS_PAUSED=yes pnpm --filter @auto-tm/db exec tsx scripts/convert-photos-webp.ts apply /protected/staging-photos.json
PHOTO_CONVERSION_WRITERS_PAUSED=yes pnpm --filter @auto-tm/db exec tsx scripts/convert-photos-webp.ts verify /protected/staging-photos.json
```

The assertion `PHOTO_CONVERSION_WRITERS_PAUSED=yes` confirms the deployment/drain/expiry steps; it does not stop any service. Inventory never writes storage or database rows. Apply, placeholder retirement and deletion first probe each bucket on a throwaway key: both conditional PUT refusals (`If-Match` and `If-None-Match: *`) must answer 412, and the tombstone delete below must work on the probe key. They refuse versioned buckets. It regenerates derivatives from originals, including existing WebP originals, with natural detail/fullscreen proportions and metadata removal, without trimming black edges or vehicle pixels. Adopted/referenced empty photos and corrupt images stop conversion. Proven expired, unadopted zero-byte presign placeholders require the retirement phase below; they are never accepted as converted photos.

Read-back validates WebP bytes, metadata removal and SHA-256 digests. Prepared/written journal entries recover interrupted writes. Original ETags and conditional writes stop object races. Database updates lock each affected row and compare its complete prior selected-column state before committing a transaction. Conflicts stop the transaction. IDs, ownership, dates, order, Message bodies and unrelated data remain unchanged. Selected live fields include Listing media/posters, profiles, chat metadata, draft payloads, upload/cleanup manifests, report snapshots and notification data. AuditLog records and their before/after snapshots are immutable history: inventory reports their JPEG reference count but never updates them. Completed upload/cleanup tombstones also remain unchanged. Those historical identifiers do not block deletion of replaced live photos.

After interruption keep the same plan/journal and rerun its phase. Do not delete JPEGs manually. Repair missing/corrupt originals with an approved source before a fresh inventory. Never seed to repair conversion.

## Retire expired placeholders before applying

Dry-run reports separate upload/chat placeholder counts. If either count is nonzero, do not apply that plan: the converter refuses it. While **both API and worker remain paused**, run:

```sh
PHOTO_CONVERSION_WRITERS_PAUSED=yes pnpm --filter @auto-tm/db exec tsx scripts/convert-photos-webp.ts retire-placeholders /protected/staging-photos.json
```

Listing/Profile placeholders qualify only with an exact issued conditional-v1 manifest (five WebP keys or the historical nine keys), AVAILABLE state, no claim or adopter, no live reference, and zero-byte/no-store objects with unchanged ETags older than 600 seconds. Retirement locks/rechecks provenance and creates the existing PENDING cleanup ledger without changing IDs. Unexpired, adopted, referenced, missing or nonzero members fail closed. An orphan chat placeholder additionally needs an existing Conversation and the exact issued namespace; deletion rechecks references and goes through the tombstone delete at its pinned ETag. The journal makes interrupted retirement safe to rerun.

Keep API paused. Restore **only the worker**, allowing its normal authorized fenced cleanup to remove retired manifests. Confirm each planned MediaUpload reaches DELETED, each matching cleanup reaches DONE and its objects are absent. Pause the worker again, redeploy and wait for every prior consumer/job to stop. Take a **fresh dry-run plan at a new filename**; the retirement plan cannot be applied. The new inventory must report zero unresolved placeholders before apply. Never manually delete a referenced image or accept an empty object as WebP. If cleanup cannot complete, keep JPEGs and resolve the failure before conversion.

## Verify real clients before deletion

1. Restore API/worker. Keep all JPEG objects. Check normal `/readyz` reports `ready` and the deployed code matches the reviewed commit. Deploy the matching admin code before JPEG deletion; profile moderation serves WebP thumbnails.
2. Enumerate every Listing and load every image/variant returned by `GET /api/v1/listings/:id`. Verify `.webp` URLs and decodable WebP bytes, with detail/fullscreen proportions within one pixel of each original. Verify chat attachments, live report snapshots and profiles through their normal endpoints; compare immutable audit records with the database backup. Derivative URLs carry the shared `?v=webp-natural-1` cache version: storage paths and upload ownership keys stay unchanged, while Expo’s URI cache key and HTTP cache distinguish formerly immutable padded derivatives. Read the public versioned URLs and confirm they resolve to the regenerated bytes, even for a photo whose old WebP URI was previously cached. Original URLs do not need a derivative cache suffix. Upload Listing, chat and Profile Photos on the existing SDK55 iOS and Android dev clients and confirm no JPEG object is written.
3. Pause both services again, confirm maintenance health/boot evidence, drain all old instances/jobs and wait another **600 seconds after the last old API instance stops**. This second pause is mandatory even if the first conversion had no placeholders. Run the saved plan's `verify`. New normal traffic may have changed a planned photo/reference; if verification detects a change, **stop deletion**, retain old JPEGs, and inventory/apply/verify the current state with another plan.
4. After successful real API/native proof and paused verification:

```sh
PHOTO_CONVERSION_WRITERS_PAUSED=yes pnpm --filter @auto-tm/db exec tsx scripts/convert-photos-webp.ts delete-jpeg /protected/staging-photos.json
```

Deletion checks every replacement and updated row again, refuses remaining mapped JPEG references, then removes each old JPEG through the tombstone delete at its inventoried ETag. Final inventory requires zero JPEG objects in both photo buckets. Reruns skip journaled deletions and verify the replacements again.

## Tombstone delete

MinIO honours `If-Match` on PUT but ignores it on DeleteObject (verified in the pinned build, `RELEASE.2026-09-22T19-25-18Z`). So the converter never relies on a conditional delete. Each JPEG and chat-placeholder delete does four things:

1. It PUTs a tombstone (`application/x-carberk-conversion-tombstone`, a body naming the key plus a random nonce) with `If-Match` on the planned ETag. A changed object answers 412, and deletion stops with `Source changed before deletion`.
2. It journals the tombstone.
3. It deletes the key with a plain DeleteObject.
4. It reads back to confirm the key is gone.

On a rerun, a key holding the converter's journaled tombstone proceeds to deletion. A missing key whose journal records that tombstone counts as deleted. A key that is missing without the converter's tombstone, or that holds anything else, stops deletion.

Between the tombstone PUT and the delete, only the pause protects the key, which is why both phases need the pause and drain above. The converter cannot detect a stopped service: `PHOTO_CONVERSION_WRITERS_PAUSED=yes` only records that the operator completed those steps. Never run `retire-placeholders` or `delete-jpeg` while any API or worker instance can write photo objects.

Restore API/worker and repeat representative health/image checks. Keep backup, plan and journal. Production uses separate backups and a separate plan after staging passes. The matching Android EAS cloud release is prepared by the parent rollout; no local release build or store submission is included.
