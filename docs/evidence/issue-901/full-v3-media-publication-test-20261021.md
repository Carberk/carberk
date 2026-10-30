# Full-v3 B3 media/publication joined test, 2026-10-21

Test writer for #901 under #897 and PR #904. Supplied base `bf2dbc57427ac2690804e651a47438ddaa6c9f4d`. Branch `agent/issue-901-v3-media-tests-20261021-r2` was reserved and pushed at that base before any edit. Root owns assembly, GitHub records and hosted runs. No PR, child agent or reviewer was used. Scope follows root's D1–D5 in the [Support assembly and media disposition](../issue-897/support-assembly-and-media-disposition-20261021.md) and the earlier [decision note](full-v3-media-publication-test-handoff-20261021.md).

## Change

One case was added to [CampaignFullV3.e2e.spec.ts](../../../apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts): "publishes ordinary conditional business media, keeps it through Sales removal, refuses foreign keys and resets to exact object absence". The diff against the base is additive only. It adds three import lines (the `e2eSuite` catalog helpers, `@aws-sdk/client-s3` and `sharp`), then the new case and its `mediaDisposed` helper before the closing `});`. All 26 existing cases, helpers, env save/restore and guards are byte-identical. No production source, schema, migration, config, workflow, receipt field or provider override changed.

`mediaDisposed` copies `assertDisposed`, adds `media_uploads` and `listing_media` to the allowed tables, and checks that the SMS sink is empty. `assertDisposed` itself is unchanged, and still rejects those tables.

## Case shape

- **Reservations.** Primary `c1`×16 and foreign control `c2`×16. Contact phones `+99363382801` and `+99363259840`; the case asserts the derivation.
- **D1 catalog.** `defineE2eSuite("campaign897-full-v3-media-901")` with `seedSuiteCatalog`, outside any reservation. Before creating anything, the case asserts that no Brand, Model, Region or City row uses those IDs or slugs; a collision stops the case untouched. `finally` deletes only those four IDs, and only when no Listing, Dealership, Generation, sibling Model or sibling City still references them. Otherwise it soft-fails and keeps them.
- **Setup reused from proven cases.** `seed`, `elevatedStaff`, `signIn`, admission, Owner redemption, the protected-sink contact confirmation (no wrong attempt), and Sales invitation and redemption.
- **D3 upload ownership.** Sales makes three ordinary `conditional-v1` presigns with `x-business-id`. After each one the case asserts journal ownership of `{media_uploads,{id}}`, the exact row (user, business, protocol, `AVAILABLE`, `objectKeys` = the five exact keys), and HEAD 200 on the five placeholders. Then it does the client PUT through the returned `if-match`.
- **D4 publication.** A full-payload business draft with the catalog, the confirmed phone and three photos, then publish → 201. The case asserts: Listing business, seller, editor, contact and catalog; 3 `listing_media` rows with `uploadId` and `thumbHash`; uploads `ADOPTED` to the Listing; the draft deleted; the exact `listing.published` audit; journal ownership of the Listing, media and audit; inventory `{active:1, drafts:1}`; anonymous detail returning the four exact public variant URLs per photo; HEAD 200 on all 15 keys.
- **Foreign stock control.** `c2` runs its own ordinary staff, admission, redemption, contact, three conditional uploads and a published Listing. It reaches 66/87, not the 24 records the note assumed.
- **Refusals.** Each must leave both digests and both business media states unchanged:
  - `c2` Owner attaches `c1`'s available fourth key to `c2` stock → 400 `UPLOAD_NOT_AVAILABLE`.
  - `c1` Sales attaches a `c2` key → 400 `UPLOAD_NOT_AVAILABLE`.
  - `c2` Owner attach, publish, inventory read and presign against `c1` → 403 `MEMBERSHIP_REQUIRED`.
  - A stale-candidate reset → code 1 with no receipt.
- **D5 Sales removal.** Sales attaches the fourth photo with `sortOrder` 3. The Owner removes Sales → 201, with the exact remove audit. Removed Sales then gets 403 `MEMBERSHIP_REQUIRED` on inventory, attach, publish and presign. The Listing row is unchanged. Owner detail shows Sales as seller, the original `publishedAt`, the contact and four media. The Owner draft survives.
- **D2 reset.** Literal per-table counts and journal totals for both reservations, then HEAD 200 on all 35 keys. Reset `c1` with a lost receipt, then check:
  - `mediaDisposed` passes, with 76/177.
  - The `listing.published` audit is redacted.
  - The 20 `c1` keys return 404.
  - The 15 `c2` keys return 200, and `c2`'s digest and media state are unchanged.
  - A retry returns the terminal receipt with the same digest, and the keys still return 404.
  - The Sessions are refused.
  - The `c2` Listing is still publicly readable.
  - Resetting `c2` then disposes it at 66/152, and its 15 keys return 404.
- **`finally`.** `resetAfter` soft-asserts both resets. `withKnownJobs` removes only learned job IDs. The case checks that SMS request IDs have no email job. It HEADs each exact known key and deletes only those still present, soft-recording any failure. The catalog cleanup runs as described above. The case never lists a bucket, prefix or queue, and never deletes a journal-owned or media row directly.

## Literal capacity, derived before editing

| Reservation | Before reset (records / events) | Terminal | Live at reset | Audits retained |
|---|---:|---:|---:|---:|
| `c1` | 76 / 103 | 76 / 177 | 74 (9 UPDATE, 65 DELETE) | 9 |
| `c2` | 66 / 87 | 66 / 152 | 65 (6 UPDATE, 59 DELETE) | 6 |

`c1` steps: bootstrap 21/21; staff 49/57; Owner and Sales sign-ins 53/65; admission 56/68; redemption 58/72; contact 59/75; Sales invitation 61/77 and redemption 63/80; Owner draft 64/81 (asserted); three presigns 67/84; Sales draft 68/85; publish +5/+12 → 73/97 (asserted); fourth presign 74/98; attach +1/+3 → 75/101; removal +1/+2 → 76/103.

Live per-table counts for `c1`: users 15, sessions 4, otp_requests 5, totp_enrollments 2, totp_backup_codes 20, staff_grants 3, audit_logs 9, dealerships 2, dealership_members 2, dealership_invitations 2, listing_drafts 1, media_uploads 4, listings 1, listing_media 4. The asserted delivery ledger holds 4 email request IDs.

Live per-table counts for `c2`: users 15, sessions 3, otp_requests 4, totp_enrollments 2, totp_backup_codes 20, staff_grants 3, audit_logs 6, dealerships 2, dealership_members 2, dealership_invitations 1, media_uploads 3, listings 1, listing_media 3.

Objects: 7 conditional uploads × 5 keys = 35 public `listing-photos` keys: 20 for `c1`, 15 for `c2`. No private object.

Guards stay at 128 records and 2048 events, with unchanged lock settings, timeouts and concurrency. Processes: 7 existing email-worker invocations and 6 reset invocations: the stale refusal, the lost-response reset, its retry, the control reset, and `resetAfter`'s two terminal retries.

**Difference from the 78/107 → 78/183 prediction.** `c1` omits the buyer-b sign-in (−2 records, −4 events). The `c2` Owner is the cross-reservation non-member refusal actor instead. This is because one case now issues 5 OTPs for `c1` (4 sign-ins and 1 contact) and 4 for `c2` (3 and 1) from loopback. With buyer-b that is 10, exactly `SIGN_IN_CODE_RATE_POLICY.ipLimit` of 10 per hour, leaving no headroom; without it the case uses 9. No limit, guard or cap changed.

## First predicted RED (prediction only)

The first new behavioral assertion is in `upload()`, after the first ordinary conditional presign returns 201. It is `owned(c1)` containing `{media_uploads,{id}}`, labelled "presigned media_uploads row must be journal-owned by its reservation". It fails because `media_uploads` is outside the v3 tracked tables. The earlier `journal(c1, 64, 81)` checkpoint only re-counts proven write types.

After that, the source barriers expected in order are:

1. `Unsupported draft payload`
2. `Campaign business required` / `Campaign phone collision` / `Unsupported campaign audit` at publish
3. The unjournaled attach row
4. `Unsupported campaign business` on removal
5. Reset object disposal

These are not behavioral RED: a missing or non-loopback MinIO (asserted `SETUP`), a catalog collision (`SETUP`), and any sign-in, admission, redemption or contact failure.

## Seams and gaps

- **Reset object transport.** `execute`'s remote env attests synthetic origins (`MINIO_ENDPOINT: http://minio.railway.internal:9000`). Its `require` bridge only redirects `node:child_process` to the disposable PostgreSQL and Redis. When source adds attested exact-key deletion (D2), the harness needs a matching adaptation to the lane's MinIO, under the same authority and fencing. That should be analogous to the SQL redirect, not a bypass. No transport module is required or invented here.
- **Orphan placeholders.** A presign that initializes placeholders and then fails before responding would leave objects whose key the case never learned. The case cannot clean them without listing, so it does not try.
- **Deferred, not claimed.** Late producers and worker races, stranded-claim recovery against journaled uploads, a cleanup-ledger design, legacy-protocol uploads, video, creator deletion and restoration, and the Support open 503. No hosted GREEN, deployed acceptance or B3 completion is claimed.

## Offline verification

These ran after `pnpm install --frozen-lockfile --ignore-scripts`, an offline `DATABASE_URL` placeholder for `prisma generate`, and builds of `@auto-tm/contracts` and `@auto-tm/db`:

- `pnpm --filter @auto-tm/api typecheck` (TypeScript 7): exit 0.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: exit 0.
- `eslint --max-warnings 0` on the spec: exit 0.
- `AUTO_TM_TEST_DATABASES=off vitest list` on the spec: 27 cases, against 26 for the base file.
- `git diff --check` and `pnpm check:agent-docs`: passed.

Nothing else ran. That includes Docker, PostgreSQL, Redis, MinIO, the integration suite, CI and staging.
