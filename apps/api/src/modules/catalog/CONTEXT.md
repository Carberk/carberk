# Catalog

Catalog owns shared reference data used by listings and other domains. Public reads use localized data; admin writes are narrower than the complete product specification. Inspect controllers for supported operations rather than assuming every schema entity has CRUD endpoints.

Preserve stable IDs used by persisted listings and seed idempotence. Names are trilingual; locale fallback and Accept-Language handling must remain consistent with contracts. Model/Brand and City/Region ownership matter when validating references. Generation data is not supplied by the current seed, so nullable generation selection must remain supported.

Seed inputs and migrations are operational data. An old data snapshot is not permission to overwrite current catalog records. Cross-context callers use catalog ports rather than importing repositories.

## Brand logos

A Brand may have a logo. `Brand.logoKey` is an object key in the `catalog-assets` MinIO bucket, whose anonymous read policy covers only `brands/*`, laid out as `brands/<slug>/v<epoch-ms>-<uuid>/logo.<png|webp>` (legacy `v<epoch-ms>` directories stay valid while active). Keys are versioned and immutable, every activation gets a directory that has never been active, so a replaced logo gets a new URL. `GET /api/v1/catalog/brands` returns `logoUrl` (built from `MINIO_PUBLIC_URL`, with each object-key path segment URL-encoded) only for brands with a key; clients show a letter fallback otherwise.

Admins (AdminGuard) upload through the ADR-0008 presigned path. `POST /api/v1/admin/catalog/brands/:id/logo/presign` (`{ contentType, sizeBytes }`) returns a PUT URL for private `pending/brands/<slug>/<uuid>` objects and the headers to send, including `Content-Disposition: attachment` as defense in depth. The PUT signature binds the declared byte length; the HTTP transport supplies Content-Length from the exact binary body. `PUT /api/v1/admin/catalog/brands/:id/logo` (`{ key }`) then reads that object back, validates it, stores the logo, and deletes the pending object whether or not it was accepted. `DELETE` on the same path clears the logo.

Accepted files are SVG, PNG, or WebP, at most 200 KB, whose decoded format matches the declared type and whose sides are within 1:1.25. **SVG is never served:** it is rendered to a 256 px PNG. Before rendering, an SVG is rejected if it has a DOCTYPE, any namespace-prefixed element, scripts, event handlers, animation elements, `foreignObject`, embedded images, CSS escapes or `@import`, or any non-`#` reference. That check runs on the raw text, before XML character references are decoded, so it is defense in depth. What keeps the renderer from reading files is that librsvg gets the SVG as a buffer with no base URL and refuses `file:` and relative references; a `data:` URL can still render, and it is self-contained. `SharpLogoImageProcessor.spec.ts` pins that behaviour. Rejections are 400 `VALIDATION_FAILED` with `details.reason`, one of the `BrandLogoRejectionReason` values in `@auto-tm/contracts`.

Replacing, removing, or deleting a Brand swaps or deletes in one short database-only transaction that locks the Brand row and returns the key it actually replaced; the whole stored version directory of that key is then deleted best effort (all pages, batches of at most 1,000 keys), parsed from the stored key rather than the current slug. No storage call runs inside the transaction. A transaction-local four-second PostgreSQL statement timeout cancels blocked row-lock queries before Prisma's five-second transaction deadline; the transaction rolls back without returning cleanup work. A failed or partial delete is logged with its key and does not undo the change. An uploaded candidate is deleted only when the repository positively reports the brand was not updated; any other failure may have committed, so it is kept. Pending uploads that are never confirmed become eligible for lifecycle expiration after one day; MinIO scanning may delete them later. Whole-prefix cleanup is best effort, not a zero-orphan guarantee: concurrent importer repair, crashes, lost compare-and-swap and uncertain storage requests can leave inactive files, but never an active logo's object ([ADR-0072](../../../../../docs/adr/0072-imported-logo-cleanup-coordination.md)). Old API logo writers and deterministic importer processes must stop before whole-prefix deletion is enabled. Set and remove write `CATALOG_BRAND_LOGO_SET` / `CATALOG_BRAND_LOGO_REMOVE` audit entries. The rules live in [BrandLogo](domain/BrandLogo.ts); storage and image work sit behind the `BrandLogoStorage` and `LogoImageProcessor` ports.

### Imported logos

Most seeded brands get their logo from the operator script `pnpm --filter @auto-tm/db logos:import` (see the [db overview](../../../../../packages/db/CONTEXT.md)), not from an admin. An imported logo lives in `brands/<slug>/imp-<hash12>-<uuid>/` (legacy `imp-<hash>/` while active). `logo.png` is what `Brand.logoKey` points at, a 90 px black-on-transparent mask. Beside it are `mono@1x.png`, `mono@2x.png` and `mono@3x.png` at 30, 60 and 90 px, all with the same immutable caching. The `imp-` version segment, read from the stored key even after a brand rename, is how the script tells its own logos from an admin's `v<epoch-ms>-<uuid>` upload. Masks are alpha-only so the app can tint one asset for either theme; no SVG is stored or served.

Identifying artwork is selected by correct manufacturer identity, not a source license-category allowlist. The manifest records the source URL, retrieval date and checksum. Existing Simple Icons and Commons sources remain pinned; additional cleaned masters are bundled in the repository. Generic catalog categories use explicitly identified category illustrations. Ozan currently uses its full name as an identifying label because a manufacturer emblem has not been verified; it is not recorded as recovered manufacturer artwork.

The importer renders selected marks as theme-tinted PNG masks and rejects empty renders. Wide manufacturer wordmarks remain eligible and must be checked in the coverage contact sheet. A changed master gets a new version. `source: null` still prevents a new import while preserving an existing key; use the admin removal action to restore the letter fallback for an already-imported logo. The importer retains previous imported versions and uncertain candidate uploads and never reactivates a directory. Forced replacement deletes the previous admin directory after the database swap, reporting deletion failures without undoing the replacement.

An admin replacing, removing or deleting an imported logo removes all four files of its directory. Late repair of a just-removed directory can recreate inactive files; that is the accepted ADR-0072 limitation. Source selection changes do not weaken those replacement and cleanup rules.

## Search

`GET /api/v1/catalog/search?q=&locale=` runs one public search over brands and models together, capped at 20 results. It is served from a per-process in-memory snapshot (`CatalogSearchIndex`) loaded through the brand/model repository ports; the admin Brand/Model write use-cases invalidate the snapshot after a successful mutation. No Postgres extension or outbound service is involved.

Matching rules live in pure domain functions ([CatalogSearchMatcher](domain/CatalogSearchMatcher.ts), [YearQueryParser](domain/YearQueryParser.ts)):

- Normalization: lowercase, Unicode NFD with combining marks stripped (folds the Turkmen letters ä/ç/ň/ö/ş/ü/ý/ž and also й→и), ё→е, punctuation collapsed to spaces.
- Transliteration: Cyrillic↔Latin in both directions, so "toyota" matches "Тойота" and "камри" matches "Camry".
- Tiers: exact > prefix > one forgiven edit (only for words of 4+ letters). Multi-token queries match token by token; a model also matches on its combined "Brand Model" names. Ties put brands before models.
- Years: standalone four-digit tokens are year candidates. Candidates in [1950, current year + 1] become `yearFrom`/`yearTo` (a "2014-2019" style range with hyphen, en or em dash included). Outside that range, a token exactly naming a numeric catalog model is retained when the remaining query matches its brand/model context; unrelated invalid-year tokens and invalid ranges are ignored. Valid years retain priority even when a model has the same numeric name. Digits glued to letters ("B2000") are name text, never years. A bare year query returns only the range with empty results.
- An empty or one-character query returns an empty result list, not an error.

Response items are `{ kind: "brand" | "model", brandId, modelId?, label, brandLabel?, localeFallback? }` with the same locale fallback order as the list endpoints.

## Start here

- [Module composition](catalog.module.ts)
- [Read/write use-cases and tests](application)
- [Public reads and integration tests](presentation/catalog.controller.ts)
- [Catalog ports](domain/ports)
- [Seed implementation](../../../../../packages/db/src/seed.ts)
- [Target capability](../../../../../docs/prd/features/31-catalog.md)
- [Schema](../../../../../packages/db/prisma/schema.prisma)
