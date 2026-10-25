-- Forward-only runtime corrections. Historical source protocol and limits remain unchanged.
-- Parent-authorized 42725 extraction/subtraction grouping throughout the parser chain.
CREATE OR REPLACE FUNCTION public.diagnostic_source_parse_before_purge(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE r jsonb; m jsonb; old_source jsonb; k jsonb; root jsonb; seen jsonb:='[]'; parsed_rows jsonb:='[]'; op text:=c->>'operation';
BEGIN
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR c-ARRAY['operation','roots','rows','actorUserId','sessionId','cutoff','campaign']<>'{}'
  OR NOT c ?& ARRAY['operation','roots','rows','actorUserId','sessionId','cutoff','campaign']
  OR jsonb_typeof(c->'operation') IS DISTINCT FROM 'string'
  OR jsonb_typeof(c->'actorUserId') NOT IN ('string','null') OR jsonb_typeof(c->'sessionId') NOT IN ('string','null')
  OR jsonb_typeof(c->'roots') IS DISTINCT FROM 'array' OR jsonb_typeof(c->'rows') IS DISTINCT FROM 'array'
  OR jsonb_array_length(c->'roots') NOT BETWEEN 1 AND 100 OR jsonb_array_length(c->'rows') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'diagnostic_source_command'; END IF;
 IF c->'cutoff'<>'null' AND ((c->>'cutoff')::timestamptz>clock_timestamp()) THEN RAISE EXCEPTION 'diagnostic_source_future_cutoff'; END IF;
 IF op IN ('ownership_expire','proof_expire','account_purge') AND c->'cutoff'='null' THEN RAISE EXCEPTION 'diagnostic_source_cutoff'; END IF;
 -- Campaign selectors are never accepted as authority from JSON.
 IF c->'campaign'<>'null' THEN RAISE EXCEPTION 'diagnostic_source_campaign_resolved_only'; END IF;
 FOR root IN SELECT value FROM jsonb_array_elements(c->'roots') LOOP
  IF root-ARRAY['table','key']<>'{}' OR NOT root ?& ARRAY['table','key'] OR root->'key'='{}' OR jsonb_typeof(root->'key') IS DISTINCT FROM 'object' OR public.diagnostic_source_meta(root->>'table') IS NULL
   OR public.diagnostic_source_key(root->>'table',root->'key') IS DISTINCT FROM root->'key'
   OR EXISTS (SELECT 1 FROM jsonb_each(root->'key') x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'diagnostic_source_root'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  m:=public.diagnostic_source_meta(r->>'table'); k:=r->'key';
  IF r-ARRAY['table','key','verb','expected','next']<>'{}' OR NOT r ?& ARRAY['table','key','verb','expected','next']
   OR public.diagnostic_source_allows(op,r->>'table',r->>'verb') IS NOT TRUE
   OR m IS NULL OR r->>'table'='diagnostic_source_anchors' OR k IS NULL OR k='{}' OR public.diagnostic_source_key(r->>'table',k) IS DISTINCT FROM k
   OR EXISTS (SELECT 1 FROM jsonb_each(k) x WHERE jsonb_typeof(x.value)<>'string')
   OR seen @> jsonb_build_array(jsonb_build_object('table',r->>'table','key',k))
  THEN RAISE EXCEPTION 'diagnostic_source_row'; END IF;
  seen:=seen||jsonb_build_array(jsonb_build_object('table',r->>'table','key',k));
  IF r->>'verb'<>'insert' AND jsonb_typeof(r->'expected'->'source')='object' THEN
   IF public.diagnostic_source_project(r->'expected'->'source',m->'fields') IS DISTINCT FROM r->'expected'->'source'
    OR NOT (r->'expected'->'source') ?& ARRAY(SELECT jsonb_array_elements_text(m->'fields')) THEN RAISE EXCEPTION 'diagnostic_source_expected_fields'; END IF;
   r:=jsonb_set(r,'{expected,source}',public.diagnostic_source_normalize(r->>'table',r->'expected'->'source'));
  END IF;
  old_source:=public.diagnostic_source_project(public.diagnostic_source_read(r->>'table',k),m->'fields');
  IF r->>'verb'='insert' THEN
   IF r->'expected'<>'"absent"' OR old_source IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_source_expected_absent'; END IF;
  ELSIF jsonb_typeof(r->'expected') IS DISTINCT FROM 'object' OR (r->'expected')-'source'<>'{}'
   OR old_source IS NULL OR r->'expected'->'source' IS DISTINCT FROM old_source
  THEN RAISE EXCEPTION 'diagnostic_source_stale'; END IF;
  IF r->>'verb'='delete' THEN
   IF r->'next'<>'null' THEN RAISE EXCEPTION 'diagnostic_source_next'; END IF;
  ELSIF jsonb_typeof(r->'next') IS DISTINCT FROM 'object'
   OR public.diagnostic_source_project(r->'next',m->'fields') IS DISTINCT FROM r->'next'
   OR NOT (r->'next') ?& ARRAY(SELECT jsonb_array_elements_text(m->'fields'))
   OR public.diagnostic_source_key(r->>'table',r->'next') IS DISTINCT FROM k
  THEN RAISE EXCEPTION 'diagnostic_source_next'; END IF;
  IF r->>'verb'<>'delete' THEN r:=jsonb_set(r,'{next}',public.diagnostic_source_normalize(r->>'table',r->'next')); END IF;
  parsed_rows:=parsed_rows||jsonb_build_array(r);
  IF op IN ('account_schedule','account_restore') AND
   ((r->'expected'->'source')-'deletionScheduledAt') IS DISTINCT FROM ((r->'next')-'deletionScheduledAt') THEN RAISE EXCEPTION 'diagnostic_source_account_fields'; END IF;
 END LOOP;
 RETURN c||jsonb_build_object('rows',parsed_rows);
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_parse_before_composition(c jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE parsed jsonb; r jsonb; prior jsonb; target jsonb; pair text[]; changed integer:=0; ids jsonb;
BEGIN
 IF c->>'operation'='intake_create' AND c ? 'intent' THEN
  IF (jsonb_typeof(c->'intent')='object' AND (c->'intent')-'receptionQualificationIds'='{}'
   AND jsonb_typeof(c->'intent'->'receptionQualificationIds')='array') IS NOT TRUE THEN
   RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
  ids:=c->'intent'->'receptionQualificationIds';
  IF jsonb_array_length(ids) NOT BETWEEN 1 AND 100
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(ids) id WHERE jsonb_typeof(id)<>'string' OR length(id#>>'{}')=0)
   OR (SELECT count(DISTINCT id) FROM jsonb_array_elements(ids) id)<>jsonb_array_length(ids) THEN
   RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
  SELECT jsonb_agg(id ORDER BY id) INTO ids FROM jsonb_array_elements(ids) id;
  parsed:=public.diagnostic_source_parse_before_signin_intake(c-'intent');
  parsed:=parsed||jsonb_build_object('intent',jsonb_build_object('receptionQualificationIds',ids));
  PERFORM public.diagnostic_intake_effects(parsed);
  RETURN parsed;
 END IF;
 parsed:=public.diagnostic_source_parse_before_signin_intake(c);
 IF parsed->>'operation'<>'sign_in_method_change' THEN RETURN parsed; END IF;
 r:=parsed->'rows'->0; prior:=r->'expected'->'source'; target:=r->'next';
 IF jsonb_array_length(parsed->'rows')<>1 OR jsonb_array_length(parsed->'roots')<>1
  OR parsed->'roots'->0 IS DISTINCT FROM jsonb_build_object('table','users','key',r->'key')
  OR parsed->>'actorUserId' IS DISTINCT FROM r->'key'->>'id' OR parsed->'cutoff'<>'null' THEN
  RAISE EXCEPTION 'diagnostic_source_signin_intent'; END IF;
 FOREACH pair SLICE 1 IN ARRAY ARRAY[['phone','phoneVerifiedAt'],['email','emailVerifiedAt']] LOOP
  IF public.diagnostic_source_project(prior,to_jsonb(pair)) IS DISTINCT FROM public.diagnostic_source_project(target,to_jsonb(pair)) THEN
   changed:=changed+1;
   IF (prior-pair) IS DISTINCT FROM (target-pair) OR jsonb_typeof(target->pair[1]) IS DISTINCT FROM 'string'
    OR length(btrim(target->>pair[1]))=0 OR target->>pair[2] IS NULL THEN
    RAISE EXCEPTION 'diagnostic_source_signin_intent'; END IF;
  END IF;
 END LOOP;
 IF changed<>1 THEN RAISE EXCEPTION 'diagnostic_source_signin_intent'; END IF;
 RETURN parsed;
END $function$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_parse(c jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE parsed jsonb; admission jsonb; ids jsonb; allowed text[];
BEGIN
 admission:=public.diagnostic_intake_campaign_command(c);
 IF admission IS NULL THEN RETURN public.diagnostic_source_parse_before_composition(c); END IF;
 allowed:=CASE WHEN c->>'operation'='intake_create' THEN ARRAY['campaignAdmission','receptionQualificationIds'] ELSE ARRAY['campaignAdmission'] END;
 IF (c->'intent')-allowed<>'{}' OR c->'cutoff'<>'null' OR c->'campaign'<>'null' THEN RAISE EXCEPTION 'diagnostic_intake_composition'; END IF;
 -- This is the existing intake parser immediately before selected-peer wrapping.
 -- It preserves the original one-row operation, protected tuple validation,
 -- template version check and all prior kernel/purge/moderation corrections.
 parsed:=public.diagnostic_source_parse_before_signin_intake(c-'intent');
 IF c->>'operation'='intake_create' THEN
  ids:=c->'intent'->'receptionQualificationIds';
  IF jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
  IF jsonb_array_length(ids) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(ids) id WHERE jsonb_typeof(id)<>'string' OR length(id#>>'{}')=0)
   OR (SELECT count(DISTINCT id) FROM jsonb_array_elements(ids) id)<>jsonb_array_length(ids) THEN RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
  SELECT jsonb_agg(id ORDER BY id) INTO ids FROM jsonb_array_elements(ids) id;
  parsed:=parsed||jsonb_build_object('intent',jsonb_build_object('campaignAdmission',true,'receptionQualificationIds',ids));
 ELSE parsed:=parsed||jsonb_build_object('intent',jsonb_build_object('campaignAdmission',true)); END IF;
 PERFORM public.diagnostic_intake_effects(parsed);
 RETURN parsed;
END $function$;

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
   OR NOT EXISTS(SELECT 1 FROM public.staff_grants WHERE "userId"=c->'intent'->>'userId' AND capability=c->'intent'->>'capability' AND "revokedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_intake_operator_authority'; END IF;
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

CREATE OR REPLACE FUNCTION public.diagnostic_source_parse_before_signin_intake(c jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  IF (jsonb_typeof(i->'report')='object' AND (i->'report')-ARRAY['id','reviewedAt']='{}'
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
END $function$;

-- Parent-authorized 42702 qualification of both derived table columns.
CREATE OR REPLACE FUNCTION public.campaign_preparation_scope(mutations jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; old_row jsonb; new_row jsonb; namespaces jsonb:='[]'; tracked jsonb; dependencies jsonb; t text; k jsonb; ns text; legacy_reset boolean:=false; is_legacy boolean;
BEGIN
 IF jsonb_typeof(mutations) IS DISTINCT FROM 'array' OR jsonb_array_length(mutations) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'campaign_preparation_shape'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(mutations) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR e-'table'-'key'-'verb'-'next'<>'{}'
   OR NOT (e ?& ARRAY['table','key','verb','next']) OR e->>'verb' NOT IN ('insert','update','delete')
   OR jsonb_typeof(e->'key') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'campaign_preparation_shape'; END IF;
  t:=e->>'table';
  IF NOT (public.campaign_preparation_tables() ? t) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_registry()) s WHERE s->>'table'=t) THEN RAISE EXCEPTION 'campaign_preparation_table'; END IF;
  k:=public.campaign_row_key(t,e->'key');
  -- Source-only composite keys have no campaign tracker, but remain bounded by
  -- the source parser. Ordinary preparation accepts only campaign table keys.
  IF public.campaign_preparation_tables() ? t AND (k IS DISTINCT FROM e->'key' OR EXISTS(SELECT 1 FROM jsonb_each(k) x WHERE jsonb_typeof(x.value)<>'string')) THEN RAISE EXCEPTION 'campaign_preparation_key'; END IF;
  EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE to_jsonb(s) @> $1',t) INTO old_row USING e->'key';
  IF (e->>'verb'='insert' AND old_row IS NOT NULL) OR (e->>'verb'<>'insert' AND old_row IS NULL) THEN RAISE EXCEPTION 'campaign_preparation_stale'; END IF;
  IF e->>'verb'='delete' THEN
   IF e->'next'<>'null' THEN RAISE EXCEPTION 'campaign_preparation_shape'; END IF;
   new_row:=NULL;
  ELSE
   IF jsonb_typeof(e->'next') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'campaign_preparation_shape'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(e->'next') f WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||t) AND a.attname=f AND a.attnum>0 AND NOT a.attisdropped)) THEN RAISE EXCEPTION 'campaign_preparation_field'; END IF;
   new_row:=coalesce(old_row,'{}')||e->'key'||e->'next';
  END IF;
  namespaces:=namespaces||public.campaign_row_namespaces(t,old_row,false)||public.campaign_row_namespaces(t,new_row);
 END LOOP;
 SELECT coalesce(jsonb_agg(n ORDER BY n COLLATE "C"),'[]') INTO namespaces FROM (SELECT DISTINCT value n FROM jsonb_array_elements_text(namespaces)) s;
 IF jsonb_array_length(namespaces)>16 THEN RAISE EXCEPTION 'campaign_preparation_limit'; END IF;
 FOR ns IN SELECT jsonb_array_elements_text(namespaces) LOOP
  EXECUTE format('SELECT profile=''campaign897-identities-v1'' FROM %I.campaign_manifest',ns) INTO is_legacy;
  legacy_reset:=legacy_reset OR is_legacy;
 END LOOP;
 SELECT coalesce(jsonb_agg(s.t ORDER BY s.t COLLATE "C"),'[]') INTO tracked FROM (
  SELECT DISTINCT cl.relname t FROM pg_trigger tr JOIN pg_class cl ON cl.oid=tr.tgrelid JOIN pg_proc p ON p.oid=tr.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE namespaces ? n.nspname AND p.proname IN ('track_auth','track_business') AND tr.tgenabled='O' AND tr.tgtype=29
   AND cl.relnamespace='public'::regnamespace
 ) s;
 SELECT coalesce(jsonb_agg(s.t ORDER BY s.t COLLATE "C"),'[]') INTO dependencies FROM (
  SELECT DISTINCT format('%I.%I',n.nspname,cl.relname) t FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
  WHERE c.contype='f' AND c.confrelid IN (SELECT to_regclass('public.'||value) FROM jsonb_array_elements_text(tracked))
 ) s;
 RETURN jsonb_build_object('namespaces',namespaces,'tracked',tracked,'dependencies',dependencies,'legacy_reset',legacy_reset);
END $$;
