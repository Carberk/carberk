# 31 — Catalog

## Summary

Curated reference data — brands, models, generations, colors, regions, body types, etc. — all trilingual, admin-edited, referenced by ID from listings, garage entries, and saved searches.

## Why it exists

Without curated catalog data, every listing devolves into freeform text. Search becomes impossible; filters break; the user picker becomes a guess. By controlling the catalog, we get:

- Reliable filtering
- Visual brand recognition (logos)
- Consistent translations
- Clean URLs (`/listings?brand=toyota` not `?brand=Тойота`)

## What it does (user-visible behavior)

### User-facing (mobile + web)

- **Brand picker**: search by name; categorized ("Iномарки" / "Китайские" / "Отечественные"); popular ones surfaced first; tap to drill down to Model
- **Model picker**: filtered by selected Brand; search by name
- **Generation picker**: filtered by Model; shows year range; tap to see generation photo
- **Color picker**: swatches (visual circles with hex) + name; tap to select
- **Region picker**: TM regions list; tap to drill down to cities
- All picker labels resolve to user's preferred locale
- Manufacturer marks identify the selected brand beside its localized name. Source selection is based on brand identity and usable artwork; a fixed license-category allowlist does not restrict identifying coverage. Retain source records and integrity pins internally.
- Generic category rows use category illustrations, while an unverified manufacturer emblem may use an explicitly recorded full-name label. Neither is presented as recovered official manufacturer artwork.

### Admin-facing

- **CRUD all catalog tables** with trilingual fields
- **Brand logo upload** (Cloudinary-style on-the-fly resize ideal; minimal pre-generated variants OK)
- **Reorder display order** (drag-drop)
- **Mark active/inactive** (inactive = hidden from picker, but historical listings still display correctly)

## Screens / states

| Screen | State | Notes |
|---|---|---|
| Brand picker | Empty search | Show categories + popular |
| Brand picker | Searching | Filter as user types; debounced 200ms |
| Brand picker | No results | "Brand not in catalog — contact us to add it" |
| Model picker | Default | Models scoped to brand, alphabetical with popular flagged |
| Region picker | Default | TM regions list; each expands to cities |
| Admin: edit Brand | Default | 3 name fields (RU/TK/EN), slug, logo upload, isActive toggle |
| Admin: edit Brand | Validation error | Slug must be unique; name fields all required |

## Data references

- `apps/api/src/modules/catalog/CONTEXT.md`
- Entities: `Brand`, `Model`, `Generation`, `Color`, `BodyType`, `EngineType`, `Transmission`, `DriveType`, `Region`, `City`
- Seed data: `packages/db/prisma/seed/*.json` (ported from old `cars.brands.json`)

## Decisions

- [ADR-0007](../../adr/0007-i18n.md) — Trilingual columns
- [ADR-0001](../../adr/0001-architecture.md) — Catalog as its own bounded context

## Phase

**Phase 1.**

## Out of scope

- User-submitted catalog requests (admin adds manually if needed)
- Auto-import from external VIN decoders (Phase 2+ when proxy is stable)
- Pricing data / market value estimation per model

## Open questions

- How many models / generations to seed at launch? (Top 200 brands × top 5 models each? More?)
- Should we differentiate "trim" levels below generation? Auto.ru does. Likely yes for Phase 2.
- Body type icons — license a set or design our own?
