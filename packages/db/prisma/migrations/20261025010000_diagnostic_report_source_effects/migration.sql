-- Complete the existing report writer's finite child effects. No guard activation,
-- admission change, discovery/locking change or exemption from exact row plans.
ALTER FUNCTION public.diagnostic_source_allows(text,text,text)
 RENAME TO diagnostic_source_allows_before_report_effects;
CREATE FUNCTION public.diagnostic_source_allows(op text,t text,v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
 SELECT public.diagnostic_source_allows_before_report_effects(op,t,v)
  OR (op='report_change' AND ((t='diagnostic_evidence' AND v='update')
    OR (t='diagnostic_pdf_artifacts' AND v='insert')))
$$;
