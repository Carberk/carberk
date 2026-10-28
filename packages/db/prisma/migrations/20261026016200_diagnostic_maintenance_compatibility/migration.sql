-- Three finite operator compatibility plans. No grants, activation, schema or
-- public transport changes. A receipt proves coverage, never operator authority.
CREATE FUNCTION public.diagnostic_maintenance_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
 SELECT btrim(value,E' \t\n\r\f'||chr(11)||U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')
$$;
CREATE FUNCTION public.diagnostic_maintenance_email(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
 SELECT lower(public.diagnostic_maintenance_trim(value))
$$;
CREATE FUNCTION public.diagnostic_maintenance_reviewer_role(uid text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE uid WHEN 'be255e7f-3414-49ae-8dcb-d4d6b26b94f9' THEN 'buyer'
 WHEN 'c410b0ef-dc1b-45f5-afe6-72f4ba5d9cb7' THEN 'seller'
 WHEN '9ee7ec27-8ebc-40e5-b0b5-e76494c9a024' THEN 'buyer'
 WHEN 'dbda60a2-a7f6-4230-a993-9ec73f30dc6d' THEN 'seller'
 WHEN '30157e67-4129-4984-afe1-c4cd014f68ed' THEN 'buyer' END
$$;
CREATE FUNCTION public.diagnostic_maintenance_selected(c jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT c->>'operation' IN ('admin_bootstrap_promote','reviewer_credentials_change')
 OR (c->>'operation'='account_schedule' AND c->'intent'->>'mode'='tester_remove')
$$;
CREATE FUNCTION public.diagnostic_maintenance_sessions(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb:='[]'; r record;
BEGIN
 IF c->>'operation'<>'reviewer_credentials_change' AND NOT
  (c->>'operation'='account_schedule' AND c->'intent'->>'mode'='tester_remove') THEN RETURN result; END IF;
 FOR r IN SELECT to_jsonb(s) AS row FROM public.sessions s WHERE EXISTS
  (SELECT 1 FROM jsonb_array_elements(c->'rows') e WHERE e->>'table'='users' AND e->'key'->>'id'=s."userId") ORDER BY s.id LOOP
  result:=result||jsonb_build_array(public.diagnostic_purge_effect('sessions',r.row,'{}',true));
  IF jsonb_array_length(result)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.diagnostic_maintenance_changed(c jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT (c-'intent')||jsonb_build_object('rows',coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(c->'rows') e
 WHERE e->'next' IS DISTINCT FROM e->'expected'->'source'),'[]'))
$$;
CREATE FUNCTION public.diagnostic_maintenance_audit(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE details jsonb; uid text:=c->'rows'->0->'key'->>'id'; ids jsonb; roster jsonb; action text; target_type text; target_id text;
BEGIN
 IF c->>'operation'='admin_bootstrap_promote' THEN
  action:='ADMIN_BOOTSTRAP_PROMOTE'; target_type:='user'; target_id:=uid;
  details:=jsonb_build_object('reason',c->'intent'->'reason','before',jsonb_build_object('role',c->'rows'->0->'expected'->'source'->'role'),'after',jsonb_build_object('role','admin'));
 ELSIF c->>'operation'='reviewer_credentials_change' THEN
  SELECT coalesce(jsonb_agg(e->'key'->'id' ORDER BY e->'key'->>'id'),'[]') INTO ids FROM jsonb_array_elements(c->'rows') e;
  SELECT jsonb_agg(e->'id' ORDER BY ord) INTO roster FROM jsonb_array_elements(c->'intent'->'accounts') WITH ORDINALITY t(e,ord);
  action:=CASE WHEN c->'intent'->>'mode'='rotate' THEN 'REVIEWER_SCENARIO_ROTATE' ELSE 'REVIEWER_SCENARIO_REVOKE' END;
  target_type:='reviewer_scenario'; target_id:='store-review';
  IF c->'intent'->>'mode'='rotate' THEN
   -- Preserve configured slot order in public count/ID-only scenario receipts.
   SELECT jsonb_agg(e->'id' ORDER BY ord) INTO ids FROM jsonb_array_elements(c->'intent'->'accounts') WITH ORDINALITY t(e,ord)
    WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') r WHERE r->'key'->'id'=e->'id');
   details:=jsonb_build_object('mode','seed','accountCount',jsonb_array_length(roster),'seededUserIds',roster,'rotatedUserIds',ids,
    'listingIds',jsonb_build_array('e042b037-1e59-495d-8380-e497ad7d035e','e2354d2f-3d4f-4860-a71f-c9f1e10c37e8'),
    'conversationId','a8ff59c2-6da5-45fb-b38a-563fffa989b6','reportId','67e970fd-d408-4d87-ae3a-c9dc880223d6');
  ELSE
   SELECT jsonb_agg(e->'id' ORDER BY ord) INTO ids FROM jsonb_array_elements(c->'intent'->'accounts') WITH ORDINALITY t(e,ord)
    WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') r WHERE r->'key'->'id'=e->'id');
   details:=jsonb_build_object('mode','revoke','accountCount',jsonb_array_length(ids),'revokedUserIds',ids);
  END IF;
  details:=details||jsonb_build_object('occurredAt',to_char((c->'intent'->>'at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 ELSE RETURN NULL; END IF;
 RETURN public.diagnostic_source_normalize('audit_logs',jsonb_build_object(
  'id',public.diagnostic_intake_uuid('diagnostic-maintenance:'||pg_current_xact_id()::text||':'||(c->>'operation')),
  'actorId',NULL,'action',action,'targetType',target_type,'targetId',target_id,'details',details,
  'createdAt',transaction_timestamp()::timestamp(3)));
END $$;

ALTER FUNCTION public.diagnostic_source_allows(text,text,text) RENAME TO diagnostic_source_allows_before_maintenance;
CREATE FUNCTION public.diagnostic_source_allows(op text,t text,v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN op IN ('admin_bootstrap_promote','reviewer_credentials_change') THEN t='users' AND v='update'
 ELSE public.diagnostic_source_allows_before_maintenance(op,t,v) END
$$;

ALTER FUNCTION public.diagnostic_source_account_effects(jsonb) RENAME TO diagnostic_source_account_effects_before_maintenance;
CREATE FUNCTION public.diagnostic_source_account_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb:='[]'; probe jsonb; e jsonb; r record; ordinary jsonb;
BEGIN
 IF c->>'operation'<>'account_schedule' OR c->'intent'->>'mode' IS DISTINCT FROM 'tester_remove' THEN
  RETURN public.diagnostic_source_account_effects_before_maintenance(c); END IF;
 -- Probe all selected subjects, even an earlier/equal schedule. These synthetic
 -- event predicates are discovery only, never accepted caller effect authority.
 SELECT jsonb_agg(jsonb_set(e,'{expected,source,deletionScheduledAt}','null')) INTO probe FROM jsonb_array_elements(c->'rows') e;
 ordinary:=public.diagnostic_source_account_effects_before_maintenance((c-'intent')||jsonb_build_object('rows',probe));
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(ordinary) e WHERE e->>'table'<>'listings')
  OR EXISTS(SELECT 1 FROM public.listings l WHERE l."businessId" IS NOT NULL AND EXISTS
   (SELECT 1 FROM jsonb_array_elements(c->'rows') e WHERE e->'key'->>'id'=l."sellerId"))
  OR jsonb_array_length(public.diagnostic_source_enquiry_effects((c-'intent')||jsonb_build_object('rows',probe)))>0 THEN
  RAISE EXCEPTION 'diagnostic_maintenance_tester_extra_effect'; END IF;
 FOR r IN SELECT to_jsonb(l) AS row FROM public.listings l WHERE l.status='active' AND l."businessId" IS NULL AND EXISTS
  (SELECT 1 FROM jsonb_array_elements(c->'rows') e WHERE e->'key'->>'id'=l."sellerId") ORDER BY l.id LOOP
  result:=result||jsonb_build_array(public.diagnostic_purge_effect('listings',r.row,jsonb_build_object('status','archived','archivedByDeletion',true)));
  IF jsonb_array_length(result)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
 END LOOP;
 RETURN result;
END $$;

ALTER FUNCTION public.diagnostic_source_fk_effects(jsonb) RENAME TO diagnostic_source_fk_effects_before_maintenance;
CREATE FUNCTION public.diagnostic_source_fk_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; sessions jsonb; e jsonb; r record; audit jsonb;
BEGIN
 IF public.diagnostic_maintenance_selected(c) IS NOT TRUE THEN RETURN public.diagnostic_source_fk_effects_before_maintenance(c); END IF;
 result:=public.diagnostic_source_fk_effects_before_maintenance(CASE WHEN c->'intent'->>'mode'='tester_remove'
  THEN public.diagnostic_maintenance_changed(c) ELSE c END);
 sessions:=public.diagnostic_maintenance_sessions(c);
 IF jsonb_array_length(sessions)>0 THEN
  -- Reuse the effective physical Session closure, including its surviving
  -- consumed-report retry policy, rather than the pre-correction historical one.
  result:=result||sessions||public.diagnostic_source_fk_effects_before_maintenance(
   (c-'intent')||jsonb_build_object('operation','session_change','rows',sessions));
 END IF;
 IF c->>'operation'='reviewer_credentials_change' THEN
  FOR r IN SELECT to_jsonb(d) AS row FROM public.fcm_devices d WHERE d."invalidatedAt" IS NULL AND EXISTS
   (SELECT 1 FROM jsonb_array_elements(c->'rows') e WHERE e->'key'->>'id'=d."userId") ORDER BY d.id LOOP
   result:=result||jsonb_build_array(public.diagnostic_purge_effect('fcm_devices',r.row,jsonb_build_object('invalidatedAt',(c->'intent'->>'at')::timestamp(3))));
  END LOOP;
 END IF;
 audit:=public.diagnostic_maintenance_audit(c);
 IF audit IS NOT NULL THEN
  IF public.diagnostic_source_read('audit_logs',jsonb_build_object('id',audit->'id')) IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_maintenance_audit_collision'; END IF;
  result:=result||jsonb_build_array(public.diagnostic_purge_effect('audit_logs',audit,'{}')||jsonb_build_object('verb','insert','expected','absent'));
 END IF;
 IF jsonb_array_length(result)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(effect ORDER BY effect::text),'[]') FROM (SELECT DISTINCT value AS effect FROM jsonb_array_elements(result)) d);
END $$;

ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_maintenance;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; i jsonb:=c->'intent'; op text:=c->>'operation'; e jsonb; prior jsonb; target jsonb; uid text;
 ids jsonb; roots jsonb; a jsonb; stored jsonb; actual_ids jsonb; wanted_ids jsonb; selector jsonb; stamp timestamp(3); normalized text; roster text[]:=ARRAY['be255e7f-3414-49ae-8dcb-d4d6b26b94f9','c410b0ef-dc1b-45f5-afe6-72f4ba5d9cb7','9ee7ec27-8ebc-40e5-b0b5-e76494c9a024','dbda60a2-a7f6-4230-a993-9ec73f30dc6d','30157e67-4129-4984-afe1-c4cd014f68ed'];
BEGIN
 IF op NOT IN ('admin_bootstrap_promote','reviewer_credentials_change') AND
  NOT(op='account_schedule' AND c ? 'intent') THEN RETURN public.diagnostic_source_parse_before_maintenance(c); END IF;
 IF op='account_schedule' THEN
  IF (jsonb_typeof(i)='object' AND i-ARRAY['mode','at']='{}' AND i ?& ARRAY['mode','at']
   AND i->>'mode'='tester_remove' AND jsonb_typeof(i->'at')='string') IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_maintenance_intent'; END IF;
  parsed:=public.diagnostic_source_parse_before_maintenance(c-'intent'); stamp:=(i->>'at')::timestamp(3);
 ELSIF op='admin_bootstrap_promote' THEN
  IF (jsonb_typeof(i)='object' AND i-ARRAY['reason','selector']='{}' AND i ?& ARRAY['reason','selector']
   AND jsonb_typeof(i->'reason')='string' AND length(public.diagnostic_maintenance_trim(i->>'reason')) BETWEEN 1 AND 1000
   AND i->>'reason'=public.diagnostic_maintenance_trim(i->>'reason') AND jsonb_typeof(i->'selector')='object'
   AND (i->'selector')-ARRAY['channel','value']='{}' AND (i->'selector') ?& ARRAY['channel','value']
   AND i->'selector'->>'channel' IN ('phone','email') AND jsonb_typeof(i->'selector'->'value')='string') IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_maintenance_intent'; END IF;
  parsed:=public.diagnostic_source_parse_before_purge(c-'intent');
 ELSE
  IF (jsonb_typeof(i)='object' AND i-ARRAY['mode','at','accounts']='{}' AND i ?& ARRAY['mode','at','accounts']
   AND i->>'mode' IN ('rotate','revoke') AND jsonb_typeof(i->'at')='string' AND jsonb_typeof(i->'accounts')='array'
   AND jsonb_array_length(i->'accounts') BETWEEN 3 AND 5) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_maintenance_intent'; END IF;
  parsed:=public.diagnostic_source_parse_before_purge(c-'intent'); stamp:=(i->>'at')::timestamp(3);
 END IF;
 parsed:=parsed||jsonb_build_object('intent',i);
 IF parsed->'actorUserId'<>'null' OR parsed->'sessionId'<>'null' OR parsed->'cutoff'<>'null' OR parsed->'campaign'<>'null' THEN RAISE EXCEPTION 'diagnostic_maintenance_subject'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(parsed->'rows') r WHERE r->>'table'<>'users' OR r->>'verb'<>'update') THEN RAISE EXCEPTION 'diagnostic_maintenance_rows'; END IF;
 SELECT jsonb_agg(r->'key'->'id' ORDER BY r->'key'->>'id') INTO ids FROM jsonb_array_elements(parsed->'rows') r;
 SELECT jsonb_agg(r->'key'->'id' ORDER BY r->'key'->>'id') INTO roots FROM jsonb_array_elements(parsed->'roots') r;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(parsed->'roots') r WHERE r->>'table'<>'users')
  OR jsonb_array_length(roots)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(roots)) THEN RAISE EXCEPTION 'diagnostic_maintenance_roots'; END IF;
 IF op='admin_bootstrap_promote' THEN
  IF jsonb_array_length(ids)<>1 OR roots IS DISTINCT FROM ids THEN RAISE EXCEPTION 'diagnostic_maintenance_rows'; END IF;
 ELSIF op='account_schedule' THEN
  IF jsonb_array_length(ids)>30 OR roots IS DISTINCT FROM ids THEN RAISE EXCEPTION 'diagnostic_maintenance_rows'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(i->'accounts') WITH ORDINALITY t(account,slot)
    WHERE account->>'id' IS DISTINCT FROM roster[slot::int])
    OR (i->>'mode'='revoke' AND jsonb_array_length(i->'accounts')<>5)
    OR (i->>'mode'='rotate' AND (
      (SELECT count(DISTINCT a->>'phone') FROM jsonb_array_elements(i->'accounts') a)<>jsonb_array_length(i->'accounts') OR
      (SELECT count(DISTINCT a->>'email') FROM jsonb_array_elements(i->'accounts') a)<>jsonb_array_length(i->'accounts'))) THEN
   RAISE EXCEPTION 'diagnostic_maintenance_roster'; END IF;
  IF EXISTS(SELECT 1 FROM public.listings l WHERE l.id IN ('e042b037-1e59-495d-8380-e497ad7d035e','e2354d2f-3d4f-4860-a71f-c9f1e10c37e8')
    AND (l."sellerId" IS DISTINCT FROM roster[2] OR l."businessId" IS NOT NULL)) THEN RAISE EXCEPTION 'diagnostic_maintenance_reviewer_listing'; END IF;
  SELECT jsonb_agg(a->'id' ORDER BY a->>'id') INTO wanted_ids FROM jsonb_array_elements(i->'accounts') a;
  IF roots IS DISTINCT FROM wanted_ids OR jsonb_array_length(wanted_ids)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(wanted_ids)) THEN RAISE EXCEPTION 'diagnostic_maintenance_roster'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(i->'accounts') LOOP
   uid:=a->>'id'; stored:=public.diagnostic_source_read('users',jsonb_build_object('id',uid));
   IF (jsonb_typeof(a)='object' AND a-ARRAY['id','phone','email']='{}' AND a ?& ARRAY['id','phone','email']
    AND public.diagnostic_maintenance_reviewer_role(uid) IS NOT NULL) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_maintenance_roster'; END IF;
   IF stored IS NOT NULL AND (stored->>'role' IS DISTINCT FROM public.diagnostic_maintenance_reviewer_role(uid)
    OR stored->>'suspendedAt' IS NOT NULL OR stored->>'deletionScheduledAt' IS NOT NULL
    OR stored->>'phoneVerifiedAt' IS NULL OR stored->>'emailVerifiedAt' IS NULL) THEN RAISE EXCEPTION 'diagnostic_maintenance_reviewer_source'; END IF;
   IF i->>'mode'='rotate' THEN
    IF (jsonb_typeof(a->'phone')='string' AND a->>'phone' ~ '^\+993[0-9]{8}$'
     AND jsonb_typeof(a->'email')='string' AND a->>'email'=public.diagnostic_maintenance_email(a->>'email')
     AND a->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') IS NOT TRUE
     OR EXISTS(SELECT 1 FROM public.users u WHERE u.id<>uid AND (u.phone=a->>'phone' OR public.diagnostic_maintenance_email(u.email)=a->>'email')) THEN RAISE EXCEPTION 'diagnostic_maintenance_reviewer_destination'; END IF;
   ELSIF a->>'phone' IS DISTINCT FROM 'revoked:'||uid OR a->'email' IS DISTINCT FROM 'null' THEN RAISE EXCEPTION 'diagnostic_maintenance_reviewer_destination'; END IF;
  END LOOP;
  -- Every changed existing slot is explicit; no caller may omit the final slot.
  SELECT coalesce(jsonb_agg(a->'id' ORDER BY a->>'id'),'[]') INTO actual_ids FROM jsonb_array_elements(i->'accounts') a
   JOIN public.users u ON u.id=a->>'id'
   WHERE i->>'mode'='revoke' OR u.phone IS DISTINCT FROM a->>'phone' OR u.email IS DISTINCT FROM a->>'email';
  IF ids IS DISTINCT FROM actual_ids THEN RAISE EXCEPTION 'diagnostic_maintenance_roster'; END IF;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(parsed->'rows') LOOP
  uid:=e->'key'->>'id'; prior:=e->'expected'->'source'; target:=e->'next';
  IF op='admin_bootstrap_promote' THEN
   IF (prior->>'role' IN ('buyer','seller','moderator')) IS NOT TRUE OR target IS DISTINCT FROM prior||jsonb_build_object('role','admin') THEN RAISE EXCEPTION 'diagnostic_maintenance_promotion_fields'; END IF;
   selector:=i->'selector';
   IF selector->>'channel'='phone' THEN
    IF prior->>'phone' IS DISTINCT FROM selector->>'value' THEN RAISE EXCEPTION 'diagnostic_maintenance_selector'; END IF;
   ELSE
    normalized:=public.diagnostic_maintenance_email(selector->>'value');
    IF selector->>'value' IS DISTINCT FROM normalized OR prior->>'emailVerifiedAt' IS NULL OR
     public.diagnostic_maintenance_email(prior->>'email') IS DISTINCT FROM normalized OR
     (SELECT count(*) FROM public.users u WHERE public.diagnostic_maintenance_email(u.email)=normalized)<>1 THEN RAISE EXCEPTION 'diagnostic_maintenance_selector'; END IF;
   END IF;
  ELSIF op='account_schedule' THEN
   IF (uid ~ '^de300712-0000-4000-8000-[a-f0-9]{12}$' AND prior->>'role' IN ('buyer','seller')
    AND prior->>'suspendedAt' IS NULL AND prior->>'phoneVerifiedAt' IS NOT NULL AND prior->>'emailVerifiedAt' IS NOT NULL
    AND prior->>'phone' ~ '^\+993[0-9]{8}$'
    AND uid='de300712-0000-4000-8000-'||substr(encode(sha256(convert_to('autotm-tester:'||(prior->>'phone'),'UTF8')),'hex'),1,12) AND prior->>'email' IS NOT NULL
    AND target->>'deletionScheduledAt' IS NOT NULL) IS NOT TRUE OR
    (target->>'deletionScheduledAt')::timestamp IS DISTINCT FROM least(coalesce((prior->>'deletionScheduledAt')::timestamp,stamp),stamp) THEN RAISE EXCEPTION 'diagnostic_maintenance_tester_source'; END IF;
  ELSE
   SELECT value INTO a FROM jsonb_array_elements(i->'accounts') a WHERE a->>'id'=uid;
   IF i->>'mode'='rotate' THEN
    IF target IS DISTINCT FROM public.diagnostic_source_normalize('users',prior||jsonb_build_object(
      'phone',a->'phone','email',a->'email','phoneVerifiedAt',stamp,'emailVerifiedAt',stamp)) THEN RAISE EXCEPTION 'diagnostic_maintenance_reviewer_fields'; END IF;
   ELSIF target IS DISTINCT FROM prior||jsonb_build_object('phone','revoked:'||uid,'email',NULL,'emailVerifiedAt',NULL,'displayName','Revoked '||uid) THEN RAISE EXCEPTION 'diagnostic_maintenance_reviewer_fields'; END IF;
  END IF;
 END LOOP;
 PERFORM public.diagnostic_source_fk_effects(parsed);
 IF op='account_schedule' THEN PERFORM public.diagnostic_source_account_effects(parsed); END IF;
 RETURN parsed;
END $$;

-- Effects participate in ordinary scope discovery before the lock prefix. Add
-- Session incoming proof edges and device rows explicitly: User-root rank alone
-- does not include those dependency-only device rows.
ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_maintenance;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE roots jsonb:=c->'roots'; sessions jsonb; r record;
BEGIN
 IF public.diagnostic_maintenance_selected(c) IS TRUE THEN
  sessions:=public.diagnostic_maintenance_sessions(c);
  FOR r IN SELECT p.id FROM public.diagnostic_continuity_proofs p WHERE EXISTS
   (SELECT 1 FROM jsonb_array_elements(sessions) s WHERE s->'key'->>'id'=p."issuerSessionId") LOOP
   roots:=roots||jsonb_build_array(jsonb_build_object('table','diagnostic_continuity_proofs','key',jsonb_build_object('id',r.id)));
  END LOOP;
  IF c->>'operation'='reviewer_credentials_change' THEN
   roots:=roots||jsonb_build_array(
    jsonb_build_object('table','listings','key',jsonb_build_object('id','e042b037-1e59-495d-8380-e497ad7d035e')),
    jsonb_build_object('table','listings','key',jsonb_build_object('id','e2354d2f-3d4f-4860-a71f-c9f1e10c37e8')));
   FOR r IN SELECT d.id FROM public.fcm_devices d WHERE d."invalidatedAt" IS NULL AND EXISTS
    (SELECT 1 FROM jsonb_array_elements(c->'rows') e WHERE e->'key'->>'id'=d."userId") LOOP
    roots:=roots||jsonb_build_array(jsonb_build_object('table','fcm_devices','key',jsonb_build_object('id',r.id)));
   END LOOP;
  END IF;
 END IF;
 RETURN public.diagnostic_source_scope_before_maintenance(c||jsonb_build_object('roots',roots));
END $$;

ALTER FUNCTION public.diagnostic_source_lock_keys(jsonb,jsonb) RENAME TO diagnostic_source_lock_keys_before_maintenance;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; all_rows jsonb; e jsonb; value text; audit jsonb;
BEGIN
 all_rows:=c->'rows';
 IF public.diagnostic_maintenance_selected(c) IS TRUE THEN all_rows:=all_rows||public.diagnostic_source_fk_effects(c)||public.diagnostic_source_account_effects(c); END IF;
 result:=public.diagnostic_source_lock_keys_before_maintenance(scope,c||jsonb_build_object('rows',all_rows));
 FOR value IN
  SELECT public.diagnostic_maintenance_email(r->>'email') FROM (
   SELECT e->'row' AS r FROM jsonb_array_elements(scope) e WHERE e->>'table'='users'
   UNION ALL SELECT e->'next' FROM jsonb_array_elements(all_rows) e WHERE e->>'table'='users'
   UNION ALL SELECT a FROM jsonb_array_elements(coalesce(c->'intent'->'accounts','[]')) a
  ) rows WHERE r->>'email' IS NOT NULL
 LOOP
  result:=result||jsonb_build_array(jsonb_build_object('namespace',897100,'key',hashtext(jsonb_build_array('canonical_email',value)::text)));
 END LOOP;
 IF c->>'operation'='reviewer_credentials_change' THEN
  FOR e IN SELECT value FROM jsonb_array_elements(c->'intent'->'accounts') LOOP
   IF e->>'phone' IS NOT NULL THEN result:=result||jsonb_build_array(jsonb_build_object('namespace',897100,'key',hashtext(jsonb_build_array('unique',jsonb_build_array('phone'),jsonb_build_object('phone',e->'phone'))::text))); END IF;
   IF e->>'email' IS NOT NULL THEN result:=result||jsonb_build_array(jsonb_build_object('namespace',897100,'key',hashtext(jsonb_build_array('unique',jsonb_build_array('email'),jsonb_build_object('email',e->'email'))::text))); END IF;
  END LOOP;
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(key ORDER BY (key->>'namespace')::int,(key->>'key')::int),'[]') FROM (SELECT DISTINCT value AS key FROM jsonb_array_elements(result)) d);
END $$;

ALTER FUNCTION public.campaign_source_mutations(jsonb,jsonb) RENAME TO campaign_source_mutations_before_maintenance;
CREATE FUNCTION public.campaign_source_mutations(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.diagnostic_maintenance_selected(c) IS TRUE THEN
  c:=c||jsonb_build_object('rows',(c->'rows')||public.diagnostic_source_fk_effects(c)||public.diagnostic_source_account_effects(c)); END IF;
 RETURN public.campaign_source_mutations_before_maintenance(scope,c);
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_user_insert_fence() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE destination_key integer;
BEGIN
 FOR destination_key IN SELECT DISTINCT key FROM (
  SELECT hashtext(jsonb_build_array('unique',jsonb_build_array(field),jsonb_build_object(field,value))::text) AS key
   FROM (VALUES ('phone',NEW.phone),('email',NEW.email)) slots(field,value) WHERE value IS NOT NULL
  UNION ALL SELECT hashtext(jsonb_build_array('canonical_email',public.diagnostic_maintenance_email(NEW.email))::text) WHERE NEW.email IS NOT NULL
 ) keys ORDER BY key LOOP
  IF NOT pg_try_advisory_xact_lock(897100,destination_key) THEN RAISE EXCEPTION 'diagnostic_source_user_insert_busy' USING ERRCODE='40001'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.diagnostic_purge_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text
  AND (command->>'operation'='account_purge' OR (command->>'operation'='staff_bootstrap' AND TG_TABLE_NAME='audit_logs')
   OR (command->>'operation' IN ('session_change','listing_delete','account_schedule','account_restore','user_eligibility','admin_bootstrap_promote','reviewer_credentials_change') AND TG_TABLE_NAME<>'diagnostic_source_anchors')
   OR (command->>'operation' IN ('member_create','member_replace') AND TG_TABLE_NAME IN ('dealerships','measurement_state')))) THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
