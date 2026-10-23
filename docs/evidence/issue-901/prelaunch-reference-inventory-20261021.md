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
  Any live Generation row is therefore **DB-only and unrecoverable from source**:
  a fresh seed produces zero Generation rows because no source dataset exists.
  `Listing.generationId` (`schema.prisma:470`) is a nullable scalar with **no
  declared relation/FK** in `Listing` (no `generation` relation field), so this
  inventory makes no claim that a catalog reseed changes it — the seed does not
  touch Listings. The risk is narrower: an old exported Listing row that carries
  a Generation UUID would dangle if re-imported verbatim after a wipe, because
  no source can recreate that Generation or its UUID.
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
- **Repeat seed is not write-free today.** Brand/Model/Region/City use
  unconditional upsert `update:` clauses (`seed.ts:92,117` and the Region/City
  equivalents), and Prisma `@updatedAt` (`schema.prisma:280-328`) is refreshed by
  an update write even when values are unchanged. Lookup tables and exchange
  rates do check before writing. Convergence must therefore be judged
  semantically (§8), not by counting updated rows.
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
| Diagnostic centers, templates/body maps, assignments | `diagnostic_centers` (`operationalApproval Json?`, `schema.prisma:1354-1367`), `diagnostic_template_versions.definition Json` (`:1384`), `diagnostic_center_assignments` | Created only via staff API flows / campaign bootstrap (`scripts/staging-campaign.mjs:255-259,797-818` synthetic center). No repo seed file holds an approved template definition or body map | Approved live templates/centers: **UNKNOWN**. Synthetic campaign fixtures are NOT approved reference data. Inventory only — recreation, if separately approved, goes through current authenticated staff/service authoring, never a direct seed loader (no new bootstrap authority for qualified-center approval) |
| History daily capacity/provider rows | `history_capacity_days` (`:1488`), `history_provider_allowances` (`:1498`), quote `amount` fixed 100 in code (`PrismaHistoryOperations.ts:36,74`), `providers Json` on quotes/orders | **Daily operational state**, operator-written per day via service operations (`PrismaHistoryOperations.ts:25-30`); no seed | Live rows: **UNKNOWN**. They are not enduring reference by default: preserve only an explicitly approved *policy input* (e.g. an approved future limit/allowance value with its evidence/mode); never carry `consumed`, holds or past-day capacity forward as authority. Synthetic day fixtures are reconstructed fresh. Price 100 is code, KNOWN |
| Market-knowledge sources/datasets (provenance, rights, redistribution) | `market_knowledge_sources` (`:1789`), `market_knowledge_datasets` | Ingested via `PrismaMarketKnowledge.ts`; no seed/bundle in repo | **UNKNOWN**; rights/provenance JSON must not be reinvented or seeded by a direct loader — any restoration uses the existing authorized ingestion/service path |
| Blog content | `blog_posts` (`:980`) | No seed or importer found | **UNKNOWN** (may be empty) |
| Staff grants / admin role | `staff_grants` (`:1087`), `users.role` | Operator scripts only: `staff:bootstrap` (`scripts/bootstrap-staff.ts`, exact verified User + audit), `admin:promote` (`scripts/promote-admin.ts`). Never seeded | Live grants: **UNKNOWN**; must be re-granted to re-created Users, never copied as session/TOTP material |
| Measurement epoch/state | `measurement_state` (`:1098`, key/epoch) + env `MEASUREMENT_COLLECTOR_EPOCH` | Runtime-created | **Security lifecycle identity**, not content and not blindly reusable: reusing a historical epoch alongside stale principals/jobs could resurrect a retired identity. Preserve-vs-rotate is **UNKNOWN** until checked against the verified collector/worker identity contract; neither reuse nor rotation is authorized by this inventory |
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
  `diagnostic_centers.operationalApproval/planCode`, `brands.logoKey`.
  `history_capacity_days`/`history_provider_allowances` are daily operational
  state (§2), not blanket-protected reference. `measurement_state.epoch` is a
  security lifecycle identity (§2): protect it from casual disclosure/deletion,
  but do not reuse it until the collector/worker identity contract says to.
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
| Reference — reproduce, then verify | §1 catalog JSON families, approved §7a recovery inputs, imported logos, approved demo inventory if designated | Recreate from manifest; hash/count verify |
| Protected-config-in-DB — re-create explicitly | §4 DB-resident config, staff grants via bootstrap scripts to ordinary verified Users | Named operator action with audit; no token/session seeding; History policy inputs only if explicitly approved (§2); measurement epoch preserve-vs-rotate per verified identity contract (§2) |
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

PostgreSQL folds unquoted identifiers to lowercase, so every camelCase column
below is double-quoted (`"nameRu"`, `"brandId"`, …). All statements were
cross-checked against `packages/db/prisma/schema.prisma` at base `a43ee64e` and
are executable as written, except the one block explicitly labelled a placeholder.

```sql
-- 0. Identity guard (record, do not paste secrets): database, schema, server version
select current_database(), current_schema(), version();
select count(*) from _prisma_migrations where finished_at is not null;

-- 1. Table inventory (executable). Generate one count statement per returned
--    table_name, then classify each table per §5 before any wipe.
select table_name from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
-- PLACEHOLDER (generate per table_name above; not itself a count):
-- select '<table_name>' as table_name, count(*) from "<table_name>";

-- 2. Catalog natural-key diff inputs (compare to §1 JSON offline)
select slug, "nameRu", "nameTk", "nameEn", "logoKey" from brands order by slug;
select b.slug as brand_slug, m.slug as model_slug, m."nameRu", m."nameTk", m."nameEn"
  from models m join brands b on b.id = m."brandId" order by b.slug, m.slug;
select slug, "nameRu", "nameTk", "nameEn" from regions order by slug;
select r.slug as region_slug, c.slug as city_slug, c."nameRu", c."nameTk", c."nameEn"
  from cities c join regions r on r.id = c."regionId" order by r.slug, c.slug;
-- Lookup families stay separate: family identity and Color.hex must not be lost
-- in a UNION that conflates them.
select 'body_types' as family, "nameEn", "nameRu", "nameTk", null as "hex" from body_types order by "nameEn";
select 'colors' as family, "nameEn", "nameRu", "nameTk", "hex" from colors order by "nameEn";
select 'engine_types' as family, "nameEn", "nameRu", "nameTk", null as "hex" from engine_types order by "nameEn";
select 'transmissions' as family, "nameEn", "nameRu", "nameTk", null as "hex" from transmissions order by "nameEn";
select 'drive_types' as family, "nameEn", "nameRu", "nameTk", null as "hex" from drive_types order by "nameEn";
select "fromCurrency", "toCurrency", rate, "setByUserId" is not null as admin_set
  from exchange_rates order by "fromCurrency", "toCurrency";

-- 3. Seed-blind / decision families (natural keys only; no raw UUIDs needed here)
select b.slug as brand_slug, m.slug as model_slug,
       g."nameRu", g."nameTk", g."nameEn", g."yearStart", g."yearEnd"
  from generations g
  join models m on m.id = g."modelId"
  join brands b on b.id = m."brandId"
  order by b.slug, m.slug, g."nameEn", g."yearStart";
select code, "planCode", "operationalApproval" is not null as has_approval
  from diagnostic_centers order by code;
select c.code as center_code, t.version, t.synthetic, t."publishedAt"
  from diagnostic_template_versions t join diagnostic_centers c on c.id = t."centerId"
  order by c.code, t.version;
-- Daily operational state (§2): inventory to classify, not to preserve wholesale.
select day, "slotLimit", "morningLimit", evidence, mode from history_capacity_days order by day;
select provider, day, allowance, consumed, "resetAt", evidence, mode
  from history_provider_allowances order by provider, day;
select id, version, epoch, status, "retentionBasis" from market_knowledge_sources order by id;
select slug, locale, "publishedAt" is not null as published from blog_posts order by slug, locale;
select capability, count(*) as active_grants from staff_grants
  where "revokedAt" is null group by capability order by capability;
select key, epoch from measurement_state order by key;
select count(*) filter (where "logoKey" is not null and "logoKey" not like '%imp-%') as admin_logo_rows
  from brands;
```

Object/queue companions (read-only, counts and keys only): S3 `ListObjectsV2` +
version/multipart listing per §5 bucket (record key, size, sha256 for
`catalog-assets/brands/**` and any approved demo prefix only); BullMQ
`getJobCounts(wait,prioritized,active,delayed,failed,completed)` per §4 queue via
the watchdog's queue list; Redis `SCAN` by target prefix for counts only.
Diff rule: every live row not matched by natural key to §1 inputs or an approved
recovery input (§7) is classified `approved-reference | disposable |
protected-config | UNRESOLVED`; UNRESOLVED rows go to a restricted export and
block deletion of their family. Staging and production are compared
independently — never averaged.

## 7. Required reference manifest / recovery inputs (before any wipe)

Two distinct artefacts; do not merge them into one loader.

**(a) Catalog/reference recovery inputs** — versioned, natural-keyed, suitable
for a future validated seed path: Brand/Model/Region/City and lookup-family
names (with Color `hex` kept per family), Generation rows keyed by
`(brandSlug, modelSlug, nameEn)` with RU/TK/EN names and year ranges, approved
exchange-rate values by currency pair, and asset entries
`{brandSlug, objectKey, sha256, licence, source, approver}`. Each file carries
sha256, row counts, environment label, candidate SHA, and the §6 diff report
with every difference classified.

**(b) Decision inventory only — never direct-loader inputs:** diagnostic center
`code`/`planCode`, template `(centerCode, version)` with definition hash and
authoring provenance, `operationalApproval` presence, History *approved policy
inputs* (not consumed/holds/past-day rows), market-knowledge provenance/rights
records, staff-grant capabilities, and the measurement epoch decision (§2).
These are recorded so a founder/staff decision can be made and then executed
through the **current authenticated service/staff authoring paths**; this
inventory grants no bootstrap authority to seed rights, grants, qualified-center
approval or provider state directly. Secrets, codes, session/TOTP material and
personal data are excluded by construction. Live-value bundles stay outside the
repo; a sanitized template may be committed.

## 8. Restore order and empty/repeat-seed proof (proposal, isolated target only)

1. Verify target identity + quiescence (separate operator gate; not this task).
2. `migrate deploy` (61 migrations) on the empty DB; confirm `_prisma_migrations`.
3. Bootstrap buckets/policies (`infra/minio/bootstrap.mjs`), retaining identities.
4. Main seed (§1). Record counts; expect exactly the §1 row counts and zero Generations.
5. Apply approved catalog/reference recovery inputs (§7a) only — Generations
   and rate deltas — each with natural-key upserts. Nothing from §7b is loaded
   here.
6. `logos:import` (dry-run report first); verify `logoKey` coverage and object HEADs.
7. Separately, and only if separately approved: re-create diagnostic centers/
   templates, History policy, market-knowledge and blog content through the
   current authenticated staff/service authoring paths; re-grant staff/admin
   via `staff:bootstrap` / `admin:promote` to Users created through ordinary
   sign-in; reconstruct History synthetic day fixtures fresh (no consumed
   slots/holds carried over); decide measurement epoch preserve-vs-rotate from
   the verified collector/worker identity contract before measurement workers
   start, without importing stale principals/jobs. Re-create tester/reviewer/
   demo fixtures only if designated (each has its own guard/authorization).
8. Recompute derived Listing prices if scenario Listings were loaded
   (`listing-prices:recompute`); start workers; verify readiness + ordinary login.
9. **Repeat-seed test (semantic convergence):** run steps 4–6 a second time and
   compare §6 natural-key exports **excluding `id`, `createdAt` and `updatedAt`**;
   require hash-equal exports and zero new object versions. Do **not** require
   zero updated rows: unconditional upserts (§1) may rewrite identical values
   and refresh `@updatedAt`, which is not yet proven avoidable. Any *semantic*
   delta fails the gate — this catches the create-missing-only rate trap and
   the non-unique `nameEn` first-row trap. If write-free repeats are later
   required, add compare-before-write to the seed as a separate change and
   prove it; do not assume it here.
10. **Empty-target test:** repeat 2–9 on a second empty DB; require hash-equal
    natural-key exports to the first under the same exclusions (`id`,
    `createdAt`, `updatedAt`).

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

## 10. Next smallest implementation brief (one writer, after §9 access)

Bounded to comparison and catalog/reference recovery. No new framework, no
reset operator, and no direct loader for rights, grants, approvals or
operational state.

1. **Read-only natural-key comparison first:** a script/report that runs the §6
   queries (or their Prisma equivalents) against a read-only target and diffs
   them, by natural key, against the §1 JSON inputs plus any approved §7a
   recovery inputs, emitting the classified diff
   (`approved-reference | disposable | protected-config | UNRESOLVED`).
   It writes nothing to the target.
2. **Validated catalog/reference recovery inputs only:** add
   `packages/db/prisma/seed/generations.json` and a Generation block in
   `seed.ts` keyed by `(brandSlug, modelSlug, nameEn)`, plus schema-validated
   handling for approved exchange-rate values — populated only from reviewed
   §7a inputs, never scraped live into the repo without review, and covered by
   the §8 semantic-convergence test (exclusions in step 9).
3. Extend `logos:import --dry-run` reporting to flag admin (`non-imp-`)
   `logoKey`s as preservation blockers until a §3 asset export exists.
4. Add the §8 empty + repeat-seed test as a hosted DB test (Testcontainers
   pattern already used in `packages/db/tests`) asserting hash-equal
   natural-key exports across two runs and two empty databases, excluding
   `id`/`createdAt`/`updatedAt`.

Explicitly out of scope for that writer: seeding or loading rights/provenance
records, staff grants, qualified-center approval/`operationalApproval`,
diagnostic template publication, History consumed/capacity/provider state, or
measurement epoch reuse. Those remain decisions executed through current
authenticated service/staff authoring and the verified collector/worker
identity contract. Also out: any reset operator, backup framework, credential
handling, or changes to campaign/full-v3 machinery.
