-- Dormant finite intake/bootstrap closure. No authority replacement or activation.
CREATE FUNCTION public.diagnostic_intake_uuid(label text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12)
 FROM (SELECT encode(sha256(convert_to(label,'UTF8')),'hex') h) s
$$;

-- This is discovery, never admission. The original hashed authority must still
-- execute successfully inside the prepared transaction before completion.
CREATE FUNCTION public.diagnostic_campaign_intake(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE ns text; namespaces jsonb; m jsonb; b jsonb; center_id text; reception text; effects jsonb:='[]'; r jsonb; capability text; qid text; aid text; at_time timestamp(3):=transaction_timestamp() AT TIME ZONE 'UTC'; signature text;
BEGIN
 center_id:=c->'roots'->0->'key'->>'id';
 namespaces:=public.campaign_row_namespaces('diagnostic_centers',jsonb_build_object('id',center_id));
 IF jsonb_array_length(namespaces)<>1 THEN RAISE EXCEPTION 'diagnostic_intake_campaign_binding'; END IF;
 ns:=namespaces->>0;
 EXECUTE format('SELECT to_jsonb(m) FROM %I.campaign_manifest m',ns) INTO m;
 signature:=format('%I.campaign_diagnostic_authority(text,text,text,text,text,text,text)',ns);
 IF m->>'profile'<>'campaign897-full-v3' OR m->>'state'<>'identities' OR m->>'delivery_version'<>'3'
  OR m->>'diagnostic_contract_hash' IS DISTINCT FROM md5(pg_get_functiondef(to_regprocedure(signature)))
  OR m->>'tracking_hash' IS DISTINCT FROM md5(pg_get_functiondef(to_regprocedure(format('%I.track_business()',ns))))
  OR center_id IS DISTINCT FROM public.diagnostic_intake_uuid((m->>'reservation_id')||':campaign897:diagnostics:center:'||(m->>'reservation_id')||':'||(m->>'candidate')) THEN
  RAISE EXCEPTION 'diagnostic_intake_campaign_binding'; END IF;
 EXECUTE format('SELECT to_jsonb(b) FROM %I.campaign_diagnostic_binding b',ns) INTO b;
 EXECUTE format('SELECT user_id FROM %I.campaign_entities WHERE alias=''reception-steward''',ns) INTO reception;
 IF reception IS NULL THEN RAISE EXCEPTION 'diagnostic_intake_campaign_binding'; END IF;
 IF b IS NOT NULL THEN
  -- The authority owns current binding/hash/liveness validation. No renewal and
  -- no synthetic source mutation is allowed on an already-bound admission.
  RETURN jsonb_build_object('namespace',ns,'manifest',m,'binding',b,'effects',effects,'reception',reception);
 END IF;
 r:=jsonb_build_object('id',center_id,'code','campaign897-'||(m->>'reservation_id')||'-'||left(m->>'candidate',12)||'-diagnostics','planCode','standard',
  'names',jsonb_build_object('en','Carberk synthetic diagnostics','ru','Carberk synthetic diagnostics','tk','Carberk synthetic diagnostics'),'operationalApproval',NULL,'createdAt',at_time);
 effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_centers',r,'{}',false)||jsonb_build_object('verb','insert','expected','absent','campaignNamespace',ns));
 aid:=public.diagnostic_intake_uuid((m->>'reservation_id')||':campaign897:diagnostics:audit:CENTER_SYNTHETIC_BOOTSTRAPPED:center:'||(m->>'candidate'));
 r:=jsonb_build_object('id',aid,'centerId',center_id,'orderId',NULL,'actorId',NULL,'action','CENTER_SYNTHETIC_BOOTSTRAPPED','details',jsonb_build_object('profile','campaign897-full-v3','provenance','synthetic-test-only-v1'),'createdAt',at_time);
 effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_audits',r,'{}',false)||jsonb_build_object('verb','insert','expected','absent','campaignNamespace',ns));
 FOREACH capability IN ARRAY ARRAY['diagnostics.reception','diagnostics.templates'] LOOP
  qid:=public.diagnostic_intake_uuid((m->>'reservation_id')||':campaign897:diagnostics:qualification:reception-steward:'||capability||':'||(m->>'candidate'));
  r:=jsonb_build_object('id',qid,'centerId',center_id,'userId',reception,'capability',capability,'qualifiedUntil',NULL,'assignedAt',at_time,'revokedAt',NULL);
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_center_assignments',r,'{}',false)||jsonb_build_object('verb','insert','expected','absent','campaignNamespace',ns));
  aid:=public.diagnostic_intake_uuid((m->>'reservation_id')||':campaign897:diagnostics:audit:CENTER_QUALIFICATION_SYNTHETIC:'||capability||':'||(m->>'candidate'));
  r:=jsonb_build_object('id',aid,'centerId',center_id,'orderId',NULL,'actorId',NULL,'action','CENTER_QUALIFICATION_SYNTHETIC','details',jsonb_build_object('profile','campaign897-full-v3','provenance','synthetic-test-only-v1','capability',capability,'userId',reception),'createdAt',at_time);
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_audits',r,'{}',false)||jsonb_build_object('verb','insert','expected','absent','campaignNamespace',ns));
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(effects) LOOP
  IF public.diagnostic_source_read(r->>'table',r->'key') IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_intake_campaign_collision'; END IF;
 END LOOP;
 RETURN jsonb_build_object('namespace',ns,'manifest',m,'binding',b,'effects',effects,'reception',reception);
END $$;

CREATE FUNCTION public.diagnostic_intake_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; r jsonb; effects jsonb:='[]'; op text:=c->>'operation'; aid text; center_id text; q jsonb; at_time timestamp(3):=transaction_timestamp() AT TIME ZONE 'UTC'; details jsonb; peer record; order_id text;
BEGIN
 IF op='staff_bootstrap' THEN
  e:=c->'rows'->0; r:=e->'next';
  IF e->>'verb'='update' AND (e->'expected'->'source'->>'revokedAt') IS NULL THEN RETURN effects; END IF;
  q:=jsonb_build_object('id',public.diagnostic_intake_uuid('diagnostic-source:staff-bootstrap:'||(r->>'userId')||':'||(r->>'capability')||':'||(r->>'grantedAt')),
   'actorId',NULL,'action','STAFF_CAPABILITY_BOOTSTRAP','targetType','User','targetId',r->'userId',
   'details',jsonb_build_object('capability',r->'capability','reason',c->'intent'->'reason'),'createdAt',at_time);
  RETURN jsonb_build_array(public.diagnostic_purge_effect('audit_logs',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
 END IF;
 IF op='campaign_admit' THEN RETURN public.diagnostic_campaign_intake(c)->'effects'; END IF;
 IF op IN ('intake_create','template_publish') THEN
  SELECT value INTO e FROM jsonb_array_elements(c->'rows') WHERE value->>'table'=CASE WHEN op='intake_create' THEN 'inspection_orders' ELSE 'diagnostic_template_versions' END;
  IF e IS NULL THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
  r:=e->'next'; center_id:=r->>'centerId'; order_id:=r->>'id';
  aid:=public.diagnostic_intake_uuid('diagnostic-source:'||op||':'||(r->>'id'));
  details:=CASE WHEN op='intake_create' THEN jsonb_build_object('audience',r->'audience','templateVersionId',r->'templateVersionId','synthetic',true)
   ELSE jsonb_build_object('templateVersionId',r->'id','version',r->'version','synthetic',true) END;
  r:=jsonb_build_object('id',aid,'centerId',center_id,'orderId',CASE WHEN op='intake_create' THEN r->'id' ELSE 'null'::jsonb END,
   'actorId',c->'actorUserId','action',CASE WHEN op='intake_create' THEN 'INTAKE_CREATED' ELSE 'TEMPLATE_PUBLISHED' END,'details',details,'createdAt',at_time);
  effects:=jsonb_build_array(public.diagnostic_purge_effect('diagnostic_audits',r,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
  IF op='intake_create' THEN
   FOR peer IN SELECT a.* FROM public.diagnostic_center_assignments a JOIN public.users u ON u.id=a."userId"
    JOIN public.staff_grants g ON g."userId"=u.id AND g.capability=a.capability AND g."revokedAt" IS NULL
    WHERE a."centerId"=center_id AND a.capability='diagnostics.reception' AND a."revokedAt" IS NULL AND a."qualifiedUntil">at_time
     AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL ORDER BY a.id LOOP
    q:=jsonb_build_object('id',public.diagnostic_intake_uuid('diagnostic-source:intake-assignment:'||order_id||':'||peer.id),
     'orderId',order_id,'userId',peer."userId",'capability',peer.capability,'assignedAt',at_time,'revokedAt',NULL);
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_order_assignments',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
   END LOOP;
  END IF;
 ELSIF op='center_bootstrap' THEN
  center_id:=c->'roots'->0->'key'->>'id';
  r:=public.diagnostic_source_read('diagnostic_centers',jsonb_build_object('id',center_id));
  IF r IS NULL THEN
   r:=jsonb_build_object('id',center_id,'code',c->'intent'->'code','planCode','standard','names',jsonb_build_object('en','Carberk synthetic diagnostics','ru','Carberk synthetic diagnostics','tk','Carberk synthetic diagnostics'),'operationalApproval',NULL,'createdAt',at_time);
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_centers',r,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
   aid:=public.diagnostic_intake_uuid('diagnostic-source:center_bootstrap:'||center_id);
   q:=jsonb_build_object('id',aid,'centerId',center_id,'orderId',NULL,'actorId',NULL,'action','CENTER_SYNTHETIC_BOOTSTRAPPED','details',jsonb_build_object('command','diagnostics:bootstrap-synthetic'),'createdAt',at_time);
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_audits',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
  END IF;
  SELECT to_jsonb(t) INTO q FROM public.diagnostic_center_assignments t WHERE t."centerId"=center_id AND t."userId"=c->'intent'->>'userId' AND t.capability=c->'intent'->>'capability';
  IF q IS NULL THEN
   q:=jsonb_build_object('id',c->'intent'->'qualificationId','centerId',center_id,'userId',c->'intent'->'userId','capability',c->'intent'->'capability','qualifiedUntil',at_time+interval '2 hours','assignedAt',at_time,'revokedAt',NULL);
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_center_assignments',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
   aid:=public.diagnostic_intake_uuid('diagnostic-source:center_bootstrap:'||(q->>'id'));
   q:=jsonb_build_object('id',aid,'centerId',center_id,'orderId',NULL,'actorId',NULL,'action','CENTER_QUALIFICATION_SYNTHETIC','details',jsonb_build_object('command','diagnostics:bootstrap-synthetic','capability',c->'intent'->'capability','userId',c->'intent'->'userId'),'createdAt',at_time);
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_audits',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
  END IF;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(effects) LOOP
  IF public.diagnostic_source_read(e->>'table',e->'key') IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_intake_effect_collision'; END IF;
 END LOOP;
 RETURN effects;
END $$;

ALTER FUNCTION public.diagnostic_source_allows(text,text,text) RENAME TO diagnostic_source_allows_before_intake;
CREATE FUNCTION public.diagnostic_source_allows(op text,t text,v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN op='template_publish' THEN t='diagnostic_template_versions' AND v='insert'
 WHEN op IN ('order_create','intake_create') THEN t='inspection_orders' AND v='insert'
 WHEN op='staff_eligibility' THEN t IN ('staff_grants','diagnostic_center_assignments','diagnostic_order_assignments') AND v IN ('insert','update','delete')
 ELSE public.diagnostic_source_allows_before_intake(op,t,v) END
$$;

ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_intake;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; op text:=c->>'operation'; center_id text; r jsonb; q jsonb; u jsonb; capability text; contract jsonb;
BEGIN
 IF op='staff_bootstrap' THEN
  IF jsonb_typeof(c->'intent') IS DISTINCT FROM 'object' OR c->'intent'-'reason'<>'{}' OR jsonb_typeof(c->'intent'->'reason') IS DISTINCT FROM 'string'
   OR length(btrim(c->'intent'->>'reason')) NOT BETWEEN 1 AND 1000 OR jsonb_array_length(c->'rows')<>1
   OR c->'rows'->0->>'table'<>'staff_grants' OR c->'rows'->0->>'verb' NOT IN ('insert','update')
   OR c->'actorUserId'<>'null' OR c->'sessionId'<>'null' OR c->'cutoff'<>'null' THEN RAISE EXCEPTION 'diagnostic_intake_staff_intent'; END IF;
  parsed:=public.diagnostic_source_parse_before_intake((c-'intent')||jsonb_build_object('operation','staff_eligibility'));
  r:=parsed->'rows'->0->'next';
  u:=public.diagnostic_source_read('users',jsonb_build_object('id',r->'userId'));
  IF u IS NULL OR u->>'suspendedAt' IS NOT NULL OR u->>'deletionScheduledAt' IS NOT NULL OR (u->>'phoneVerifiedAt' IS NULL AND u->>'emailVerifiedAt' IS NULL)
   OR r->>'revokedAt' IS NOT NULL OR (parsed->'rows'->0->>'verb'='update' AND (r-ARRAY['grantedAt','revokedAt']) IS DISTINCT FROM (parsed->'rows'->0->'expected'->'source'-ARRAY['grantedAt','revokedAt']))
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
  OR c->'roots'->0->>'table'<>'diagnostic_centers' OR c->'roots'->0-ARRAY['table','key']<>'{}'
  OR c->'roots'->0->'key'-'id'<>'{}' OR jsonb_typeof(c->'roots'->0->'key'->'id') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
 center_id:=c->'roots'->0->'key'->>'id';
 IF center_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
 IF op='campaign_admit' THEN
  IF c->'intent'<>'{}' OR jsonb_typeof(c->'actorUserId') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'sessionId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'diagnostic_intake_intent'; END IF;
  contract:=public.diagnostic_campaign_intake(c);
 ELSE
  IF c->'actorUserId'<>'null' OR c->'sessionId'<>'null' OR jsonb_typeof(c->'intent') IS DISTINCT FROM 'object'
   OR c->'intent'-ARRAY['code','userId','capability','qualificationId']<>'{}'
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
END $$;

ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_intake;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE roots jsonb:=c->'roots'; rows jsonb:=c->'rows'; e jsonb; center_id text; t text; r record; uid text; cap text;
BEGIN
 IF c->>'operation' NOT IN ('intake_create','template_publish','center_bootstrap','campaign_admit','staff_bootstrap') THEN RETURN public.diagnostic_source_scope_before_intake(c); END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_intake_effects(c)) LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table',e->'table','key',e->'key'));
  rows:=rows||jsonb_build_array(e);
 END LOOP;
 IF c->>'operation'='staff_bootstrap' THEN RETURN public.diagnostic_source_scope_before_intake(c||jsonb_build_object('roots',roots,'rows',rows)); END IF;
 IF c->>'operation' IN ('center_bootstrap','campaign_admit') THEN center_id:=c->'roots'->0->'key'->>'id';
 ELSE center_id:=c->'rows'->0->'next'->>'centerId'; END IF;
 roots:=roots||jsonb_build_array(jsonb_build_object('table','diagnostic_centers','key',jsonb_build_object('id',center_id)));
 -- All current rows read by intake/publication/bootstrap, not only a caller's
 -- selected version. Center/unique slots also fence the empty collections.
 FOREACH t IN ARRAY ARRAY['diagnostic_template_versions','diagnostic_center_assignments','diagnostic_audits'] LOOP
  FOR r IN EXECUTE format('SELECT to_jsonb(s) row FROM public.%I s WHERE s."centerId"=$1',t) USING center_id LOOP
   roots:=roots||jsonb_build_array(jsonb_build_object('table',t,'key',public.diagnostic_source_key(t,r.row)));
   IF t='diagnostic_center_assignments' THEN
    roots:=roots||jsonb_build_array(jsonb_build_object('table','staff_grants','key',jsonb_build_object('userId',r.row->'userId','capability',r.row->'capability')));
   END IF;
  END LOOP;
 END LOOP;
 uid:=CASE WHEN c->>'operation'='center_bootstrap' THEN c->'intent'->>'userId' ELSE c->>'actorUserId' END;
 FOREACH cap IN ARRAY ARRAY['diagnostics.reception','diagnostics.templates'] LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table','staff_grants','key',jsonb_build_object('userId',uid,'capability',cap)));
 END LOOP;
 IF c->>'operation'='center_bootstrap' THEN
  roots:=roots||jsonb_build_array(jsonb_build_object('table','users','key',jsonb_build_object('id',uid)),
   jsonb_build_object('table','staff_grants','key',jsonb_build_object('userId',uid,'capability',c->'intent'->'capability')),
   jsonb_build_object('table','diagnostic_center_assignments','key',jsonb_build_object('id',c->'intent'->'qualificationId')));
 END IF;
 RETURN public.diagnostic_source_scope_before_intake(c||jsonb_build_object('roots',roots,'rows',rows));
END $$;

ALTER FUNCTION public.diagnostic_source_lock_keys(jsonb,jsonb) RENAME TO diagnostic_source_lock_keys_before_intake;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 -- Include server-derived NEW unique keys, especially absent center code and
 -- center/User/capability slots. Physical namespace/suborder remains unchanged.
 RETURN public.diagnostic_source_lock_keys_before_intake(scope,c||jsonb_build_object('rows',(c->'rows')||public.diagnostic_intake_effects(c)));
END $$;

ALTER FUNCTION public.diagnostic_source_effects(jsonb,jsonb) RENAME TO diagnostic_source_effects_before_intake;
CREATE FUNCTION public.diagnostic_source_effects(c jsonb,scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; derived jsonb;
BEGIN
 effects:=public.diagnostic_source_effects_before_intake(c,scope); derived:=public.diagnostic_intake_effects(c);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(derived) e WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(scope) s WHERE s->'table'=e->'table' AND s->'key'=e->'key')) THEN RAISE EXCEPTION 'diagnostic_source_effect_outside_scope'; END IF;
 RETURN effects||derived;
END $$;

ALTER FUNCTION public.diagnostic_purge_tuple(jsonb,jsonb,boolean) RENAME TO diagnostic_purge_tuple_before_intake;
CREATE FUNCTION public.diagnostic_purge_tuple(e jsonb,r jsonb,final boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; adjusted jsonb:=e; ns text:=e->>'campaignNamespace';
BEGIN
 IF ns IS NOT NULL THEN
  IF ns !~ '^cf_[a-f0-9]{32}$' OR r IS NULL THEN RETURN false; END IF;
  EXECUTE format('SELECT to_jsonb(b) FROM %I.campaign_diagnostic_binding b',ns) INTO binding;
  IF binding IS NULL OR binding->>'center_id' IS DISTINCT FROM (CASE WHEN e->>'table'='diagnostic_centers' THEN r->>'id' ELSE r->>'centerId' END)
   OR (binding->>'issued_at')::timestamp<date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC')
   OR (binding->>'issued_at')::timestamp>clock_timestamp() AT TIME ZONE 'UTC'
   OR (binding->>'qualification_deadline')::timestamp IS DISTINCT FROM (binding->>'issued_at')::timestamp+interval '2 hours'
   OR binding->>'provenance'<>'synthetic-test-only-v1' THEN RETURN false; END IF;
  IF e->>'table'='diagnostic_center_assignments' THEN adjusted:=jsonb_set(adjusted,'{next,qualifiedUntil}',binding->'qualification_deadline'); END IF;
 END IF;
 RETURN public.diagnostic_purge_tuple_before_intake(adjusted,r,final);
END $$;

-- Completion is identical for finish and naked receipt DELETE. Dependency rows
-- must remain current/absent unless the server selected their final effect.
CREATE FUNCTION public.diagnostic_intake_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE s jsonb; actual jsonb; ns text; m jsonb; b jsonb; admitted boolean;
BEGIN
 IF OLD.command->>'operation' NOT IN ('intake_create','template_publish','center_bootstrap','campaign_admit','staff_bootstrap') THEN RETURN OLD; END IF;
 IF OLD.command->>'operation'='intake_create' AND NOT EXISTS(SELECT 1 FROM public.diagnostic_source_anchors WHERE "orderId"=OLD.command->'rows'->0->'key'->>'id') THEN RAISE EXCEPTION 'diagnostic_source_missing_anchor'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(OLD.scope) WHERE value->>'table'<>'diagnostic_source_anchors' LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.effects) e WHERE e->'table'=s->'table' AND e->'key'=s->'key') THEN CONTINUE; END IF;
  actual:=public.diagnostic_source_project(public.diagnostic_source_read(s->>'table',s->'key'),public.diagnostic_source_meta(s->>'table')->'fields');
  IF actual IS DISTINCT FROM nullif(s->'row','null') THEN RAISE EXCEPTION 'diagnostic_intake_dependency_changed'; END IF;
 END LOOP;
 IF OLD.command->>'operation'='campaign_admit' THEN
  ns:=OLD.campaigns->>0;
  IF ns IS NULL OR ns !~ '^cf_[a-f0-9]{32}$' OR jsonb_array_length(OLD.campaigns)<>1 THEN RAISE EXCEPTION 'diagnostic_intake_campaign_binding'; END IF;
  EXECUTE format('SELECT to_jsonb(b) FROM %I.campaign_diagnostic_binding b',ns) INTO b;
  IF b IS NULL THEN RAISE EXCEPTION 'diagnostic_intake_campaign_unadmitted'; END IF;
  EXECUTE format('SELECT to_jsonb(m) FROM %I.campaign_manifest m',ns) INTO m;
  EXECUTE format('SELECT %I.campaign_diagnostic_authority($1,$2,$3,NULL,NULL,NULL,$4)',ns) INTO admitted
   USING OLD.command->>'actorUserId',OLD.command->>'sessionId',OLD.command->'roots'->0->'key'->>'id',m->>'candidate';
  IF admitted IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_intake_campaign_unadmitted'; END IF;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER diagnostic_intake_completion BEFORE DELETE ON public.diagnostic_source_commands FOR EACH ROW EXECUTE FUNCTION public.diagnostic_intake_completion();

-- AuditLog is dependency-only outside account purge and the explicit operator
-- staff intent. This adds no general arbitrary-write authority.
CREATE OR REPLACE FUNCTION public.diagnostic_purge_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text
  AND (command->>'operation'='account_purge' OR (command->>'operation'='staff_bootstrap' AND TG_TABLE_NAME='audit_logs'))) THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- NEW intake uses the same forward-only shell, never legacy backfill.
CREATE OR REPLACE FUNCTION public.diagnostic_source_anchor_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE receipt public.diagnostic_source_commands; raw public.diagnostic_identity_records; component public.diagnostic_ownership_components;
 grant_row public.diagnostic_ownership_grants; oid text; plan jsonb; initial boolean;
BEGIN
 oid:=CASE WHEN TG_OP='DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF receipt.id IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.scope) s WHERE s->>'table'='inspection_orders' AND s->'key'->>'id'=oid) THEN RAISE EXCEPTION 'diagnostic_source_anchor_receipt'; END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM public.inspection_orders WHERE id=oid) THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable'; END IF;
  RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  IF receipt.command->>'operation' NOT IN ('order_create','intake_create') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.command->'rows') r
   WHERE r->>'table'='inspection_orders' AND r->'key'->>'id'=oid AND r->>'verb'='insert') THEN RAISE EXCEPTION 'diagnostic_source_no_anchor_backfill'; END IF;
  NEW.state:='pending'; NEW."firstRecordId":=NULL; NEW.source:=public.diagnostic_source_anchor_origin(oid); NEW."createdTransaction":=pg_current_xact_id()::text;
  RETURN NEW;
 END IF;
 IF NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."createdTransaction" IS DISTINCT FROM OLD."createdTransaction"
  OR (OLD.state IN ('changed','unavailable','erased') AND NEW.state NOT IN (OLD.state,'erased'))
  OR (NEW.source IS DISTINCT FROM OLD.source AND NOT (NEW.state='erased' AND NEW.source IS NULL))
  OR (OLD."firstRecordId" IS NOT NULL AND NEW."firstRecordId" IS DISTINCT FROM OLD."firstRecordId" AND NEW.state<>'erased') THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable'; END IF;
 IF NEW.state='erased' THEN
  IF EXISTS (SELECT 1 FROM public.diagnostic_ownership_components c JOIN public.diagnostic_identity_records r ON r.id=c."identityRecordId"
   JOIN public.inspection_orders o ON o.id=r."orderId" WHERE c."identityRecordId"=OLD."firstRecordId" AND c.state='available' AND r."erasedAt" IS NULL AND o."erasedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_source_anchor_disposal'; END IF;
  NEW.source:=NULL; NEW."firstRecordId":=NULL; RETURN NEW;
 END IF;
 IF OLD."firstRecordId" IS NULL AND NEW."firstRecordId" IS NOT NULL THEN
  IF receipt.command->>'operation'<>'observation_append' THEN RAISE EXCEPTION 'diagnostic_source_first_slot'; END IF;
  SELECT value INTO plan FROM jsonb_array_elements(receipt.command->'rows') r WHERE r->>'table'='diagnostic_identity_records'
   AND r->>'verb'='insert' AND r->'key'->>'id'=NEW."firstRecordId" AND r->'next'->>'orderId'=oid;
  SELECT * INTO raw FROM public.diagnostic_identity_records WHERE id=NEW."firstRecordId" AND "orderId"=oid AND "ownershipCaptureTransaction"=pg_current_xact_id()::text;
  SELECT * INTO component FROM public.diagnostic_ownership_components WHERE "identityRecordId"=raw.id AND "orderId"=oid;
  SELECT * INTO grant_row FROM public.diagnostic_ownership_grants WHERE id=component."grantId";
  IF plan IS NULL OR raw.id IS NULL OR component."identityRecordId" IS NULL THEN RAISE EXCEPTION 'diagnostic_source_first_slot'; END IF;
  -- Claim only the immutable first slot. A changed shell remains changed; a no-grant
  -- capture succeeds unavailable. Existing source/grant guards check exact bindings.
  IF OLD.state='pending' THEN
   NEW.state:=CASE WHEN component.state='available' AND public.diagnostic_ownership_grant_current(grant_row,clock_timestamp() AT TIME ZONE 'UTC') IS TRUE THEN 'unchanged' ELSE 'unavailable' END;
  ELSE NEW.state:=OLD.state; END IF;
 ELSIF NEW.state='unchanged' AND OLD.state<>'unchanged' THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable';
 END IF;
 RETURN NEW;
END $$;

-- NEW intake uses the same forward-only shell, never legacy backfill.
CREATE OR REPLACE FUNCTION public.diagnostic_source_order_shell() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 -- Expansion creates shells only for an explicitly prepared NEW order. No legacy reads or backfill.
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text AND command->>'operation' IN ('order_create','intake_create')) THEN
  INSERT INTO public.diagnostic_source_anchors("orderId",state,source,"createdTransaction") VALUES(NEW.id,'pending','{}',pg_current_xact_id()::text);
 END IF;
 RETURN NULL;
END $$;
