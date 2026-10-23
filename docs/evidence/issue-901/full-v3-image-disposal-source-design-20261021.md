# Full-v3 joined media case: image disposal source design, 2026-10-21

Design sub-agent for #901 under #897 and PR #904. Base `0101654de40ecaceae0254bb5ded01591db7968e`. Branch `agent/issue-901-v3-media-disposal-design-20261021` was reserved and pushed at that base before this note. Only this note changed: no source, test, config, schema, service, CI or staging operation; no agent or reviewer. Inputs are root's D1–D5 ([disposition](../issue-897/support-assembly-and-media-disposition-20261021.md)), the [test note](full-v3-media-publication-test-20261021.md) and the last case of `CampaignFullV3.e2e.spec.ts`. Source is authorized only after the actual hosted RED.

Labels: **[V]** source or document fact checked here; **[C]** candidate design; **[U]** runtime behavior not proven.

## Decisions in one place

1. **[C] Source footprint is `scripts/` only.** API presign, publish, attach, member removal, the worker and the e2e harness stay unchanged. Every change sits behind `bootstrapV3`.
2. **[C] No ETag-conditional DeleteObject.** Use ADR-0088's existing fence: a plain `DeleteObject`, a HEAD 404 for every manifest key, and producers that write only with `If-Match`.
3. **[C] Provenance lives in a new namespace ledger,** `cf_<id>.campaign_object_ledger`. It is written in the same transaction that commits `cleaning`, before any object or row is deleted.
4. **[C] Reset becomes four steps:** A `cleaning` + ledger → B delete objects and verify absence → C delete rows + `disposed`. The terminal path only observes.
5. **[V] The harness needs no adaptation.** `execute` already routes every `process.execPath` child to the lane env, with cwd `apps/api`.

## 1. Journal: tables, edges, transitions and guards

**[V] facts the design depends on:**
- `media_uploads` is owned through `userId → users` and `businessId → dealerships`. `listing_media` is owned through `listingId → listings`. `uploadId` is not a `parents` edge.
- Publish order: `finalize` (→ `ADOPTED`) runs before `listing.create`, then `listingMedia.create` (`PublishListing.ts:337-389`). So the target Listing does not exist yet when the upload row turns `ADOPTED`.
- Attach also finalizes before it creates the media row (`PrismaListingMediaRepository.ts:48-63`).
- `reserve` refuses another business's upload before any update (`PrismaUploadClaims.ts:63`).

**[C] v3 additions:**
- Push `media_uploads` and `listing_media` onto `tables`.
- Add `uploadId: 'media_uploads'` to a v3-only parents map, so the v2 `parents` JSON stays byte-identical.
- Add the delete order `… listing_drafts, listing_media, listings, media_uploads, dealership_invitations …`. `listing_media.uploadId` is `NoAction` and `businessId` is `Restrict`.

| Row and operation (`identities` lifecycle) | Allowed only if (otherwise `Unsupported campaign media`) |
|---|---|
| `media_uploads` INSERT | Protocol and type: `writeProtocol='conditional-v1'`, `kind='image'`, `contentType='image/webp'`, `sizeBytes` 1–5 MiB, `state='AVAILABLE'`, all claim fields and `retiredAt` null.<br>Key and manifest: key `^pending/<uuidv4>/original\.webp$`; `objectKeys` exactly the five `deletionDirectory` webp keys, with no duplicates.<br>Business: `businessId` non-null, not the root, an owned active synthetic Dealership; `userId` an active journaled owner/sales member of it (the `draftContext` predicate).<br>Collision: no `listing_media.key`/`posterKey` or `users.avatarKey` already under that directory, else `Campaign media collision`. |
| UPDATE `AVAILABLE→PREPARING` | Only `state`, `claim*` change. `claimTargetType='listing'`, token and deadline non-null. Target is either an owned Listing with the same `businessId` (attach) or an id absent from `public.listings` (publish). |
| UPDATE `PREPARING→ADOPTED` | Only `state`, `claimToken`, `claimDeadline` change, both to null. Target unchanged. |
| UPDATE `PREPARING→AVAILABLE` and `PREPARING→RETIRED` | Exactly what `retireExpiredPreparations` writes: deadline passed, token cleared. **Required for liveness.** That statement runs before the worker's per-item `try` (`CleanRetiredUploads.ts:39`). If the guard refused it, the global stranded-claim sweep would fail every run. |
| UPDATE `RETIRED→DELETED` | The worker's `complete` write, nothing else. |
| `listing_media` INSERT | Upload and Listing: `uploadId` owned and non-null; upload `ADOPTED`, `claimTargetType='listing'`, `claimTargetId=listingId`, `key=upload.key`; `upload.businessId = listing.businessId`.<br>Media fields: `kind='image'`, `posterKey` and `durationMs` null. |
| `listings` INSERT | Business and seller: `businessId` an owned active synthetic non-root Dealership; `sellerId = lastEditedById`, an active journaled owner/sales member.<br>Contact: `contactPhone` is the reservation phone and equals that business's confirmed `contactPhone` (`contactConfirmedAt` non-null). No video (existing rule). |
| `listing_drafts` (business) | The proven context, plus a full publishable payload: exactly the case's contract keys, `media`/`validatedSteps` still `[]`.<br>Each `photos[]` is exactly `{photoId uuid, key, sortOrder int}`; each key is an owned `AVAILABLE` upload of the same business.<br>`contactPhone` is the reservation phone. |
| `audit_logs` `listing.published` | INSERT; `targetType='Listing'`, target an owned Listing; `actorId = sellerId`. `details` is exactly `{brandId, modelId, cityId, priceAmount, priceCurrency}`, equal to the Listing row. |
| `dealership_members` DELETE | `role='sales'` in an owned admitted non-root business, prior row journaled. |
| `audit_logs` `BUSINESS_MEMBERSHIP_CHANGED` remove | `details={targetUserId, action:'remove'}`; the actor is an active owner; the target has a journaled redeemed sales invitation there and no live membership; exactly one such audit per business and target. |

Everything else on the two media tables is refused in `identities` and is out of this case. That covers `abandon`, `release`, `settle`, `retireUnclaimed`, `ADOPTED→RETIRED`, `listing_media` UPDATE/DELETE, legacy or personal uploads and null `uploadId`. Refusing them affects only that campaign user's request. A stranded claim still recovers through the allowed worker transition.

**Ownership is a union of old and new.** It holds when either `v_row` or `prior` has an owned edge (the existing loop). `immutable` already freezes `id`, `userId`, `businessId` and `listingId`. Each media guard also requires `v_row - state - claim* = prior - state - claim*`, which freezes `key`, `objectKeys`, protocol, kind and size.

**Phone clauses: two places need a v3 exception.** For an owned `listings` row of the SMS-bound business with its confirmed phone:
- `phoneGuard` (the `dealerships`/`listings` branch);
- `smsInventory`'s `EXISTS(listings.contactPhone=…)`.

Without these, the publish predicted to RED fails with `Campaign phone collision`.

**Integrity and preflight additions:**
- Every owned `ADOPTED` upload has exactly one owned `listing_media` row with its id.
- The count of deleted non-root sales member records equals the count of remove audits.
- Reset refuses, with no mutation:
  - an owned `PREPARING` upload (`Campaign media claim in flight`, retryable);
  - any non-owned `media_uploads`, `listing_media`, `listing_drafts` payload or `users.avatar*` that references an owned upload id or directory (`Foreign campaign media reference`).
- Incoming FKs to the two new tables are inventoried automatically by the existing loop.

## 2. Arithmetic

Every step below matches the test literals. **[V]** Each step was derived from the source transaction order.

| Step | Records / events | Source |
|---|---|---|
| Presign ×3 | +3 / +3 | One INSERT each |
| Publish | +5 / +12 | 3 uploads × 2 UPDATEs + Listing + 3 media + draft DELETE + audit |
| Fourth presign | +1 / +1 | INSERT |
| Attach | +1 / +3 | 2 upload UPDATEs + media INSERT |
| Removal | +1 / +2 | Member DELETE (version 2), then audit INSERT (`PrismaBusinessRepository.ts:113-115`) |
| c1 reset | 76 / 103 → 76 / 177 | 74 live rows: 9 redaction UPDATEs, 65 DELETEs |
| c2 reset | 66 / 87 → 66 / 152 | 65 live rows: 6 UPDATEs, 59 DELETEs |

**[V]** Ledger rows and `object_hash` are not `campaign_records` or `campaign_events`, so 76/177 and 66/152 stay exact. The caps of 128 records and 2048 events still bound the journal. The ledger is bounded at 5 × owned uploads, at most 640 rows, and the child refuses more keys. `mediaDisposed` and `digest` read the manifest, records and events only. `digest` sees `object_hash` only through the manifest, and only the c1 reset writes it, so the `refused` digests are unaffected.

**[U]** Whether publish or removal also touches `measurement_state`. The baseline trigger already covers its deletes. The literals assume no extra event, and the first hosted run decides.

## 3. Object disposal

**[C] DDL, v3 setup:**

```sql
campaign_object_ledger(object_key text PRIMARY KEY CHECK (object_key ~ '^pending/<uuidv4>/(original|thumbnail|list|detail|fullscreen)\.webp$'),
  upload_id text NOT NULL, bucket text NOT NULL CHECK (bucket='listing-photos'), absent boolean NOT NULL DEFAULT false)
```

plus `campaign_manifest.object_hash text`.

| Step | Transaction | Retry behavior |
|---|---|---|
| A | Existing lock, integrity and preflight, plus the media preflight. Insert exactly the owned uploads' `objectKeys` (20 for c1, 15 for c2), set `object_hash`, then `cleaning`. | Re-entry from `cleaning` recomputes the set. It requires ledger and hash equality, else `Campaign object ledger changed`. |
| B | After `disposeDeliveries`, outside any transaction (ADR-0088 rejects network I/O under locks). `disposeObjects(ledgerKeys,false)` spawns `campaignObjectMain`. | Any failure, including a partial delete, keeps `cleaning` and gives code 1 with no receipt. The next run deletes again: deleting an absent key is idempotent. |
| C | The existing deletes, `UPDATE ledger SET absent=true`, integrity, `disposed`, in one transaction, only after B's exact stdout `{"objects":N,"absent":N}`. | A rollback leaves the objects absent, and a retry repeats A→C. |
| Terminal | Integrity, then `disposeObjects(keys,true)` (HEAD only; any 200 → `Campaign object resurrected`, code 1), then `disposeDeliveries(…,true)`. | Read-only, so the digest is unchanged. That is what the test's lost-response retry needs. |

**`campaignObjectMain`** is serialized, like `campaignQueueMain`. It repeats the `deletionDirectory` rule on purpose:
- Validate the binding and at most 640 keys, each grouped into exact five-key directories, with fixed bucket `listing-photos`.
- Require `GetBucketVersioning.Status === undefined`.
- `DeleteObject` each key. Refuse a `DeleteMarker` or `VersionId` in the response.
- HEAD each key and require 404.

This mirrors `S3RetiredObjectStore.ts`, with 10 s request timeouts. The existing 30 s child timeout is unchanged, and a timeout leaves `cleaning`.

**Attestation:**
- **[V]** `remoteMain` already requires the media and public-media origins to equal the identity origins, with no userinfo, query or hash. `staging-control` requires `http://minio.railway.internal`.
- **[C]** The child gets the same env `e` as the queue child, so it uses the API service's own `MINIO_*`, with `env.schema` defaults. It holds no new credential, and no global allow-list or listing is involved.

**Conditional delete:**
- **[V]** AWS supports `If-Match` on DeleteObject ([AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-deletes.html)). MinIO's commercial AIStor lists it ([AIStor](https://docs.min.io/aistor/developers/s3-api-compatibility/)).
- **[V]** Upstream open-source `DeleteObjectHandler` on `master` never evaluates `If-Match` ([object-handlers.go](https://github.com/minio/minio/blob/master/cmd/object-handlers.go)). `delOpts` was not inspected. A fork reports 204 on a wrong `If-Match` ([pgsty/silo#10](https://github.com/pgsty/silo/issues/10)).
- **[U]** The release behind the CI digest (ADR-0074) is unknown.

So sending `IfMatch` would give false assurance, and the design neither sends nor needs it. Conditional delete exists to protect a newer foreign version of the same key. Here, these keys are exclusive UUID directories that only conditional writers hold authority over, and absence is the goal whatever the content. `@aws-sdk/client-s3@3.1048.0` was published 2026-05-15, before the cutoff. No lookup is needed for it.

## 4. Writer fencing and late-write boundaries

| Writer | Boundary after A or B |
|---|---|
| Client original PUT (presigned for 600 s) | **[V]** The signed `If-Match` targets the placeholder ETag. Against a deleted key it fails 404/409/412. CI MinIO proof: `CleanRetiredUploads.e2e.spec.ts:217`, plus the provider probe in `ConditionalImageStorage`. |
| Variant generator | Writes only after `reserve`. **[V]** `lock` takes ShareRowExclusive on the tracked tables, so a reservation commits before A, and A then refuses it as a claim in flight, or after A and is refused by `cleaning`. An earlier generator's `If-Match` write fails once the key is gone. |
| Presign | Placeholders use `IfNoneMatch:*` only on a fresh UUID key. During `cleaning` the record INSERT fails, leaving up to 5 **orphan empty objects under an unknown key**. That is a leak, not a resurrection: it carries no authority and is cleaned without listing. This gap pre-exists. |
| Worker recovery or cleanup | Delete only, and idempotent with B. A `media_upload_cleanups` row (no FK, not owned) survives reset as provenance. Its later sweep deletes keys that are already absent. |
| Profile Photo | Refused: `Synthetic identity changed` (`avatarUploadId`). |
| `packages/db/scripts/convert-photos-webp.ts` | **Gap:** an operator script with `IfNoneMatch:*` on a missing variant could recreate a key. It is not a deployed producer, and operators must not run it during a reservation. The terminal HEAD check would report it. |

**Deferred, not claimed safe:** a late producer racing on hosted services, worker races against journaled uploads, legacy or personal uploads, video, and orphan placeholders.

## 5–6. Harness and compatibility

- **[V]** In `execute`, the `require` bridge spawns `process.execPath` children locally, with `env: process.env` and cwd `apps/api`. `@aws-sdk/client-s3` and `bullmq` are both `apps/api` dependencies. The parent still attests the synthetic Railway env. So the child reaches the lane MinIO through the same seam as the Redis queue child, with no bypass and no harness edit.
- **[V]** `source` concatenation strips `export` and the import regex, so a new export needs no harness change.
- **[U]** The CI vitest env exposes the loopback `MINIO_ENDPOINT`. The case's `SETUP` assertion proves this.
- **[C]** v1/v2: every addition is behind `bootstrapV3`, including the parents map, tables, DDL and order, so the generated SQL and receipts stay byte-identical. No receipt field changes.
- **[V]** v3 activation is closed, so no retained v3 namespace predates the new `schema_hash`.

## Bounded plan and first assertions

| Step | Files | First assertion it should turn GREEN |
|---|---|---|
| 1 | `staging-campaign.mjs`: tables, edge, INSERT guard | "presigned media_uploads row must be journal-owned by its reservation"; unit: v1/v2 SQL byte-identical |
| 2 | Draft payload clause | `post(draftsPath, sales, full payload).expect(201)` and owned `listing_drafts` |
| 3 | Claim, Listing, phone and audit clauses | Publish 201; `journal(c1,73,97)` |
| 4 | `listing_media` attach | Owned `attached.id`; fourth upload `ADOPTED` |
| 5 | Removal clauses | `journal(c1,76,103)` |
| 6 | Ledger, A/B/C/terminal; `staging-remote.mjs` `disposeObjects`; `campaignObjectMain` | "journal-owned object … absent after reset", "foreign object … preserved", retry digest equal, `journal(c2,66,152)` |
| Unit | `staging-campaign.test.mjs` | Refuse a non-manifest key; stay `cleaning` with no receipt on partial failure; terminal does HEAD only; resurrection → code 1 |

Existing tests stay byte-identical. Limits, timeouts, concurrency and caps do not change.

## Root decisions

1. Accept the recovery-transition allowance, needed for global sweep liveness.
2. Accept that the reset child reuses the API's own credentials, including schema defaults.
3. Accept the pre-existing orphan-placeholder and operator-script gaps for this case.

## Checks on this checkpoint

`git diff --check` and `pnpm check:agent-docs`. Results are recorded in the checkpoint commit message.
