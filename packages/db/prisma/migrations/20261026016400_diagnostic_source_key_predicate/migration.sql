-- Forward-only per-key predicate. Every read and lock still runs fresh at its
-- existing point; no pass, guard, closure or cap changes. Reversal requires a
-- new forward migration.
DO $install$
DECLARE e jsonb; col text; nondeterministic boolean := false;
BEGIN
 -- Typed equality matches to_jsonb containment only for text keys under a
 -- deterministic collation that an exact unique index serves.
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_registry()) LOOP
  IF jsonb_typeof(e->'pk') IS DISTINCT FROM 'array' OR jsonb_array_length(e->'pk')=0
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(e->'pk') p WHERE jsonb_typeof(p) IS DISTINCT FROM 'string')
   OR NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=to_regclass('public.'||quote_ident(e->>'table')) AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") FROM pg_attribute a WHERE a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey))
     =(SELECT array_agg(p ORDER BY p COLLATE "C") FROM jsonb_array_elements_text(e->'pk') p)) THEN
   RAISE EXCEPTION 'diagnostic_source_key_predicate_drift';
  END IF;
  FOR col IN SELECT jsonb_array_elements_text(e->'pk') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||quote_ident(e->>'table')) AND a.attname=col
    AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND a.atttypid='text'::regtype) THEN
    RAISE EXCEPTION 'diagnostic_source_key_predicate_drift';
   END IF;
   nondeterministic := nondeterministic OR EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_collation c ON c.oid=a.attcollation
    WHERE a.attrelid=to_regclass('public.'||quote_ident(e->>'table')) AND a.attname=col AND NOT c.collisdeterministic);
  END LOOP;
 END LOOP;
 IF nondeterministic THEN RAISE EXCEPTION 'diagnostic_source_key_collation'; END IF;
 -- Replace only exact, current statement texts.
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.diagnostic_source_read(text,jsonb)'::regprocedure)<>'3135b3f7b944bad3fa757e1473b72577'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.diagnostic_source_insert_receipt()'::regprocedure)<>'f57a7752b5c14a80745f7910c9a936a4'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.campaign_preparation_scope(jsonb)'::regprocedure)<>'3f85a8843e0f7ee2cd09f93349c22861' THEN
  RAISE EXCEPTION 'diagnostic_source_key_predicate_drift';
 END IF;
END $install$;

-- Exact registry key with only JSON string values: equality on the text key
-- columns, served by their unique index. Any other shape, NULL or unknown
-- table keeps the original containment text.
CREATE FUNCTION public.diagnostic_source_key_predicate(t text,k jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 -- CASE branches run in order, so object-only functions never see other shapes.
 SELECT CASE WHEN jsonb_typeof(k) IS DISTINCT FROM 'object' THEN 'to_jsonb(s) @> $1'
  WHEN EXISTS(SELECT 1 FROM jsonb_each(k) x WHERE jsonb_typeof(x.value)<>'string') THEN 'to_jsonb(s) @> $1'
  WHEN (SELECT array_agg(f ORDER BY f COLLATE "C") FROM jsonb_object_keys(k) f)
    =(SELECT array_agg(p ORDER BY p COLLATE "C") FROM jsonb_array_elements_text(public.diagnostic_source_meta(t)->'pk') p)
  THEN (SELECT string_agg(format('s.%I=$1->>%L',p,p),' AND ' ORDER BY p COLLATE "C") FROM jsonb_array_elements_text(public.diagnostic_source_meta(t)->'pk') p)
  ELSE 'to_jsonb(s) @> $1' END
$$;

-- CREATE OR REPLACE from each current definition preserves owner, ACL,
-- volatility and search_path; exactly one statement text changes per body.
DO $replace$
DECLARE site record; definition text;
BEGIN
 FOR site IN SELECT * FROM (VALUES
  ('public.diagnostic_source_read(text,jsonb)',
   $s$format('SELECT to_jsonb(s) FROM public.%I s WHERE to_jsonb(s) @> $1',t)$s$,
   $s$format('SELECT to_jsonb(s) FROM public.%I s WHERE ',t)||public.diagnostic_source_key_predicate(t,k)$s$),
  ('public.diagnostic_source_insert_receipt()',
   $s$format('SELECT 1 FROM public.%I s WHERE to_jsonb(s) @> $1 FOR UPDATE',t)$s$,
   $s$format('SELECT 1 FROM public.%I s WHERE ',t)||public.diagnostic_source_key_predicate(t,k)||' FOR UPDATE'$s$),
  ('public.campaign_preparation_scope(jsonb)',
   $s$format('SELECT to_jsonb(s) FROM public.%I s WHERE to_jsonb(s) @> $1',t) INTO old_row$s$,
   $s$format('SELECT to_jsonb(s) FROM public.%I s WHERE ',t)||public.diagnostic_source_key_predicate(t,e->'key') INTO old_row$s$)
 ) v(fn,old_text,new_text) LOOP
  definition := pg_get_functiondef(site.fn::regprocedure);
  IF array_length(string_to_array(definition,site.old_text),1)<>2 THEN RAISE EXCEPTION 'diagnostic_source_key_predicate_drift'; END IF;
  EXECUTE replace(definition,site.old_text,site.new_text);
 END LOOP;
END $replace$;
