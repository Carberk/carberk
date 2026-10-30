# Full-v3 B3 media/publication: test handoff and decision note, 2026-10-21

Test writer for #901 under #897 and PR #904. The exact supplied base is `1bf1fba1a69e42619cf6cbd0baf6a33b0fd07a4e`. Branch `agent/issue-901-v3-media-publication-tests-20261021` was reserved and pushed at that base before any edit, in host checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-43be2993`. Root owns assembly, GitHub records and hosted runs. No PR, child agent or reviewer was used.

**Outcome: decision note, no test edit.** [CampaignFullV3.e2e.spec.ts](../../../apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts) is byte-identical to the base. Its SHA-256 is `b9d750533d7e7eb9a0428eb163cca42c463b0f02ab07869d733a2f1fcce07d29`, and it still declares 26 cases. The brief permits one joined ordinary-HTTP case, from sign-in through publication and reset. That case needs two gates the brief forbids this writer to invent: a catalog source and an object-disposal authority (D1 and D2 below). A partial case that stopped at upload ownership would split the joined stock, removal and disposal assertions, which the brief also forbids. The budget fits (see below), so capacity is not the blocker.

## Proven prerequisites, not rederived

Root reports hosted `db44fcbf835791f09fee119033b55e80d60d15ec`, API job `118974797009`, run `39524126985`: 25 of 26 full-v3 cases pass. Those passing cases include ordinary email OTP sign-in, staff TOTP and grants, admission, Owner redemption, generated contact confirmation through the protected SMS sink, contact reuse and disposal, personal and admitted-business text drafts, and both sender/reset order cases. Only Support open still fails, with a 503. This writer did not rerun or read that run. The setup steps 1–5 below reuse those case bodies' proven helpers unchanged.

## Source facts that decide this slice

| Fact | Source | Consequence |
|---|---|---|
| The v3 tracked tables are the 18 business tables plus `sessions`, `totp_enrollments`, `totp_backup_codes`, `otp_requests`. `media_uploads`, `listing_media` and `media_upload_cleanups` have no tracking trigger | `scripts/staging-campaign.mjs:246-248` | Presign commits an unjournaled `media_uploads` row. Nothing refuses it |
| `media_uploads.businessId` is `onDelete: Restrict`; `media_uploads.userId` is Cascade; `listing_media.listingId` is Cascade | `packages/db/prisma/schema.prisma` (`MediaUpload`, `ListingMedia`) | The reset preflight counts unowned incoming-FK children, so it raises `Foreign campaign reference` (`staging-campaign.mjs:586-606`). Reset blocks visibly; it does not silently succeed |
| v3 is a "media-free storage profile". Reset runs SQL and Redis only. The remote program attests the MinIO origins but holds no object client, bucket or credential | `staging-campaign.mjs:2,211`; `staging-remote.mjs:18-22`; the spec's `execute` bridges only `node:child_process` | No existing receipt, journal field or reset step can delete or attest objects |
| Default presign writes the legacy protocol. A retired legacy upload is `LEGACY_PENDING`, and its bytes stay | `PresignUpload.ts`; Listings `CONTEXT.md`; `PrismaRetiredUploadLedger.ts:13,55` | Only `writeProtocol: "conditional-v1"` uploads have fenced, provable deletion. The case must use conditional uploads |
| A conditional presign creates five placeholder objects (`IfNoneMatch:"*"`): the original plus thumbnail, list, detail and fullscreen. The upload stores those keys in `media_uploads.objectKeys`. All five live in bucket `listing-photos` | `MinioMediaStorageAdapter.ts:62-68,136-142`; `ConditionalImageStorage.ts:38-44`; `imageUploadObjectKeys.ts` | Object authority already exists as upload provenance. The exact keys are `pending/<uuid>/{original,thumbnail,list,detail,fullscreen}.webp` |
| The only sanctioned object deleter is the worker's `CleanRetiredUploads`. It reads `media_upload_cleanups` `PENDING` rows that retirement writes. Stranded-claim recovery also UPDATEs `media_uploads` and INSERTs cleanups asynchronously | `PrismaUploadClaims.ts:115-131`; `PrismaRetiredUploadLedger.ts:40-58` | Reset-driven deletion through the worker is a late-worker writer against journaled rows. It needs fencing and a no-resurrection proof, not a simple cleanup |
| `Listing.brandId`, `modelId` and `cityId` are required FKs. The API test template is migrated, never seeded. No migration inserts catalog rows, and `globalSetup.ts` and the workflows run no seed | `schema.prisma` (`Listing`, `Brand`, `City`); `apps/api/test/globalSetup.ts`; `packages/db/prisma/migrations` | Read-only discovery of an existing seeded catalog finds nothing in the hosted lane. `BusinessInventory.e2e.spec.ts` creates its own (`seedSuiteCatalog`), which the brief does not authorize here |
| The v3 draft payload guard allows only `description` (string), `media = []` and `validatedSteps = []` | `staging-campaign.mjs:739` | A business draft with photos, catalog, price or contact fields refuses with `Unsupported draft payload` |
| Listings stay root-only for business; listings with the derived contact phone hit the phone guard | `staging-campaign.mjs:728,358-365` | Publication refuses with `Campaign business required`. Once that is widened, it refuses with `Campaign phone collision`, because a business Listing stores the business's confirmed number |
| Publication writes audit `listing.published` (targetType `Listing`) | `PublishListing.ts:389-401` | Refused as `Unsupported campaign audit`. No current rule covers it |
| Member removal DELETEs the member and writes `BUSINESS_MEMBERSHIP_CHANGED {targetUserId, action:"remove"}` | `PrismaBusinessRepository.ts:107-117` | An `identities` DELETE of an admitted-business member raises `Unsupported campaign business` (`staging-campaign.mjs:713`). The sales-audit rule also only maps `active`/`suspended` |
| Measurement capture is disabled without activation | `packages/db/src/measurement-capture.ts:15` | Publication adds no measurement rows in this lane |

## Literal budget, derived before any edit

Assumptions: fresh ordinary sign-ins, the first TOTP enrollment for each staff actor, one admission and one redemption, and the happy contact path with no wrong attempt. All uploads use the conditional protocol. There are no concurrent writers and no expired claims. Counts assume the media tables join the journal under D3, keyed by `id`.

| Step | Records | Events | Running |
|---|---:|---:|---:|
| Bootstrap | 21 | 21 | 21 / 21 |
| Coordinator sign-in (OTP, Session; 4 events) plus TOTP (enrollment, 10 backups; 13 events) | 13 | 17 | 34 / 38 |
| Support sign-in, TOTP and `founder.admission` grant plus audit | 15 | 19 | 49 / 57 |
| Buyer-a sign-in | 2 | 4 | 51 / 61 |
| Admission: Dealership, owner invitation, BUSINESS_ADMITTED | 3 | 3 | 54 / 64 |
| Owner redemption: invitation UPDATE, member INSERT, Dealership UPDATE, audit | 2 | 4 | 56 / 68 |
| Contact: OTP INSERT, consume UPDATE, Dealership UPDATE | 1 | 3 | 57 / 71 |
| Sales-a sign-in | 2 | 4 | 59 / 75 |
| Sales invitation plus CREATED audit | 2 | 2 | 61 / 77 |
| Sales redemption: invitation UPDATE, member INSERT, REDEEMED audit | 2 | 3 | 63 / 80 |
| Buyer-b sign-in (non-member refusal actor) | 2 | 4 | 65 / 84 |
| Owner text business draft plus sales full-payload business draft | 2 | 2 | 67 / 86 |
| Three sales conditional presigns (`media_uploads` INSERT) | 3 | 3 | 70 / 89 |
| Publish: 3 reserve UPDATEs, 3 finalize UPDATEs, Listing INSERT, 3 `listing_media` INSERTs, draft DELETE, `listing.published` audit | 5 | 12 | 75 / 101 |
| Attach a fourth owned photo: presign INSERT, reserve UPDATE, finalize UPDATE, `listing_media` INSERT | 2 | 4 | 77 / 105 |
| Remove sales: member DELETE plus MEMBERSHIP_CHANGED audit | 1 | 2 | **78 / 107** before reset |
| Reset (D2 option A): 9 audit redaction UPDATEs; 67 DELETEs (78 records minus 9 audits, the consumed draft and the removed member) | 0 | 76 | **78 / 183** terminal |
| Reset (D2 option B): add 4 retire UPDATEs and 4 `media_upload_cleanups` INSERTs before the deletes. Then delete or retain those cleanups as D2 decides | +4 | +8 to +12 | **82 / 191–195** |

The nine retained audits are: 2 bootstrap, 1 grant, BUSINESS_ADMITTED, owner REDEEMED, sales CREATED, sales REDEEMED, `listing.published` and MEMBERSHIP_CHANGED. The case's existing helpers expect exactly 5 email ledger rows, one each for coordinator, support, buyer-a, sales-a and buyer-b, plus 1 SMS ledger row and 1 binding. Reads, refusals and reset retries add zero events. The pre-delete cleanup budget check (`events + live records ≤ 2048`) holds with ample room. Limits stay at 128 records and 2048 events, with unchanged lock settings, timeouts and concurrency. A foreign control reservation `m2…` adds its own 21 bootstrap records, 2 sign-in records and 1 personal draft, and is counted separately.

Objects: 4 uploads × 5 keys = 20 exact public objects in `listing-photos`, and no private object. Per upload, presign creates 5 placeholders, the client PUTs the original once, and the real Sharp generator rewrites the original and 4 variants under `if-match`. Processes: 5 existing email-worker invocations, plus 3–4 reset invocations (a lost-response reset, its retry, the control reset, and the stale-candidate refusal). No new process type, service, cap or concurrency setting.

## Test-ready design (author after D1–D5)

Reservation `m1` × 16, with control reservation `m2` × 16. Reuse `seed`, `signIn`, `elevatedStaff`, `admissionFor`, `withKnownJobs`, `resetAfter`, `digest`, `owned` and `assertDisposed` unchanged. The only composition this needs is an S3 client built from the lane's existing `MINIO_*` environment, for HEAD/GET of exact known keys only, as `BusinessInventory.e2e.spec.ts` builds one. It needs no provider override, generator hook, `OTP_TEST_MODE`, seeded user, Session, role or Dealership, and no JWT. Its env save/restore extends the existing `beforeAll`/`afterAll` pattern.

1. Run the proven setup (rows above through Buyer-b), then confirm the contact phone exactly as the contact case does.
2. Owner creates a text business draft. Sales presigns three `image/webp` uploads with `writeProtocol:"conditional-v1"` and `x-business-id`. The case PUTs a real Sharp-generated WebP through the returned `if-match` header. After **each** presign, `owned(m1)` must contain `{media_uploads,{id}}` for the upload found by its exact key. The row's `objectKeys` must equal `imageUploadObjectKeys(key)`, and `userId`/`businessId` must be sales-a and the admitted business.
3. Sales creates the full-payload business draft using the D1 catalog, the confirmed contact phone and the three photos. Sales publishes and receives 201. Assert: the Listing has `businessId`, `sellerId=sales`, `status active` and the confirmed `contactPhone`. There are 3 `listing_media` rows, each with `uploadId` and `thumbHash`. All three uploads are `ADOPTED` with `claimTarget` the Listing. The draft is deleted. Inventory counts are `{active:1, drafts:1}`, the drafts being the owner's. Anonymous `GET /api/v1/listings/:id` returns the four public `.webp` variant URLs. HEAD on each exact key returns 200.
4. Refusals, each leaving both digests, both journals and all upload rows unchanged: buyer-b attach → 403; buyer-b publishes the owner draft → 403; a foreign `m2` member presents the `m1` key to attach on its own stock → refused by business-ID provenance; a stale candidate reset → code 1, `receipt` undefined.
5. Sales presigns and uploads a fourth photo, then attaches it with sortOrder 3. Owner removes sales → 201. Removed sales then gets 403 on inventory read, attach and publish. Owner still reads the Listing with 4 media, the unchanged contact and the unchanged `publishedAt`, and the owner draft is unchanged. The Listing keeps `sellerId=sales`. No silent transfer.
6. Snapshot `owned(m1)`, then assert the literal per-table counts and **78/107**. Run `reset` with `loseReceipt`. Then `assertDisposed`, and the media rows are absent. Under D2, all 20 exact keys must HEAD 404, or the cleanup receipt must reach its D2 terminal state. Nine audits remain redacted, `listing.published` included. Retry the reset: same digest, `queueJobs:0`, `sinkRecords:0`. The `m2` control's draft, upload rows, objects and digest are unchanged. Then reset `m2` and assert its disposal.
7. `finally`: soft-assert the reset as today. Then remove only the exact known S3 keys still present, recording any failure, and the exact known foreign-control rows. Never delete `media_uploads`, `listing_media` or any journal-owned row directly. Never list buckets, prefixes or queues.

**First expected RED (prediction only):** setup steps 1–4 match proven cases. The first new write is the first conditional presign, which source returns as 201 with an unjournaled row. The step-2 assertion `owned(m1) ⊇ {media_uploads,{id}}` fails. That is a behavioral RED. If root wants a request-level RED instead, source may refuse business presign until D3 lands; the case would then see 500 at presign. The next predicted barriers, in order, are: `Unsupported draft payload` (draft POST); `Campaign business required`, then `Campaign phone collision` and `Unsupported campaign audit` (publish); the unjournaled attach row; `Unsupported campaign business` (removal); and `Foreign campaign reference` (reset). **Setup/composition failures, never behavioral RED:** an empty catalog under D1, missing `MINIO_*` or a non-loopback endpoint, any admission/redemption/contact/auth failure, and a presign 4xx caused by a missing `x-business-id`.

## Decisions root must make before a test is written

- **D1 Catalog.** (a) Seed the fixed `packages/db/prisma/seed/{brands,models,regions,cities}.json` catalog into the API test template once in `globalSetup`, so discovery stays read-only. Or (b) authorize exact-ID test-owned catalog rows outside any reservation, created and removed in `finally`, as the existing foreign Dealership controls are. Catalog references never convey graph ownership (`staging-campaign.mjs:497`). Recommend (a): it matches staging, where a seeded catalog exists.
- **D2 Object disposal authority.** (A) Reset deletes each journaled upload's exact `objectKeys` through a new, attested MinIO transport. That transport needs an ETag-fenced delete, a receipt field such as `objectsAbsent`, and a spec harness bridge. (B) Reset retires the uploads into `media_upload_cleanups` and the real worker deletes. This needs worker fencing for the namespace, a no-resurrection proof against stranded-claim recovery and late generators, and a sanctioned way to run the real cleanup job in the case, analogous to `process-campaign-email.cjs`. Neither option exists. Recommend (A) for this slice, with (B)'s late-worker race as an explicit follow-up.
- **D3 Journal scope.** Add `media_uploads` and `listing_media`, and `media_upload_cleanups` if D2 is (B), to v3 tracked tables. Then define: parent edges (`uploadId` → owned upload; `listingId`; `businessId`/`userId`); allowed state transitions (`AVAILABLE→PREPARING→ADOPTED`, release back to `AVAILABLE`, and `RETIRED` only through ordinary retirement); the FK and lock inventory growth; and refusal of cross-reservation `uploadId` reuse.
- **D4 Content rules.** Widen the draft payload to the publishable keys with real `photos` entries. Admit adopted-business Listings. Admit a Listing whose `contactPhone` is the bound confirmed number. Admit the `listing.published` audit shape and its redacted retention.
- **D5 Removal.** Admit DELETE of a sales member in `identities` with an exact `action:"remove"` audit. Define how the sales-inventory version arithmetic counts a removed member.

## Deferred obligations, not claimed

D3/D7 creator account deletion and restoration. Video. Enquiries, push, socket and private images (B4). Native and rendered D2/D3 proof. Genuine producer/cleanup races: a late generator after reset, worker stranded-claim recovery against journaled uploads, reset versus an in-flight publish reservation, and a cleanup retry after disposal. Expired-claim and transient-failure release paths. Legacy-protocol uploads, whose bytes stay by design. Two-connection collision inventories. The Support open 503, which belongs to a separate writer. None of these is implied complete, and no hosted GREEN, deployed acceptance or B3 completion is claimed.

## Unchanged-case comparison and offline checks

- `git diff 1bf1fba1 -- apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` is empty. SHA-256 is as recorded above, with 26 `it(` declarations. All case bodies, helpers, imports, env save/restore and guards are unchanged.
- `git diff --check` and `pnpm check:agent-docs` passed. Offline `pnpm install --frozen-lockfile --ignore-scripts` provided the local tooling.
- Not run: TypeScript, ESLint and Vitest collection, because no TypeScript changed. No SQL, MinIO, Redis, service, Docker, integration suite, CI or staging operation was run.

Docs: no external lookup was needed. Every fact above comes from checked-in source, schema, test helpers and evidence. Stop at this pushed handoff; root chooses D1–D5 and the next writer.
