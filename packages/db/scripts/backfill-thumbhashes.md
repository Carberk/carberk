# Backfill photo ThumbHashes

Issue #824. The root runs this on staging first, then on production after staging passes. Run it only after the [WebP conversion](convert-photos-webp.md) has finished in that environment, including its paused `verify` and `delete-jpeg`. Do not reseed either environment.

## What it does

It fills the ThumbHash of every photo that has none:

- each image `listing_media` row whose `thumbHash` is null;
- each image Message that is not deleted and has no `metadata.thumbHash`;
- each Listing-reference (post_ref) Message that is not deleted and has no `metadata.coverThumbHash`, when its `coverMediaKey` is a photo of the referenced Listing. It takes that photo's hash after the photo pass. A video cover has no hash and is skipped.

It reads the stored WebP original (`listing-photos/<key>` or `chat-attachments/<key>`) and hashes a 100 px downscale. The encoding is the API's: `thumbhash@0.1.1`, standard padded base64, 17 to 25 bytes.

Each write is conditional on the row still holding the same key and no hash. An existing hash, a hash the API wrote meanwhile, or a changed row is never overwritten. Videos, Profile Photos and deleted Messages are left alone. No object is written.

It needs no maintenance pause. The deployed API already hashes every new photo, so deploy the API with #824 before running it. A photo published during the run either gets its hash from the API or is filled by a rerun.

## Refusal

`apply` and `verify` refuse while the WebP conversion is incomplete. That means any of these remains:

- a `listing_media` key or poster key ending in `.jpg` or `.jpeg`;
- a Message metadata value naming one;
- a User avatar key or URL naming one;
- any JPEG object in `listing-photos` or `chat-attachments`.

The converter deletes JPEG objects only after its own `verify` passes. So an empty JPEG inventory, with no JPEG reference left, shows that the conversion was verified. `dry-run` reports whether apply would refuse.

## Commands

The script reads `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, and optionally `MINIO_REGION`. Run it over SSH inside the API container, or from an isolated runner on the same private service connections.

```sh
pnpm --filter @auto-tm/db exec tsx scripts/backfill-thumbhashes.ts dry-run
pnpm --filter @auto-tm/db exec tsx scripts/backfill-thumbhashes.ts apply
pnpm --filter @auto-tm/db exec tsx scripts/backfill-thumbhashes.ts verify
```

- **`dry-run`** writes nothing. It prints how many Listing photos, image Messages and Listing-reference Messages need a hash, and whether apply would refuse.
- **`apply`** fills every missing hash it can. When an original cannot be read, it first rechecks the row. If the row or Message was deleted during the run, or no longer names that key, it is skipped and counted in the summary, not reported. Otherwise apply finishes the other rows, then fails listing each row whose original is missing or not a decodable image, with its bucket and key. Rerun `apply` once first: a listing that remains is real repair work. Repair the original from an approved source, then rerun; never reseed.
- **`verify`** fails while any image Listing photo, live image Message or fillable Listing-reference cover lacks a hash, or while any stored hash is not standard padded base64 of 17 to 25 bytes.

Reruns are safe: `apply` on a complete environment writes nothing.

## After verify

On the environment, open a Listing's detail with `GET /api/v1/listings/:id` and check:

- each photo carries `thumbHash`;
- a feed page carries `photoThumbHashes` and `galleryThumbHashes` parallel to its keys;
- a Conversation's image Messages carry `metadata.thumbHash`;
- its Listing-reference Messages with a photo cover carry `metadata.coverThumbHash`.

The founder's Android session then confirms the blurred previews on a throttled connection.
