# Release #897 reference-inventory delta, 2026-10-21

This note records source changes found after the corrected [prelaunch reference inventory](prelaunch-reference-inventory-20261021.md). It does not replace that inventory and does not claim live environment state.

## Changes that affect reset planning

- `scripts/staging-clean-reset.tables.json` now provides a committed disposition for all 91 Prisma tables plus `_prisma_migrations`. `generations` and `exchange_rates` remain in place; `measurement_state` is protected; `diagnostic_template_versions`, History capacity rows, staff grants and audit logs are disposable. A retained exchange-rate row can keep a dangling `setByUserId` because that field has no foreign key.
- Approved diagnostic templates must be inventoried or exported before any rows reset. The planner marks `diagnostic_template_versions` for deletion, while approved centers, blog posts and market-knowledge rows refuse the reset when present.
- `cf_*` campaign schemas remain in place only when classified disposed; triggers are detached and the planner records a restart blocker until inertness is proven. They are not deleted by this reset.
- The recovery state is protected: PostgreSQL `staging_clean_reset.receipts` and Redis `staging-clean-reset:receipt:<operationId>` survive the reset.
- Diagnostic identity records, provenance and evidence are disposable, with row-delete guards that require orders to be removed first when cleanup is row based. Their object keys use `diagnostic-evidence/<id>/<sha256>`.
- Redis observation covers database 0 and the owned prefixes only. Live workers, active jobs, campaign deduplication controls and unknown keys refuse. Other Redis databases and keys outside those prefixes are not evidence of emptiness.
- The remote reset currently implements inventory and row/Redis observation paths only. Object deletion, reseed and reopen executors remain absent; production is hard closed.

## Protected and disposable storage classes still requiring live inventory

Include `business-chat-private`, the configured diagnostic private bucket, the configured video private bucket, service-private `history-artifacts/<id>/<sha>` objects, all versions/delete markers and incomplete multipart uploads. Bucket policies and lifecycle rules remain protected configuration. The actual names and contents are unknown without an authorized read-only environment grant.

Protect `DIAGNOSTIC_SYNTHETIC_ENABLED`, `DIAGNOSTIC_SYNTHETIC_USER_IDS`, `DIAGNOSTIC_PRIVATE_BUCKET`, `VIDEO_PRIVATE_BUCKET`, the reset receipt schema/marker and all credentials, signing identities and infrastructure settings. Synthetic center bootstrap is staging/test-only fixture setup, not reference data.

## Open decisions and bounded next check

The founder still must confirm whether approved diagnostic templates exist and whether the measurement epoch is retained or rotated. History capacity/provider rows need an approved policy input. Before any reset, run the existing observe-only row/Redis inventory per environment, list all configured private buckets including versions and multipart uploads, enumerate Redis database numbers, and capture approved reference overlays for generations, rates, catalog edits, logos and operational authoring. All live values remain **UNKNOWN**; this note authorizes no reset, deletion, reseed, deployment or credential operation.

The source checks for this delta were read-only. No live services, Railway access, databases, object storage, queues or GitHub mutations were used.
