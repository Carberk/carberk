# Prelaunch reference-data inventory — #901 (source-based), 2026-10-21

Research checkpoint for #897/#901, sole integration PR #904, base
`a43ee64ebf695f9ebf661d9b28604b8cebcaca3e`. Reservation branch:
`agent/issue-901-prelaunch-reference-inventory-20261021`.
Scope: this file only (plus sanitized `/tmp/issue901-inventory/` outputs). No PR,
environment read/write, reset, deployment or CI was performed by this task.

**Authority boundary.** Founder authority makes staging and production *application
data* disposable until public launch, but prohibits any wipe until (a) target/deletion
inventory exists, (b) approved intentional reference edits are reproducible,
(c) config/credentials/signing/infrastructure are retained, and (d) workers/producers
are quiescent. This document satisfies only the local-source half of (a)–(b). Live
comparison is **UNKNOWN** (see Evidence limits); no wipe is authorized by this file.

## 1. What the checked-in seed actually recreates

Entry point: `pnpm db:seed` → `packages/db/package.json:21` (`tsx src/seed.ts`).
`packages/db/src/seed.ts` loads ten JSON inputs under `packages/db/prisma/seed/`
(counts verified 2026-10-21; sha256 in `/tmp/issue901-inventory/source-counts.txt`):

| Family | Input | Rows | Seed key / convergence | Recreates on empty DB? |
|---|---|---:|---|---|
| Brand | `brands.json` | 130 | upsert by unique `slug` (`seed.ts:92`) | Yes, names RU/TK/EN only |
| Model | `models.json` | 2,435 | upsert by `(brandId, slug)` after slug lookup (`seed.ts:117`) | Yes; new UUIDs |
| Region / City | `regions.json` / `cities.json` | 6 / 35 | `slug`; `(regionId, slug)` | Yes; new UUIDs |
| BodyType, Color, EngineType, Transmission, DriveType | respective JSON | 10/15/6/4/4 | **no unique key in schema**; `findFirst(nameEn)` then update RU/TK(/hex) | Yes on empty DB; fragile on dirty DB (first `nameEn` row wins) |
| ExchangeRate | `exchange-rates.json` | 2 (USD→TMT 18.2, AED→TMT 4.96) | create-missing-only (`seed.ts:274-307`, `seed-exchange-rates.ts:30-40`) | Only if absent; never overwrites |

Critical non-properties of the main seed:

- **No Generations.** `Generation` exists (`schema.prisma:315`, no unique constraint,
  FK `Model.generations` at `:308`) and is read by
  `GET /catalog/models/:id/generations`, but no seed, script or migration inserts
  Generation rows (checked `packages/db/src`, `packages/db/scripts`, migrations).
  Any live Generation row is therefore **DB-only and unrecoverable from source**.
  `Listing.generationId` (`schema.prisma:470`) silently becomes null on reseed.
- **No stable IDs.** Brand/Model/Region/City IDs are `@default(uuid())`
  (`schema.prisma:280-328`). An empty-DB reseed mints new UUIDs; only slugs /
  `(brandSlug, slug)` / `(regionSlug, slug)` / `nameEn` are stable natural keys.
  Anything outside the DB that captured old UUIDs (deep links, fixtures, exports)
  breaks; anything inside FKs is rebuilt consistently if loaded through the seed.
- **No deletion/convergence.** Seed never removes rows. A renamed slug or `nameEn`
  in JSON leaves the old row behind; a DB-only rename is overwritten only where
  the upsert/update path matches (Brand/Model/Region/City names; lookup-table
  RU/TK/hex). Extra DB-only rows in any catalog table survive a reseed — so
  "reseed the wiped DB" and "reseed the live DB" give different catalogs.
- Data corrections that live in **migrations** (e.g. Lugong/LiuGong,
  `migrations/20261011130000_correct_lugong_liugong_models`) are replayed by
  `migrate deploy` on an empty DB but are no-ops there; they do not supply data.

## 2. Reference families the main seed cannot recreate (DB-only risk)

| Family | Where it lives | Source of truth today | Known vs UNKNOWN |
|---|---|---|---|
| Generations (names RU/TK/EN, `yearStart/yearEnd`, Model link) | `generations` | None in repo | Existence/content in staging & prod: **UNKNOWN** |
| Exchange-rate edits (`rate`, `setByUserId`, `updatedAt`) | `exchange_rates` (`schema.prisma:782`) | JSON has 2 pairs; admin edits deliberately preserved by create-missing-only | Live values: **UNKNOWN**; mechanism KNOWN |
| Admin catalog edits: Brand/Model create/update/delete, brand logo set/remove | `brands`, `models`, `brands.logoKey`; audit in `audit_logs` | Admin API (`AdminCatalogController.ts:44-130`: brands/models CRUD, logo presign/PUT/DELETE) writes DB only | Live edits: **UNKNOWN** |
| Admin-uploaded logos (non-`imp-` keys) | `catalog-assets` bucket + `Brand.logoKey` | Importer skips admin uploads unless `--force` (`brand-logos/import.ts:17-18,47-49`); no repo copy of bytes | Live keys/bytes: **UNKNOWN** |
| Imported logos | `catalog-assets/brands/<slug>/imp-<hash12>[-<uuid>]/` | Reproducible: manifest (below) | KNOWN reproducible, given network/package access |
| Diagnostic centers, templates/body maps, assignments | `diagnostic_centers` (`operationalApproval Json?`, `schema.prisma:1354-1367`), `diagnostic_template_versions.definition Json` (`:1384`), `diagnostic_center_assignments` | Created only via staff API flows / campaign bootstrap (`scripts/staging-campaign.mjs:255-259,797-818` synthetic center). No repo seed file holds an approved template definition or body map | Approved live templates/centers: **UNKNOWN**. Synthetic campaign fixtures are NOT approved reference data |
| History service price/capacity/provider metadata | `history_capacity_days` (`:1488`), `history_provider_allowances` (`:1498`), quote `amount` fixed 100 in code (`PrismaHistoryOperations.ts:36,74`), `providers Json` on quotes/orders | Capacity/allowance rows are operator-written per day via service operations (`PrismaHistoryOperations.ts:25-30`); no seed | Live capacity/allowance rows: **UNKNOWN**; price 100 is code, KNOWN |
| Market-knowledge sources/datasets (provenance, rights, redistribution) | `market_knowledge_sources` (`:1789`), `market_knowledge_datasets` | Ingested via `PrismaMarketKnowledge.ts`; no seed/bundle in repo | **UNKNOWN**; rights/provenance JSON must not be reinvented |
| Blog content | `blog_posts` (`:980`) | No seed or importer found | **UNKNOWN** (may be empty) |
| Staff grants / admin role | `staff_grants` (`:1087`), `users.role` | Operator scripts only: `staff:bootstrap` (`scripts/bootstrap-staff.ts`, exact verified User + audit), `admin:promote` (`scripts/promote-admin.ts`). Never seeded | Live grants: **UNKNOWN**; must be re-granted to re-created Users, never copied as session/TOTP material |
| Measurement epoch/state | `measurement_state` (`:1098`, key/epoch) + env `MEASUREMENT_COLLECTOR_EPOCH` | Runtime-created | Treat as protected config identity, not content; live epoch: **UNKNOWN** |
| Demo inventory (if approved for an environment) | Users/Listings/media with deterministic IDs (`demo-inventory/marker.ts`), objects under demo prefix | Reproducible but separate: `demo-inventory/content.ts:57,157` (10 sellers, 47 cars), `photos.manifest.json` (47 listings, 297 Commons photos, verified 2026-10-06) | KNOWN reproducible; whether live demo rows were hand-edited: **UNKNOWN** |
| Reviewer / tester / UI fixtures | Deterministic-ID Users/Listings | Separate guarded scripts: `reviewer-scenario.ts`, `tester-accounts.ts` (IDs from `TESTER_ACCOUNTS_JSON`, codes never stored), `ui-fixture.ts`, `s7-moderation.fixture.ts` | Fixture class, KNOWN; **not reference data** — do not preserve as catalog truth |

## 3. Assets, licences and provenance (reproducible inputs)

- Brand logos: `prisma/seed/brand-logos.manifest.json` (schemaVersion 1, 130 entries:
  38 simple-icons pinned by package version, 38 Wikimedia Commons pinned by
  `sha256Master`/page revision, 54 bundled masters under
  `prisma/seed/brand-logo-masters/`, tiers A–F; no no-source entries). Importer `logos:import` (`packages/db/package.json:30`,
  `scripts/import-brand-logos.ts`) renders 30/60/90 px masks, uploads to
  `catalog-assets`, sets `Brand.logoKey`, is idempotent, and retains old imported
  versions (no GC). Requirements to reproduce: pinned `simple-icons` version from
  the workspace lockfile, outbound access to `upload.wikimedia.org` **or** a warm
  operator cache, bundled masters in-repo, `DATABASE_URL` + `MINIO_*` for target.
  A URL alone is not a backup: Commons entries must verify against `sha256Master`.
- Demo photos: downloaded at seed time from Commons per
  `demo-inventory/photos.manifest.json` (licence/author/sourcePage per photo;
  allowed licences enforced in `manifest.ts`). Bytes are not committed.
- Reviewer photos: `scripts/reviewer-fixtures/photos.manifest.json` (local jpgs in repo).
- **Approved edited artwork is the gap:** any admin-uploaded logo or hand-edited
  demo media has no manifest entry. Before deletion it needs an explicit export:
  object bytes + sha256 + Brand slug (natural key) + licence/provenance statement +
  approver. Without that export it is unrecoverable, not "reseedable".

## 4. Configuration: env vs DB vs Redis

- **Env-only (retain in secret/config store; never in the manifest):** names seen in
  `apps/api/src/env.schema.ts` / `apps/worker/src/env.schema.ts` include
  `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `MINIO_*`, `RESEND_API_KEY`, `FCM_*`,
  `APNS_*`, `SMS_*`, `MEASUREMENT_*`, `TESTER_ACCOUNTS_JSON`,
  `REVIEW_DEMO_ACCOUNTS_JSON`, feature flags (`REPORT_ENTRY_ENABLED` etc. surfaced
  read-only by `ConfigController.ts:8-18`). This inventory neither read nor prints
  any value.
- **DB-resident config (protect or explicitly re-create, do not classify as
  disposable content):** `exchange_rates`, `staff_grants` + `users.role`,
  `diagnostic_centers.operationalApproval/planCode`, `history_capacity_days`,
  `history_provider_allowances`, `measurement_state.epoch`, `brands.logoKey`.
- **Redis (disposable only after quiescence; never blanket-flush a shared DB):**
  BullMQ queues named in `apps/worker/src/operations/watchdog.main.ts:13-14` —
  `video-transcode, notification-fanout, orphan-cleanup, account-purge,
  retired-upload-cleanup, listing-view-retention, measurement-retention,
  measurement-outbox, service-lifecycle, service-push, diagnostic-artifacts,
  email-code` — plus OTP rate-limit/session/cache keys. Queue jobs, delayed/repeat
  schedulers and outbox rows (`service_outboxes`, `measurement_outbox`) must be
  inventoried by count/state, then cleared only in the target namespace.

## 5. Protected vs disposable classes (for the future operator procedure)

| Class | Members | Disposition |
|---|---|---|
| Protected — never delete | Railway project/env/service/DB/bucket identities, domains, secrets & signing keys (secret stores), DB roles/extensions, `_prisma_migrations`, bucket policies/lifecycle, infra `MEDIA_BUCKETS` definitions (`infra/minio/contract.mjs:20-25`) | Retain; snapshot nonsecret identity/version metadata only |
| Reference — reproduce, then verify | §1 catalog JSON families, approved §2 deltas via manifest/overlay, imported logos, approved demo inventory if designated | Recreate from manifest; hash/count verify |
| Protected-config-in-DB — re-create explicitly | §4 DB-resident config, staff grants via bootstrap scripts to ordinary verified Users | Named operator action with audit; no token/session seeding |
| Disposable — delete only after gates | Users/Sessions/OTP/TOTP rows (except re-created actors), Listings/media rows & objects, conversations, reports, orders, diagnostic reports/evidence/PDFs, history orders/artifacts, measurement records, audit/outbox rows, campaign `cf_*` fixture schemas, Redis jobs/cache in target namespace, versioned/multipart object state in target buckets | Explicit target-bound deletion with counts before/after |
| External — mark, do not claim deleted | Sent email/SMS/push, provider/payment sandbox artifacts, signed URLs already issued, Play/App Store state | Record as unenumerable or expire-by-TTL; never claim wiped |

Object buckets in scope for inventory (names, not credentials): `listing-photos`,
`listing-videos`, `chat-attachments`, `catalog-assets` (`contract.mjs:20-25`), plus
code-referenced private buckets `service-private`
(`MinioServicePrivateStore.ts:18`) and the video private bucket default in
`apps/worker/src/env.schema.ts`. Inventory must list keys/versions/delete-markers/
multipart uploads per bucket; only `catalog-assets/brands/**` approved assets are
reference, the rest is disposable after quiescence.

## 6. Minimum read-only comparison (run per environment, when authorized)

Run against a **read-only** connection; export only the sanitized aggregates and
natural-key rows below to a restricted (non-repo) location. No credentials, tokens,
codes, emails/phones of real persons, or object bytes in the repo.

```sql
-- 0. Identity guard (record, do not paste secrets): database, schema, server version
select current_database(), current_schema(), version();
select count(*) from _prisma_migrations where finished_at is not null;

-- 1. Per-table row counts for all 88 schema models (@@map names in schema.prisma)
--    Generate from information_schema; classify each table per §5 before any wipe.

-- 2. Catalog natural-key diff inputs (compare to §1 JSON offline)
select slug,nameRu,nameTk,nameEn,logoKey from brands order by slug;
select b.slug,m.slug,m.nameRu,m.nameTk,m.nameEn from models m join brands b on b.id=m.brandId order by 1,2;
select slug,nameRu,nameTk,nameEn from regions order by slug;
select r.slug,c.slug,c.nameRu,c.nameTk,c.nameEn from cities c join regions r on r.id=c.regionId order by 1,2;
select nameEn,nameRu,nameTk from body_types union all select nameEn,nameRu,nameTk from colors
  union all select nameEn,nameRu,nameTk from engine_types union all select nameEn,nameRu,nameTk from transmissions
  union all select nameEn,nameRu,nameTk from drive_types order by 1; -- tag each set separately in practice
select "fromCurrency","toCurrency",rate,"setByUserId" is not null as admin_set from exchange_rates order by 1,2;

-- 3. The seed-blind families (any row here is a preservation decision)
select m.brandId,b.slug as brand_slug,m.slug as model_slug,g."nameEn",g."yearStart",g."yearEnd"
  from generations g join models m on m.id=g."modelId" join brands b on b.id=m."brandId" order by 1,2,4;
select id,code,"planCode","operationalApproval" is not null as has_approval from diagnostic_centers;
select "centerId",version,synthetic,"publishedAt" from diagnostic_template_versions order by 1,2;
select day,"slotLimit","morningLimit",mode from history_capacity_days order by day;
select provider,day,allowance,consumed,mode from history_provider_allowances order by 1,2;
select id,status,"retentionBasis" from market_knowledge_sources order by id;
select slug,locale,"publishedAt" is not null as published from blog_posts order by 1,2;
select capability,count(*) from staff_grants where "revokedAt" is null group by 1;
select key,epoch from measurement_state;
select count(*) filter (where "logoKey" is not null and "logoKey" not like '%imp-%') as admin_logo_rows from brands;
```

Object/queue companions (read-only, counts and keys only): S3 `ListObjectsV2` +
version/multipart listing per §5 bucket (record key, size, sha256 for
`catalog-assets/brands/**` and any approved demo prefix only); BullMQ
`getJobCounts(wait,prioritized,active,delayed,failed,completed)` per §4 queue via
the watchdog's queue list; Redis `SCAN` by target prefix for counts only.
Diff rule: every live row not matched by natural key to §1 inputs or an approved
overlay is classified `approved-reference | disposable | protected-config |
UNRESOLVED`; UNRESOLVED rows go to a restricted export and block deletion of
their family. Staging and production are compared independently — never averaged.

## 7. Required reference manifest/overlay (the deliverable before any wipe)

A versioned bundle (outside the repo if it contains live values; a sanitized
template may be committed) containing, per family in §2: natural key
(Brand/Model slug path, Region/City slug path, `nameEn`, currency pair, center
`code`, template `(centerCode, version)`, capacity `day`, source `id`), all
RU/TK/EN names and scalar fields, Generation year ranges, rate values, template
`definition` JSON verbatim with its authoring provenance, capacity/provider
values with `mode` (synthetic vs live), market-knowledge provenance/rights JSON,
blog slug/locale/content if approved, asset entries
`{brandSlug, objectKey, sha256, licence, source, approver}`, per-file sha256,
row counts per family, environment label, candidate SHA, and the §6 diff report
with every difference classified. Secrets, codes, session/TOTP material and
personal data are excluded by construction.

## 8. Restore order and empty/repeat-seed proof (proposal, isolated target only)

1. Verify target identity + quiescence (separate operator gate; not this task).
2. `migrate deploy` (61 migrations) on the empty DB; confirm `_prisma_migrations`.
3. Bootstrap buckets/policies (`infra/minio/bootstrap.mjs`), retaining identities.
4. Main seed (§1). Record counts; expect exactly the §1 row counts and zero Generations.
5. Apply approved overlay (§7) — Generations, rate deltas, template/center,
   capacity/provider, market-knowledge, blog — each with natural-key upserts.
6. `logos:import` (dry-run report first); verify `logoKey` coverage and object HEADs.
7. Re-grant staff/admin via `staff:bootstrap` / `admin:promote` to Users created
   through ordinary sign-in; re-create tester/reviewer/demo fixtures only if
   designated for that environment (each has its own guard/authorization).
8. Recompute derived Listing prices if scenario Listings were loaded
   (`listing-prices:recompute`); start workers; verify readiness + ordinary login.
9. **Repeat-seed test:** run steps 4–6 a second time; require zero created/updated
   rows, zero new object versions, identical §6 natural-key exports (hash-equal).
   Any delta fails the gate — this catches the create-missing-only rate trap and
   the non-unique `nameEn` first-row trap.
10. **Empty-target test:** repeat 2–9 on a second empty DB; require hash-equal
    natural-key exports to the first, differing only in UUIDs/timestamps.

## 9. Evidence limits and missing authority

- No live environment was read. The previously refused scoped Railway token was
  **not** retried, not replaced with account-wide credentials, and not routed
  around; Railway CLI was not used to obtain environment data. All live values in
  §2 are therefore UNKNOWN, including whether Generations, admin logos, approved
  diagnostic templates, capacity rows or blog rows exist at all.
- Missing authority to close the live half: a working read-only grant for each of
  staging and production covering (i) PostgreSQL read-only queries in §6,
  (ii) S3 list/head on the §5 buckets, (iii) Redis job-count reads — scoped to
  those environments, with an approved restricted destination for UNRESOLVED
  exports. Founder/staff decisions are additionally required on which §2 deltas
  are "approved" (notably diagnostic templates and any non-synthetic History
  capacity/provider values).
- Source evidence is exact for base `a43ee64e`; counts/hashes above were computed
  locally from that tree (`/tmp/issue901-inventory/source-counts.txt`).

## 10. Next smallest seed-delta implementation brief (one writer, after §9 access)

1. Add `packages/db/prisma/seed/generations.json` + a Generation block in
   `seed.ts` keyed by `(brandSlug, modelSlug, nameEn)` with an explicit
   convergence test; populate it **only** from the approved §7 overlay, not by
   scraping live data into the repo without review.
2. Add an overlay loader (single JSON, schema-validated) for rate deltas,
   diagnostic center/template, History capacity/provider and market-knowledge
   reference rows, applied after the main seed, idempotent by natural key, with
   a `--dry-run` diff report. Keep live/synthetic `mode` explicit; synthetic
   fixtures must not activate services.
3. Extend `logos:import --dry-run` reporting to flag admin (`non-imp-`) `logoKey`s
   as preservation blockers until an §3 asset export exists.
4. Add the §8 empty + repeat-seed test as a hosted DB test (Testcontainers
   pattern already used in `packages/db/tests`) asserting hash-equal natural-key
   exports across two runs and two empty databases.
Out of scope: any reset operator, backup framework, credential handling, or
changes to campaign/full-v3 machinery.
