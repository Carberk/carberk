# Restricted Identity fixture and retained campaign schemas

Bounded fixture correction on accepted `bff24377cb03819336abb0f9205e2b51a0a04673`, tree `2feb3fc08a512e876bb360afd1831296ce385f91`. Historical production correction `36c7c7d49631189af2c7e550649131248c8afb57` and accepted Identity 22/22 remain preserved, without an unchanged full-suite rerun. B1/G1 remain open.

## Hosted evidence

Run 40277574871, API job 121423538150 at 14cd, reports the restricted Identity role failing with schema `42501` and 39 grouped Catalog failure headers. Raw log SHA-256 is `1146a4a69918d13afadafb2607e2d4e7f975f2112a38e12eabca3867c1cd5491`.

Newer exact-bff run 40281471917, API job 121435583862, still reports Identity's `42501` at line 19382 onward. Its raw log SHA-256 is `848608ddc2037be65088a66801a4b6edd87ba23fdf26a2d15eff957f362d8b56`. Catalog is explicitly 39/39 passed in 3447 ms at line 6613. No Catalog fix or source/order-fixture causal attribution is established by those distinct observations. No Catalog file was edited.

## Exact Identity boundary

A disposable PostgreSQL 16.15 database migrated from this checkout and seeded with the unchanged full-v3 fixture program for reservation `d901d901d901d901d901d901d901d901` reproduces the same error in the existing left-first refresh case. The campaign schema is owned by `auto_tm_ci`, has no public schema ACL, and retains enabled `track_business` triggers. The Identity fixture's `r2_identity_*` role is deliberately nonowner, nonsuperuser and NOINHERIT; its existing grants cover only `public`.

The failing application statement is:

```sql
SELECT public.diagnostic_prepare_source($1::jsonb)::text AS receipt
```

The PostgreSQL error context is `diagnostic_source_insert_receipt` → `campaign_prepare` → `campaign_preparation_insert` → `campaign_preparation_scope` → `campaign_row_namespaces`. The final invoker-side dynamic statement is:

```sql
SELECT CASE WHEN count(*)=1 THEN jsonb_agg(to_jsonb(m))->0 ELSE NULL END
FROM cf_d901d901d901d901d901d901d901d901.campaign_manifest m
```

Both public functions are SECURITY INVOKER with `search_path=pg_catalog,public`; the campaign table is explicitly schema-qualified, so changing search_path cannot repair the missing privilege. Files on one API worker share retained campaign schemas. The failure occurs before the refresh preparation barrier or token mutation. It is distinct from expiry, CAS or the prior projection/upsert defects.

## Fixture correction

Only `IdentityAuthorityPrepared.e2e.spec.ts` changes. After creating its restricted role, the fixture discovers active `track_auth`/`track_business` namespaces through the same bounded catalog facts, restricted to `cf_[a-f0-9]{32}` schemas on public tables. It grants USAGE on those schemas and SELECT on exactly `campaign_manifest`, `campaign_records`, `campaign_entities`, and an existing `campaign_object_ledger`.

The fourth table is necessary because full-v3 classification checks foreign media references on source rows. The first three-table correction advanced past the schema error and exposed `permission denied for table campaign_object_ledger`; PostgreSQL logged the exact UNION against that ledger. No ALL TABLES grant, campaign write grant, schema-create grant, ownership change, function change or guard relaxation was added. Existing nonowner/nonsuperuser assertions remain. Additional assertions prove schema CREATE and INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges on every selected campaign table remain false. Existing teardown drops all grants owned by the temporary role and restores inherited trigger states.

## Actual checks and limits

Configured contract and DB builds completed before diagnosis. The runtime uses the package's built `dist/src` exports, not stale raw shared TypeScript; artifact hashes and trace paths are recorded in the handoff. API TS7/TS6, focused ESLint, runtime imports and diff check pass.

The same selected refresh case is red before the correction and green after the four-table read-only correction: final 1 passed, 0 failed, 21 filtered tests. The original refresh result and stored token assertions remain intact. This is affected-case evidence, not a new 22/22 claim. Each corrected runtime check used a fresh migrated database with the same retained campaign fixture. A reused-database attempt stopped in setup because the suite intentionally retains its scenario rows; it supplies no behavioral result.

One clean-database Catalog representative passed before the later hosted update. One already-launched contaminated-database diagnostic then failed at unscoped user cleanup with `Campaign roots retained until disposal`, not the historical anchor error. An attempted lawful anchor witness was rejected at command parsing and created no anchor. Those observations do not explain the historical 39 grouped headers and are not a Catalog fix. The newer hosted green supersedes that investigation. A single earlier campaign provenance test stopped at `campaign_preparation_dormant`; its worker database was removed by the configured harness and it is not acceptance evidence. No further Catalog or campaign test was run.

The final disposable database shows 284 inherited managed guards restored to D, no temporary Identity role, no campaign grants left for that role, and zero source receipts. Task-owned PostgreSQL/Redis/MinIO containers, volumes and network are removed after evidence capture. Parent owns remaining affected/full-suite execution and any deployment role-policy decisions. No production, kernel, parser, schema, migration, shared profile, R8, claims or NEW12000 disposal source was edited.
