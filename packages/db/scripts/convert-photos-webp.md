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

The assertion `PHOTO_CONVERSION_WRITERS_PAUSED=yes` confirms the deployment/drain/expiry steps; it does not stop any service. Inventory never writes storage or database rows. Apply probes conditional PUT/DELETE enforcement and refuses versioned buckets. It regenerates derivatives from originals with natural detail/fullscreen proportions, without trimming black edges or vehicle pixels. Empty/corrupt photos stop conversion.

Read-back validates WebP bytes, metadata removal and SHA-256 digests. Prepared/written journal entries recover interrupted writes. Original ETags and conditional writes stop object races. Database updates lock each affected row and compare its complete prior selected-column state before committing a transaction. Conflicts stop the transaction. IDs, ownership, dates, order, Message bodies and unrelated data remain unchanged. Selected fields include Listing media/posters, profiles, chat metadata, draft payloads, upload/cleanup manifests, report snapshots, notification data and audit snapshots.

After interruption keep the same plan/journal and rerun its phase. Do not delete JPEGs manually. Repair missing/corrupt originals with an approved source before a fresh inventory. Never seed to repair conversion.

## Verify real clients before deletion

1. Restore API/worker. Keep all JPEG objects. Check normal `/readyz` reports `ready` and the deployed code matches the reviewed commit. Deploy the matching admin code before JPEG deletion; profile moderation serves WebP thumbnails.
2. Enumerate every Listing and load every image/variant returned by `GET /api/v1/listings/:id`. Verify `.webp` URLs and decodable WebP bytes, with detail/fullscreen proportions within one pixel of each original. Verify chat attachments, snapshots and profiles through their normal endpoints. Upload Listing, chat and Profile Photos on the existing SDK55 iOS and Android dev clients and confirm no JPEG object is written.
3. Pause both services again, drain old instances/jobs and wait another 600 seconds. Run the saved plan's `verify`. New normal traffic may have changed a planned photo/reference; if verification detects a change, **stop deletion**, retain old JPEGs, and inventory/apply/verify the current state with another plan.
4. After successful real API/native proof and paused verification:

```sh
PHOTO_CONVERSION_WRITERS_PAUSED=yes pnpm --filter @auto-tm/db exec tsx scripts/convert-photos-webp.ts delete-jpeg /protected/staging-photos.json
```

Deletion checks every replacement and updated row again, refuses remaining mapped JPEG references, then conditionally deletes each old JPEG at its inventoried ETag. Final inventory requires zero JPEG objects in both photo buckets. Reruns skip journaled deletions and verify the replacements again.

Restore API/worker and repeat representative health/image checks. Keep backup, plan and journal. Production uses separate backups and a separate plan after staging passes. The matching Android EAS cloud release is prepared by the parent rollout; no local release build or store submission is included.
