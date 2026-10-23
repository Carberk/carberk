# Full-v3 conditional image producer/reset fence design, 2026-10-21

#901 design sub-agent under #897/PR #904. Base `82b18c6f`; branch `agent/issue-901-media-producer-fence-design-20261021`, reserved before editing. Only this note changed. It amends §4–5 and root decisions 2–3 of the [disposal design](full-v3-image-disposal-source-design-20261021.md). Labels: **[V]** checked, **[C]** candidate, **[U]** unproven.

## Verdict

**[V]** `presignUpload` writes five `IfNoneMatch:"*"` placeholders before `record` inserts the row, as ADR-0088 requires. A refusal or crash between them leaves unrecorded keys, so no fence in this order is complete. Recorded keys are never recreated by `initialize`, which finishes first. Reversing the order without a fence lets a paused initializer recreate deleted keys, which a final HEAD only detects.

**[C] Smallest complete fence** (product change plus an ADR-0088 amendment): a non-authorizing issuance intent; placeholder URLs whose expiry storage enforces at its deadline; authority only at activation.

## Transitions

No network I/O under DB locks. W is the window, M the margin.

| Step | Action | Fence |
|---|---|---|
| Intent | After `assertSupported`, check ownership; INSERT `ISSUING`, `claimDeadline=D=now()+W` (DB clock), exact five `objectKeys` | `key @unique` refuses collisions first. v3 journals it via user/business edges, or refuses it during `cleaning` |
| Issue | Five presigned PUTs with `If-None-Match:*`, `x-amz-meta-upload-id`, `no-store`, `expiresIn=floor(D−apiNow)≥1`. One attempt each, no SDK retry | Storage checks `X-Amz-Date+Expires`, so API clock error cancels; M bounds DB↔MinIO skew |
| Activate | Lock row; require `ISSUING`, `now()≤D`; recheck ownership; `AVAILABLE`, clear D; sign the original `If-Match` URL | Refused during `cleaning`; the only authority grant |
| Strand | Worker: `ISSUING ∧ now()>D+M` → `RETIRED`, with cleanup `ISSUANCE_PENDING` | Mirrors `retireExpiredPreparations`. v3 must allow exactly this write, for sweep liveness |
| Clean | `ISSUANCE_PENDING`, per key: 404 → skip; own tag and 0 bytes → plain `DeleteObject`, then HEAD 404; otherwise `Foreign object at issued key`, and the work waits | `PENDING` work is unchanged |

The migration adds `ISSUING` to the state check, with `ISSUING ⇒ conditional-v1 ∧ D NOT NULL ∧ claim token/target NULL`, and adds `ISSUANCE_PENDING` to the cleanup status check.

**Unfinished or crashed producers** leave an exact `ISSUING` row, never an unknown key; their URLs and activation (`UPLOAD_ISSUANCE_EXPIRED`) fail after D. Client original and generator keep `If-Match`; the worker only deletes. **[V]** `convert-photos-webp.ts:212` creates missing variants with `IfNoneMatch`; **[C]** in conditional-v1 directories allow only `If-Match` and refuse missing keys, replacing operator pause.

## Reset through the current candidate

- **A.** Existing lock, candidate, manifest and integrity checks, plus:
  - Owned `PREPARING`, or `ISSUING` with `now()≤D+M`, gives `Campaign media issuance in flight`. It is retryable and mutates nothing.
  - Every other owned upload's keys go into the ledger. Uploads that were never activated are marked `tagged`.
  - An intent INSERT racing A blocks behind ShareRowExclusive, then the trigger refuses it.
- **B.** Runs outside transactions. The child receives the reservation, candidate, profile and `object_hash`. It HEAD-checks every tagged key before deleting anything; a foreign tag stops it with nothing deleted. Then it deletes each key and HEADs for 404, and echoes `object_hash`.
- **C.** Rechecks candidate, ledger and hash equality, then deletes rows and sets `disposed`.
- **Lost response.** A rerun from `cleaning` repeats A–C. 404s are idempotent. The terminal step only HEADs, so the digest is stable.
- **Worker after reset.** The FK-less cleanup row survives; keys are absent → `DONE`; `updateMany` matches nothing, so no journal event.

**Foreign collisions** never reach deletion: a key collision fails the INSERT; a pre-existing object returns 412, stays untagged and is refused by worker and reset. Reference guards are unchanged. An unconditional foreign write between HEAD and delete remains ADR-0088's namespace-exclusivity assumption.

## Provider, credentials and harness

- **CI image:** `cgr.dev/chainguard/minio@sha256:8d5a0265…69` (ADR-0074, `docker-compose.ci.yml:36`). **[U]** The MinIO release behind it.
- **Conditional DELETE is unsupported or unknown.**
  - **[V]** On upstream master, neither `DeleteObjectHandler` nor `delOpts` reads `If-Match` or sets `CheckPrecondFn`. `delOpts` reads only force-delete, delete-marker and mtime headers.
  - The repo comment calling it ignored is untested; the design never sends it.
- **[U] Three behaviors are unproven on the CI digest:** refusal of an expired presigned PUT, presigned `If-None-Match`, and HEAD metadata. The extended probe must prove expiry with a past `signingDate` (check the SDK `^3.1048.0` option via Context7) and fail closed.
- **Credentials.**
  - **[V]** `validateSecrets` forbids the `minioadmin` default in staging/production, so deployed keys are explicit.
  - **[V]** `remoteMain` checks `APP_ENV==='staging'` and the API service ID before passing `env:e` to children.
  - **[C]** The object child sets no default. It refuses absent keys, and refuses `minioadmin` unless `APP_ENV==='test'`. Like `campaignQueueMain`, it relies on the parent's endpoint check.
- **Harness: the earlier "no adaptation" claim was wrong.**
  - **[V]** The bridge at `CampaignFullV3.e2e.spec.ts:118` gives children the test `process.env`: `APP_ENV=test`, loopback MinIO, and no keys.
  - It must pass `minioadmin` explicitly (CI `MINIO_ROOT_USER`). Deployed children cannot see `APP_ENV=test`, so no bypass.

## Hosted RED

1. **`ConditionalImageStorage.e2e`.** An expired URL returns 403 and the key stays 404. A valid URL creates the tagged key, and a replay returns 412.
2. **`PresignUpload.spec` and the presign e2e.** First RED: "issuance intent durable before any placeholder write". A failure after the intent leaves an exact `ISSUING` row and returns no key.
3. **New `CampaignFullV3` case.** A test-only provider override gates the step between Issue and Activate.
   - While the gate holds, reset returns code 1 `in flight` with both digests unchanged. Releasing it gives `AVAILABLE`.
   - When the gate throws, wait D+M. Reset then reaches all-404, no unknown key, and replayed URLs return 403.
   - A foreign PUT at the visible key before Issue makes Issue return 412. Reset then refuses, and the object stays.
4. **Worker after reset.** Sweep a stranded row, run reset, sweep again. Expect `DONE`, c1 keys 404, c2 keys 200, and an unchanged c1 terminal digest.

## Source files

- **Schema:** `schema.prisma` and one migration.
- **API (`modules/listings`):** `PresignUpload.ts`, `MediaUpload.ts`, `MediaStoragePort.ts`, `MediaUploadRepository.ts`, `PrismaMediaUploadRepository.ts`, `MinioMediaStorageAdapter.ts`, `ConditionalImageStorage.ts`.
- **Worker:** `PrismaRetiredUploadLedger.ts`, `retiredUploadCleanup.ts`, `CleanRetiredUploads.ts`, `S3RetiredObjectStore.ts`.
- **Scripts:** `convert-photos-webp.ts`, `staging-campaign.mjs`, `staging-remote.mjs`.
- **Also:** ADR-0088 amendment, specs, harness bridge.

## Compatibility

Legacy, video, chat and profile protocols, conditional response shape, v1/v2 SQL/receipts, caps, timeouts and concurrency are unchanged; no backfill. Each earlier conditional presign adds one journal event:

| Checkpoint | Records / events |
|---|---|
| Publish | 73/100 |
| c1, before reset → terminal | 76/107 → 76/181 |
| c2, before reset → terminal | 66/90 → 66/155 |

## Remaining decisions

1. **ADR-0088 amendment** (intent before initialization, authority after activation), via integration PR.
2. **W, M:** propose 30 s each (≈60 s test wait); deployed DB↔MinIO skew bound is an operational assumption **[U]**.
3. **Operator disposition** of `cleaning` stuck on a foreign object at an issued key.
4. **Pre-change orphans:** keep as ADR-0088 legacy cost or not; no enumeration proposed.
