-- Forward-only metadata evaluation. The sole registry and all graph/lock/effect
-- functions remain unchanged. Reversal requires a new forward migration.
DO $install$
DECLARE registry jsonb := public.diagnostic_source_registry(); metadata jsonb;
BEGIN
 -- Installation drift safety, not a new runtime meaning for duplicate names.
 -- Compare the complete existing77-entry value before replacing any function.
 IF jsonb_typeof(registry) IS DISTINCT FROM 'array'
  OR jsonb_array_length(registry)<>77
  OR EXISTS (SELECT 1 FROM jsonb_array_elements(registry) entry
   WHERE jsonb_typeof(entry->'table') IS DISTINCT FROM 'string')
  OR (SELECT count(DISTINCT entry->>'table') FROM jsonb_array_elements(registry) entry)<>77
  OR md5(registry::text)<>'af2112af42595e4b6d5045a4e7886303' THEN
  RAISE EXCEPTION 'diagnostic_source_registry_metadata_drift';
 END IF;
 SELECT jsonb_object_agg(entry->>'table',entry) INTO metadata
 FROM jsonb_array_elements(registry) entry;
 -- Derive the immutable constant at installation, never a second registry source.
 EXECUTE format($definition$
  CREATE FUNCTION public.diagnostic_source_registry_map() RETURNS jsonb
  LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public
  AS %L
 $definition$, 'SELECT '||quote_literal(metadata::text)||'::jsonb');
END $install$;

-- PL/pgSQL caches this immutable no-argument expression in its prepared plan.
-- Dynamic table names therefore reuse the exact map without re-expanding the
-- registry per row. Unknown names and SQL NULL retain SQL NULL results.
-- CREATE OR REPLACE preserves the existing metadata function's owner and ACL.
CREATE OR REPLACE FUNCTION public.diagnostic_source_meta(t text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE metadata jsonb := public.diagnostic_source_registry_map();
BEGIN
 RETURN metadata->t;
END $$;
