# Railway MinIO Contract

Sprint 11 issue #272 defines the repository-owned MinIO contract. The image and volume contract is updated by
[ADR-0074](../docs/adr/0074-digest-pinned-chainguard-minio-images.md).

## Runtime Shape

- One MinIO service per environment.
- One persistent data mount at `/data`; on Railway this must be a single
  persistent volume mounted at `/data`.
- S3 API listens on `9000`.
- Console listens on `9001` but is not exposed publicly.
- `api` and future media workers use `MINIO_ENDPOINT` over private networking
  for administrative S3 operations.
- `MINIO_PUBLIC_URL` is the public S3 API origin used only for anonymous media
  reads and presigned direct client PUT URLs.

`APP_ENV=staging|production` rejects unsafe API configs where
`MINIO_ENDPOINT` and `MINIO_PUBLIC_URL` resolve to the same host, where the
public URL is internal/private, or where production media is not HTTPS.

## Image and rollout

Use the minimal image, with no shell health probe:

```text
cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285
```

Set the service start command to `/usr/bin/minio server /data --console-address
:9001` and `RAILWAY_RUN_UID=0`. The image defaults to UID 65532; Railway volumes
are root-owned, so this documented override preserves existing volume writes.
Keep the existing volume ID and `/data` mount, root credentials, domains, and
private endpoint. The console stays private. Railway's external health check
uses `/minio/health/live` on port 9000 and needs no dev image.

After repository checks and review pass, change staging first. Record its
service, volume, image, command, and deployment ID before and after. Verify
existing object reads and a write/read/delete of a disposable verification object,
then rerun the bucket bootstrap to verify all four buckets and policies.
Do not delete or replace the volume, recursively change ownership, or edit
production during the staging rollout. The production service can retain its
previous image until an operator schedules that separate rollout; its target
image and runtime configuration are the contract above.

MinIO is AGPL-3.0-or-later; inspect the image SBOM for dependency licenses.
Pinned builds require a reviewed refresh and the runtime checks listed in
ADR-0074. See [Railway volume permissions](https://docs.railway.com/volumes#permissions).

## Buckets

The bucket set is explicit and idempotently bootstrapped by:

```sh
MINIO_ENDPOINT=http://localhost:9000 \
MINIO_ACCESS_KEY=minioadmin \
MINIO_SECRET_KEY=minioadmin \
MINIO_REGION=us-east-1 \
pnpm minio:bootstrap
```

Buckets:

- `listing-photos`
- `listing-videos`: private while Listing video rollout is held; bootstrap removes any existing bucket policy without deleting objects.
- `chat-attachments`
- `catalog-assets`: anonymous reads cover only `brands/*`, including imported `imp-<hash>-<uuid>` and admin `v<epoch-ms>-<uuid>` activation directories (legacy `imp-<hash>` and `v<n>` directories stay readable while active). Replacing, removing or deleting a logo deletes its whole activation directory, best effort ([ADR-0072](../docs/adr/0072-imported-logo-cleanup-coordination.md)); whole-prefix deletion must not be enabled until every old API logo writer and deterministic importer process has stopped. Admin uploads under `pending/` are private. Confirmation deletes them; abandoned uploads are eligible for lifecycle expiration after one day. MinIO scanning is asynchronous, so deletion can occur later than that threshold.

When a bucket is added to this list, re-run `pnpm minio:bootstrap` against each
environment's MinIO before deploying the API that uses it. Until then, requests
that write to the missing bucket fail. `catalog-assets` was added for brand logos.

Photo and chat buckets receive anonymous `s3:GetObject` only; the catalog grant is restricted to `brands/*`. The video bucket has no bucket policy, so anonymous object reads, listing and writes are refused; signed operator reads still work. Bootstrap reapplies the catalog pending-only lifecycle on every run. Re-run it in each environment before deploying this change, through the environment's authorized operator. Anonymous
`s3:PutObject` is not granted; uploads use short-lived signed PUT URLs produced
by the API.

## Backup And Restore

Backups capture object bytes, bucket policies, and a SHA-256 manifest. A private video bucket is recorded as JSON `null` in its policy file; backup refuses a video bucket with an existing policy, so reconcile it through an authorized operator first. Catalog backups must contain the scoped `brands/*` policy. Legacy whole-bucket catalog policies are rejected, so re-bootstrap before creating a new backup. Lifecycle settings are repository-owned rather than captured in the v1 manifest; restore reestablishes the one-day pending rule during bootstrap:

```sh
pnpm minio:backup /tmp/autotm-minio-backup
```

Restores are safe to rerun against isolated/non-production data. The restore
path bootstraps the bucket, reapplies the captured policy except for video, verifies every local
object checksum before upload, uploads the object, reads it back, and verifies
the restored checksum:

```sh
pnpm minio:restore /tmp/autotm-minio-backup
```

Video restore always keeps the current private policy, including for historical backups that captured an anonymous grant; their bytes and checksums are still restored. Use this checkout’s restore command for null-policy video backups; older scripts require public policies. This is a temporary serving hold, not authenticated video delivery.

Merging this repository change does not reconcile a live bucket. Staging and production bootstrap/restore remain authorized operator actions. Verify an existing anonymous video URL returns 403 after reconciliation; copies already downloaded are unaffected.

Do not run restore over production as a drill. Restore into isolated data first
and record the evidence in the deployment runbook.

## Direct upload length

Brand-logo and listing-media presigned PUTs bind the declared `sizeBytes` as `Content-Length`. Uploaders send the exact binary body; their HTTP transport supplies its length. No client-set Content-Length header is required. A different length fails signature verification before the upload is accepted. Brand confirmation still checks HEAD and downloaded byte length and validates image content. Signing length does not establish MIME type or image safety.
