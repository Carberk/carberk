-- Finite moderation intent for the existing SuspendUser/UnsuspendUser behavior.
-- Forward-only expansion. Guards remain DISABLED; no callers, activation,
-- automatic admission, backfill, policy change or account-operation alias.
-- Recovery requires a new forward migration, never restoring revoked Sessions.

-- Protect the entire moderation projection, including attribution and reason.
-- suspendedById already has its actual User FK in the retained registry.
ALTER FUNCTION public.diagnostic_source_registry() RENAME TO diagnostic_source_registry_before_moderation;
CREATE FUNCTION public.diagnostic_source_registry() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(CASE WHEN m->>'table'='users' THEN jsonb_set(m,'{fields}',m->'fields'||'["suspendedById","suspensionReason"]'::jsonb) ELSE m END ORDER BY i)
 FROM jsonb_array_elements(public.diagnostic_source_registry_before_moderation()) WITH ORDINALITY x(m,i)
$$;
ALTER FUNCTION public.diagnostic_source_guard_specs() RENAME TO diagnostic_source_guard_specs_before_moderation;
CREATE FUNCTION public.diagnostic_source_guard_specs() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(CASE WHEN m->>'table'='users' THEN jsonb_set(m,'{update}',m->'update'||'["suspendedById","suspensionReason"]'::jsonb) ELSE m END ORDER BY i)
 FROM jsonb_array_elements(public.diagnostic_source_guard_specs_before_moderation()) WITH ORDINALITY x(m,i)
$$;
DO $install$
DECLARE columns text;
BEGIN
 SELECT string_agg(format('%I',f),',' ORDER BY i) INTO columns FROM jsonb_array_elements(public.diagnostic_source_guard_specs()) m,
  LATERAL jsonb_array_elements_text(m->'update') WITH ORDINALITY x(f,i) WHERE m->>'table'='users';
 DROP TRIGGER zz_diagnostic_source_presence ON public.users;
 DROP TRIGGER zz_diagnostic_source_target ON public.users;
 EXECUTE format('CREATE TRIGGER zz_diagnostic_source_presence BEFORE DELETE OR UPDATE OF %s ON public.users FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_statement_guard()',columns);
 EXECUTE format('CREATE TRIGGER zz_diagnostic_source_target BEFORE UPDATE OF %s ON public.users FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_row_guard(''target'')',columns);
 ALTER TABLE public.users DISABLE TRIGGER zz_diagnostic_source_presence;
 ALTER TABLE public.users DISABLE TRIGGER zz_diagnostic_source_target;
END $install$;

ALTER FUNCTION public.diagnostic_source_allows(text,text,text) RENAME TO diagnostic_source_allows_before_moderation;
CREATE FUNCTION public.diagnostic_source_allows(op text,t text,v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN op='user_eligibility' THEN t='users' AND v='update'
 ELSE public.diagnostic_source_allows_before_moderation(op,t,v) END
$$;
ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_moderation;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; r jsonb; prior jsonb; target jsonb;
BEGIN
 -- Use the effective intake -> purge -> kernel parser with the real operation.
 -- It validates the full expected/next projection, stale row, keys and fields.
 -- account_schedule/restore restrictions and purge intent remain unchanged.
 parsed:=public.diagnostic_source_parse_before_moderation(c);
 IF parsed->>'operation'<>'user_eligibility' THEN RETURN parsed; END IF;
 r:=parsed->'rows'->0; prior:=r->'expected'->'source'; target:=r->'next';
 IF jsonb_array_length(parsed->'rows')<>1 OR jsonb_array_length(parsed->'roots')<>1
  OR parsed->'roots'->0 IS DISTINCT FROM jsonb_build_object('table','users','key',r->'key')
  OR parsed->'cutoff'<>'null' OR parsed->>'actorUserId' IS NULL
  OR (prior-ARRAY['suspendedAt','suspendedById','suspensionReason']) IS DISTINCT FROM (target-ARRAY['suspendedAt','suspendedById','suspensionReason'])
  OR (
   (prior->>'suspendedAt' IS NULL AND target->>'suspendedAt' IS NOT NULL
    AND target->>'suspendedById'=parsed->>'actorUserId'
    AND jsonb_typeof(target->'suspensionReason')='string')
   OR (prior->>'suspendedAt' IS NOT NULL AND target->>'suspendedAt' IS NULL
    AND target->'suspendedById'='null' AND target->'suspensionReason'='null')
  ) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_moderation_intent'; END IF;
 RETURN parsed;
END $$;

-- Suspension deletes ALL actual Sessions in the same outer transaction.
-- Unsuspension changes only the User and never restores or deletes a Session.
-- The command still has exactly one caller row. These effects are derived on
-- each discovery and after lock waits, not accepted from JSON or added late.
ALTER FUNCTION public.diagnostic_source_fk_effects(jsonb) RENAME TO diagnostic_source_fk_effects_before_moderation;
CREATE FUNCTION public.diagnostic_source_fk_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; sessions jsonb:='[]'; r record; physical jsonb;
BEGIN
 effects:=public.diagnostic_source_fk_effects_before_moderation(c);
 IF c->>'operation'='user_eligibility' AND c->'rows'->0->'next'->>'suspendedAt' IS NOT NULL THEN
  FOR r IN SELECT to_jsonb(s) row FROM public.sessions s WHERE s."userId"=c->'rows'->0->'key'->>'id' ORDER BY s.id LOOP
   sessions:=sessions||jsonb_build_array(public.diagnostic_purge_effect('sessions',r.row,'{}',true));
   IF jsonb_array_length(sessions)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
  END LOOP;
  -- The actual Session FKs delete video grants, push subscriptions and requests.
  -- Request IDs on surviving consumed reports are logical retry minima, not FKs
  -- to those requests. No Session/request-delete trigger clears that pair.
  -- Keep it unchanged rather than demanding an invented report mutation from
  -- the broader historical Session helper. No caller Session row is admitted.
  physical:=public.diagnostic_source_fk_effects_before_moderation(
   c||jsonb_build_object('operation','session_change','rows',sessions));
  effects:=effects||sessions||coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(physical)
   WHERE value->>'table' IN ('video_grants','service_push_subscriptions','diagnostic_continuity_requests')),'[]');
 END IF;
 -- Existing finite-FK scope roots every effect before discovery/locking; its
 -- effect union enforces final targets and recomputes original invalidations.
 RETURN (SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') FROM (SELECT DISTINCT value FROM jsonb_array_elements(effects)) d);
END $$;

-- Cover the actual FK children under the same receipt, including dependency-
-- only tables. Keep every prior finite operation and anchor exclusion intact.
CREATE OR REPLACE FUNCTION public.diagnostic_purge_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text
  AND (command->>'operation'='account_purge' OR (command->>'operation'='staff_bootstrap' AND TG_TABLE_NAME='audit_logs')
   OR (command->>'operation' IN ('session_change','listing_delete','account_schedule','account_restore','user_eligibility') AND TG_TABLE_NAME<>'diagnostic_source_anchors')
   OR (command->>'operation' IN ('member_create','member_replace') AND TG_TABLE_NAME IN ('dealerships','measurement_state')))) THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- No User/Session sticky transition is installed. Original User/Session proof
-- invalidators, exact row guards, completion and deferred must-finish stay live.
