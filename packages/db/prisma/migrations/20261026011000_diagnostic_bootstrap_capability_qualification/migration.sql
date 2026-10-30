-- Forward-only qualification of the existing staff-grant capability reference.
-- Historical150 and all parser semantics are retained.
CREATE OR REPLACE FUNCTION public.diagnostic_source_parse_before_moderation(c jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE parsed jsonb; op text:=c->>'operation'; center_id text; r jsonb; q jsonb; u jsonb; capability text; contract jsonb;
BEGIN
 IF op='staff_bootstrap' THEN
  IF jsonb_typeof(c->'intent') IS DISTINCT FROM 'object' OR (c->'intent')-'reason'<>'{}' OR jsonb_typeof(c->'intent'->'reason') IS DISTINCT FROM 'string'
   OR length(btrim(c->'intent'->>'reason')) NOT BETWEEN 1 AND 1000 OR jsonb_array_length(c->'rows')<>1
   OR c->'rows'->0->>'table'<>'staff_grants' OR c->'rows'->0->>'verb' NOT IN ('insert','update')
   OR c->'actorUserId'<>'null' OR c->'sessionId'<>'null' OR c->'cutoff'<>'null' THEN RAISE EXCEPTION 'diagnostic_intake_staff_intent'; END IF;
  parsed:=public.diagnostic_source_parse_before_intake((c-'intent')||jsonb_build_object('operation','staff_eligibility'));
  r:=parsed->'rows'->0->'next';
  u:=public.diagnostic_source_read('users',jsonb_build_object('id',r->'userId'));
  IF u IS NULL OR u->>'suspendedAt' IS NOT NULL OR u->>'deletionScheduledAt' IS NOT NULL OR (u->>'phoneVerifiedAt' IS NULL AND u->>'emailVerifiedAt' IS NULL)
   OR r->>'revokedAt' IS NOT NULL OR (parsed->'rows'->0->>'verb'='update' AND (r-ARRAY['grantedAt','revokedAt']) IS DISTINCT FROM ((parsed->'rows'->0->'expected'->'source')-ARRAY['grantedAt','revokedAt']))
   OR r->>'capability' NOT IN ('staff.manage','diagnostics.reception','diagnostics.technician','diagnostics.reviewer','diagnostics.templates','support.operations','history.fulfilment','history.payment.verify','history.payment.history','history.export','founder.refund.approve','founder.control','founder.admission','founder.recovery','analytics.aggregate','analytics.investigate') THEN RAISE EXCEPTION 'diagnostic_intake_staff_authority'; END IF;
  IF parsed->'rows'->0->>'verb'='update' AND parsed->'rows'->0->'expected'->'source'->>'revokedAt' IS NULL AND r IS DISTINCT FROM parsed->'rows'->0->'expected'->'source' THEN RAISE EXCEPTION 'diagnostic_intake_staff_noop'; END IF;
  IF NOT (parsed->'rows'->0->>'verb'='update' AND parsed->'rows'->0->'expected'->'source'->>'revokedAt' IS NULL)
   AND ((r->>'grantedAt')::timestamp<date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC') OR (r->>'grantedAt')::timestamp>(clock_timestamp() AT TIME ZONE 'UTC')+interval '1 millisecond') THEN RAISE EXCEPTION 'diagnostic_intake_staff_stamp'; END IF;
  RETURN c||jsonb_build_object('rows',parsed->'rows');
 END IF;
 IF op NOT IN ('center_bootstrap','campaign_admit') THEN
  parsed:=public.diagnostic_source_parse_before_intake(CASE WHEN op='intake_create' THEN c||jsonb_build_object('operation','order_create') ELSE c END);
  parsed:=parsed||jsonb_build_object('operation',op);
  IF op IN ('intake_create','template_publish') AND
   jsonb_array_length(parsed->'rows')<>1 THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
  IF op='template_publish' THEN
   r:=parsed->'rows'->0->'next';
   IF r->>'synthetic'<>'true' OR r->>'publishedById' IS DISTINCT FROM parsed->>'actorUserId'
    OR (r->>'version')::int IS DISTINCT FROM (SELECT coalesce(max(version),0)+1 FROM public.diagnostic_template_versions WHERE "centerId"=r->>'centerId') THEN RAISE EXCEPTION 'diagnostic_intake_template_version'; END IF;
  END IF;
  RETURN parsed;
 END IF;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR c-ARRAY['operation','roots','rows','actorUserId','sessionId','cutoff','campaign','intent']<>'{}'
  OR NOT c ?& ARRAY['operation','roots','rows','actorUserId','sessionId','cutoff','campaign','intent']
  OR c->'rows' IS DISTINCT FROM '[]'::jsonb OR c->'campaign' IS DISTINCT FROM 'null'::jsonb OR c->'cutoff' IS DISTINCT FROM 'null'::jsonb
  OR jsonb_typeof(c->'roots') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'roots')<>1
  OR c->'roots'->0->>'table'<>'diagnostic_centers' OR (c->'roots'->0)-ARRAY['table','key']<>'{}'
  OR (c->'roots'->0->'key')-'id'<>'{}' OR jsonb_typeof(c->'roots'->0->'key'->'id') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
 center_id:=c->'roots'->0->'key'->>'id';
 IF center_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
 IF op='campaign_admit' THEN
  IF c->'intent'<>'{}' OR jsonb_typeof(c->'actorUserId') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'sessionId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
  contract:=public.diagnostic_campaign_intake(c);
 ELSE
  IF c->'actorUserId'<>'null' OR c->'sessionId'<>'null' OR jsonb_typeof(c->'intent') IS DISTINCT FROM 'object'
   OR (c->'intent')-ARRAY['code','userId','capability','qualificationId']<>'{}'
   OR NOT (c->'intent') ?& ARRAY['code','userId','capability','qualificationId']
   OR EXISTS(SELECT 1 FROM jsonb_each(c->'intent') x WHERE jsonb_typeof(x.value)<>'string')
   OR c->'intent'->>'userId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR c->'intent'->>'qualificationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR c->'intent'->>'code' !~ '^synthetic-[a-z0-9][a-z0-9_-]{0,62}$'
   OR c->'intent'->>'capability' NOT IN ('diagnostics.reception','diagnostics.technician','diagnostics.reviewer','diagnostics.templates') THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
  -- Coverage is not operator permission. The operator's env/allowlist stays in
  -- its unexecuted command; SQL additionally refuses missing current authority.
  u:=public.diagnostic_source_read('users',jsonb_build_object('id',c->'intent'->'userId'));
  IF u IS NULL OR u->>'suspendedAt' IS NOT NULL OR u->>'deletionScheduledAt' IS NOT NULL OR (u->>'phoneVerifiedAt' IS NULL AND u->>'emailVerifiedAt' IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.staff_grants g WHERE g."userId"=c->'intent'->>'userId' AND g.capability=c->'intent'->>'capability' AND g."revokedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_intake_operator_authority'; END IF;
  SELECT to_jsonb(t) INTO r FROM public.diagnostic_centers t WHERE t.id=center_id OR t.code=c->'intent'->>'code';
  IF r IS NOT NULL AND (r->>'id' IS DISTINCT FROM center_id OR r->>'code' IS DISTINCT FROM c->'intent'->>'code' OR r->>'planCode'<>'standard' OR r->>'operationalApproval' IS NOT NULL
   OR r->'names' IS DISTINCT FROM jsonb_build_object('en','Carberk synthetic diagnostics','ru','Carberk synthetic diagnostics','tk','Carberk synthetic diagnostics')
   OR NOT EXISTS(SELECT 1 FROM public.diagnostic_audits WHERE "centerId"=center_id AND "actorId" IS NULL AND "orderId" IS NULL AND action='CENTER_SYNTHETIC_BOOTSTRAPPED' AND details=jsonb_build_object('command','diagnostics:bootstrap-synthetic'))) THEN RAISE EXCEPTION 'diagnostic_intake_operator_center'; END IF;
  SELECT to_jsonb(t) INTO q FROM public.diagnostic_center_assignments t WHERE t."centerId"=center_id AND t."userId"=c->'intent'->>'userId' AND t.capability=c->'intent'->>'capability';
  IF q IS NOT NULL AND (q->>'id' IS DISTINCT FROM c->'intent'->>'qualificationId' OR q->>'revokedAt' IS NOT NULL OR (q->>'qualifiedUntil')::timestamp<=clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'diagnostic_intake_operator_qualification'; END IF;
  IF (q IS NOT NULL) IS DISTINCT FROM EXISTS(SELECT 1 FROM public.diagnostic_audits WHERE "centerId"=center_id AND "actorId" IS NULL AND "orderId" IS NULL AND action='CENTER_QUALIFICATION_SYNTHETIC' AND details=jsonb_build_object('command','diagnostics:bootstrap-synthetic','capability',c->'intent'->'capability','userId',c->'intent'->'userId')) THEN RAISE EXCEPTION 'diagnostic_intake_operator_qualification'; END IF;
 END IF;
 PERFORM public.diagnostic_intake_effects(c);
 RETURN c;
END $function$;
