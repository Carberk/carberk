-- Complete the existing admin transaction without widening caller row authority.
-- Dormant, forward only. No activation, caller integration, policy or backfill.
-- Session deletion has no report-pair FK. Privacy clearing remains owned by
-- diagnostic_consumed_request_binding on real report erasure/author removal.
ALTER FUNCTION public.diagnostic_source_fk_effects(jsonb) RENAME TO diagnostic_source_fk_effects_before_complete_moderation;
CREATE FUNCTION public.diagnostic_source_fk_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; i jsonb:=c->'intent'; r jsonb; prior jsonb; target jsonb;
 report_row jsonb; message_row jsonb; before_state jsonb; after_state jsonb; details jsonb; audit_row jsonb; uid text;
BEGIN
 effects:=public.diagnostic_source_fk_effects_before_complete_moderation(c);
 IF c->>'operation'='session_change' THEN
  -- Remove only the invented surviving consumed-report pair clear. Keep all
  -- physical cascades, Session/TOTP children and original invalidations.
  SELECT coalesce(jsonb_agg(e),'[]') INTO effects FROM jsonb_array_elements(effects) e
   WHERE NOT (e->>'table'='diagnostic_reports' AND e->>'verb'='update' AND e->>'derived'='purge'
    AND e->'expected'->'source'->>'continuityRequestId' IS NOT NULL
    AND e->'next' IS NOT DISTINCT FROM public.diagnostic_source_normalize('diagnostic_reports',
     (e->'expected'->'source')||jsonb_build_object('continuityRequestId',NULL,'continuityRequestSessionId',NULL)));
 END IF;
 IF c->>'operation'<>'user_eligibility' OR i IS NULL THEN RETURN effects; END IF;
 r:=c->'rows'->0; prior:=r->'expected'->'source'; target:=r->'next'; uid:=r->'key'->>'id';
 before_state:=public.diagnostic_source_project(prior,'["suspendedAt","suspendedById","suspensionReason"]');
 after_state:=public.diagnostic_source_project(target,'["suspendedAt","suspendedById","suspensionReason"]');
 -- Existing audit repositories serialize application Date values as ISO UTC
 -- strings, whereas physical source projections use timestamp JSON strings.
 IF prior->>'suspendedAt' IS NOT NULL THEN before_state:=jsonb_set(before_state,'{suspendedAt}',
  to_jsonb(to_char((prior->>'suspendedAt')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))); END IF;
 IF target->>'suspendedAt' IS NOT NULL THEN after_state:=jsonb_set(after_state,'{suspendedAt}',
  to_jsonb(to_char((target->>'suspendedAt')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))); END IF;
 details:=jsonb_build_object('reason',i->'reason','before',before_state,'after',after_state);
 IF i ? 'report' THEN
  report_row:=public.diagnostic_source_read('content_reports',jsonb_build_object('id',i->'report'->'id'));
  IF report_row IS NULL OR report_row->>'status'<>'pending' OR target->>'suspendedAt' IS NULL THEN
   RAISE EXCEPTION 'diagnostic_source_moderation_intent'; END IF;
  IF report_row->>'targetType'='message' THEN
   message_row:=public.diagnostic_source_read('messages',jsonb_build_object('id',report_row->'targetId'));
   -- Same existing live-sender precedence and matching-snapshot fallback as
   -- reportedMessageSenderId. Neither a foreign snapshot nor a stale live
   -- sender can authorize actioning a report against this User.
   IF coalesce(message_row->>'senderId',CASE WHEN report_row->'messageContext'->>'messageId'=report_row->>'targetId'
    THEN report_row->'messageContext'->>'senderId' END) IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'diagnostic_source_moderation_intent'; END IF;
   details:=details||jsonb_build_object('messageId',report_row->'targetId');
  ELSIF (report_row->>'targetType'='user' AND report_row->>'targetId'=uid) IS NOT TRUE THEN
   RAISE EXCEPTION 'diagnostic_source_moderation_intent';
  END IF;
  details:=details||jsonb_build_object('reportId',report_row->'id',
   'before',before_state||jsonb_build_object('reportStatus','pending'),
   'after',after_state||jsonb_build_object('reportStatus','actioned'));
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('content_reports',report_row,
   jsonb_build_object('status','actioned','reviewedById',c->'actorUserId','reviewedAt',i->'report'->'reviewedAt')));
 END IF;
 audit_row:=jsonb_build_object('id',i->'auditId','actorId',c->'actorUserId',
  'action',CASE WHEN target->>'suspendedAt' IS NULL THEN 'USER_UNSUSPEND' ELSE 'USER_SUSPEND' END,
  'targetType','user','targetId',uid,'details',details,'createdAt',transaction_timestamp()::timestamp(3));
 IF public.diagnostic_source_read('audit_logs',jsonb_build_object('id',i->'auditId')) IS NOT NULL THEN
  RAISE EXCEPTION 'diagnostic_source_moderation_audit_collision'; END IF;
 effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('audit_logs',audit_row,'{}')||jsonb_build_object('verb','insert','expected','absent'));
 RETURN effects;
END $$;

ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_complete_moderation;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; i jsonb:=c->'intent'; r jsonb;
BEGIN
 IF c->>'operation'<>'user_eligibility' OR NOT c ? 'intent' THEN
  RETURN public.diagnostic_source_parse_before_complete_moderation(c); END IF;
 IF (jsonb_typeof(i)='object' AND i-ARRAY['auditId','reason','report']='{}'
  AND i ?& ARRAY['auditId','reason'] AND jsonb_typeof(i->'auditId')='string'
  AND i->>'auditId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  AND jsonb_typeof(i->'reason')='string' AND length(btrim(i->>'reason')) BETWEEN 1 AND 1000) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_moderation_intent'; END IF;
 parsed:=public.diagnostic_source_parse_before_complete_moderation(c-'intent');
 r:=parsed->'rows'->0;
 -- Suspension reason is the actual User reason. Unsuspension reason belongs
 -- only to its audit, while all three restored User fields are null.
 IF r->'next'->>'suspendedAt' IS NOT NULL AND i->'reason' IS DISTINCT FROM r->'next'->'suspensionReason' THEN
  RAISE EXCEPTION 'diagnostic_source_moderation_intent'; END IF;
 IF i ? 'report' THEN
  IF (jsonb_typeof(i->'report')='object' AND i->'report'-ARRAY['id','reviewedAt']='{}'
   AND (i->'report') ?& ARRAY['id','reviewedAt']
   AND jsonb_typeof(i->'report'->'id')='string' AND length(i->'report'->>'id')>0
   AND jsonb_typeof(i->'report'->'reviewedAt')='string') IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_moderation_intent'; END IF;
  -- Normalize once to the physical owner's TIMESTAMP(3), like source rows.
  i:=jsonb_set(i,'{report,reviewedAt}',to_jsonb((i->'report'->>'reviewedAt')::timestamp(3)));
 END IF;
 parsed:=parsed||jsonb_build_object('intent',i);
 -- Validate actual report/message matching and the absent preallocated audit
 -- before mutation, and again during fresh discovery after lock waits.
 PERFORM public.diagnostic_source_fk_effects(parsed);
 RETURN parsed;
END $$;

ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_complete_moderation;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE report_row jsonb; roots jsonb:=c->'roots';
BEGIN
 IF c->>'operation'='user_eligibility' AND c->'intent' ? 'report' THEN
  report_row:=public.diagnostic_source_read('content_reports',jsonb_build_object('id',c->'intent'->'report'->'id'));
  IF report_row->>'targetType'='message' THEN
   -- Fence both a present live Message and its absence before using a snapshot.
   roots:=roots||jsonb_build_array(jsonb_build_object('table','messages','key',jsonb_build_object('id',report_row->'targetId')));
  END IF;
 END IF;
 -- The existing finite-FK mechanism adds every mandatory audit/report effect
 -- root and its persisted references, then closes the original graph.
 RETURN public.diagnostic_source_scope_before_complete_moderation(c||jsonb_build_object('roots',roots));
END $$;

ALTER FUNCTION public.diagnostic_source_lock_keys(jsonb,jsonb) RENAME TO diagnostic_source_lock_keys_before_complete_moderation;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF c->>'operation'='user_eligibility' AND c ? 'intent' THEN
  c:=c||jsonb_build_object('rows',(c->'rows')||public.diagnostic_source_fk_effects(c)); END IF;
 RETURN public.diagnostic_source_lock_keys_before_complete_moderation(scope,c);
END $$;

ALTER FUNCTION public.campaign_source_mutations(jsonb,jsonb) RENAME TO campaign_source_mutations_before_complete_moderation;
CREATE FUNCTION public.campaign_source_mutations(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF c->>'operation'='user_eligibility' AND c ? 'intent' THEN
  -- Real NEW audit actor/target and report reviewer references participate in
  -- the same outer campaign discovery, never a second or late preparation.
  c:=c||jsonb_build_object('rows',(c->'rows')||public.diagnostic_source_fk_effects(c)); END IF;
 RETURN public.campaign_source_mutations_before_complete_moderation(scope,c);
END $$;
