# ADR-0079: Server-recorded upload provenance for Listing media

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: AutoTM founder, who chose the ownership model on [#536](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/536) on 2026-10-02 (recorded by the queue orchestrator). The migration, legacy rule and error contract below are the implementer's design, reviewed in PR #546.
- **Amends**: [ADR-0008](0008-media.md)'s upload path (step 4, "client confirms upload"), which assumed a key the client sends is a key the client uploaded. The rest of ADR-0008 stays in force.
- **Scope**: Listing photo and video uploads, publication, attachment and removal. Brand logos ([ADR-0072](0072-imported-logo-cleanup-coordination.md)) and chat attachments are separate flows and unchanged.

## Context

An authenticated User could attach a media key that another User's Listing already uses. Listing detail is public and returns each media key, so keys are not secrets. Attaching worked because `AttachMedia` and `PublishListing` checked that the Listing or draft belonged to the caller, never that the object did. Removing the attached row then deleted the original and every derivative under that key's directory, which belonged to someone else.

Presign (`POST /api/v1/uploads/presign`) generated `pending/<uuid>/original.<ext>` and forgot who asked for it. Nothing recorded an owner, so no later step could check one. A user-controlled path prefix would not help, and hiding keys from responses would not be authorization.

## Decision

**Presign records an upload, and only a recorded upload can be adopted.** A key alone authorizes nothing.

### The record

A `MediaUpload` row (table `media_uploads`) is created by presign, before the URL is returned:

| Field | Meaning |
|---|---|
| `id` | Upload identity |
| `userId` | The User who presigned. Immutable. |
| `key` | The server-generated object key. Unique. |
| `kind`, `contentType`, `sizeBytes` | What presign allowed, using the existing caps (image 5 MB, `image/jpeg` or `image/webp`; video 10 MB, `video/mp4`) |

A `ListingMedia` row adopts an upload through `listing_media.uploadId`, which is unique. One upload backs at most one media row, enforced by the database.

### Binding to a target

The upload is bound to the User at presign and to a Listing at adoption, in one database write. The presign request carries no Listing or draft today, and the mobile transport sends none, so the contract stays unchanged. A draft stores only key strings, and its owner is the only User who can publish it, so the draft is not a separate target: publication adopts the draft's uploads for the new Listing. Binding at adoption is as strong as binding at presign for security. The record already fixes the only User allowed to adopt, and the unique link fixes the single Listing.

### Adoption (publish and attach)

`UploadAdoptionGuard` runs before either write. For each key it requires a recorded upload that

1. belongs to the caller (`userId`),
2. has the expected kind (publication: image; attach: the request's kind; a video poster: image), and
3. still has a matching object in storage: it exists, its content type equals the recorded one, and its size is between 1 byte and the kind's cap.

Unknown, forged, another User's and wrong-kind keys return the same `400 UPLOAD_NOT_AVAILABLE`, so the response does not reveal whether a key exists. A missing or mismatched object returns `400 UPLOAD_OBJECT_INVALID`. An upload that already backs a row returns `409 UPLOAD_ALREADY_ATTACHED`, except that repeating an attach on the same Listing returns the existing media row (idempotent retry). Storage is asked only after every key is proven to be the caller's.

Publication writes the Listing, its media rows (with `uploadId`) and the draft deletion in one transaction. If the unique link rejects it because a concurrent adoption won, nothing is published and the caller gets `409 UPLOAD_ALREADY_ATTACHED`.

### Removal

Removing a media row deletes the row and its upload in one transaction. Only the caller whose transaction deleted an adopted upload receives a storage key to clean up, and only when no other media row still references that key. A row without an upload never yields a key. The cleanup deletes under that key's own directory, which presign created and only this upload ever used. Re-attaching a removed upload is impossible because its record is gone. Two concurrent removals delete storage objects once, and the second gets `404`.

Cleanup stays best effort after the commit, as before. A failed delete leaves orphaned objects, never someone else's deleted ones.

### Existing rows

Media that existed before this decision has no upload. The migration (`20261002120000_add_media_uploads`) backfills it:

- For each distinct key, the **oldest** `listing_media` row (by `createdAt`, then `id`) becomes the owner. Its upload belongs to that Listing's seller, reuses the media row's id as the upload id, and takes its content type from the key extension. `sizeBytes` is null because it is unknown.
- Any **later** row with the same key is a duplicate, which only the attack in Context could have produced. It keeps `uploadId = NULL`. Removing it deletes the row and no storage objects.

So legitimate existing media keeps working and can be removed with cleanup, and removing a duplicate cannot delete the original owner's object. This is the safe legacy rule: a row without provenance never authorizes a storage delete. The migration does not delete or rewrite any media row and touches no storage. If the oldest owner of a duplicated key was the attacker, the victim's own row loses cleanup instead (a leaked object, not a deleted one). The migration cannot tell which side was legitimate, and the audit did not find production exposure. Repairing such rows is out of scope.

### Deliberately unchanged

- The mobile transport and the media contract. Requests and responses are the same. Only the error codes `UPLOAD_NOT_AVAILABLE`, `UPLOAD_ALREADY_ATTACHED` and `UPLOAD_OBJECT_INVALID` are added to `ListingsErrorCode`. The returned media `id` is the one #537 relies on, and a retried attach now returns the same `id` instead of creating a second row.
- Public Listing detail still returns media keys. This decision makes them harmless rather than hiding them.
- Content classification, orphan sweeping, video processing, expiry of unattached uploads and production data cleanup remain out of scope.

## Consequences

### Positive

- A known, guessed or copied key cannot be published, attached or deleted by anyone but the User who presigned it.
- Duplicate ownership is impossible by constraint, not by check ordering. Concurrent attach, publish and remove cannot make two rows share an upload or let a remove delete another row's objects.
- Attach and publish now validate the stored object at the trusted boundary instead of failing later in variant generation.

### Negative / accepted costs

- `media_uploads` grows by one row per presign. Unattached uploads stay until a later cleanup job. Presign is still unthrottled, so a User can create rows without uploading. That is the existing orphan-object problem plus a small row each.
- Publish and attach make one storage `HEAD` request per photo. Publication sends them in parallel.
- Every e2e suite that publishes a draft now has to record uploads for its photos (`seedPresignedPhotos`).
- A retried attach that races a removal of the same media can return the row just before it disappears. The safety guarantee still holds, and the next read shows the true state.
- Legacy rows from a pre-fix duplicate get no cleanup, so their objects can leak.

### Neutral

- `PublishListing` still writes through `PrismaService` as before. This change adds the unique link to that transaction rather than restructuring it.

## Alternatives considered

- **Parent-Listing ownership only.** Rejected: the attack uses the caller's own Listing and a foreign key, so this is the failure being fixed.
- **Check at attach whether any other row uses the key.** Rejected: it leaves forged keys that nobody uses yet, and its check-then-write race needs the unique link anyway.
- **Signed key or opaque token returned by presign.** Rejected: it adds a secret and expiry scheme where a database row already gives revocation and single use. It also changes the client contract.
- **Per-User object prefixes.** Rejected: the audit showed a path prefix alone does not prove ownership.
- **Bind the Listing or draft at presign.** Deferred: it needs additive request fields the mobile client does not send, and adds no safety over User binding plus a unique adoption link. It can be added later without a migration.

## References

- Issue [#536](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/536); audit [source chain](../research/2026-10-02-autotm-code-findings.md) and [evidence](../research/evidence/workflow-review-2026-10-02/README.md)
- [ADR-0004](0004-migrations.md), [ADR-0008](0008-media.md), [ADR-0024](0024-owner-post-publish-photo-editing.md), [ADR-0025](0025-edit-save-atomicity.md)
- [Listings CONTEXT](../../apps/api/src/modules/listings/CONTEXT.md)
