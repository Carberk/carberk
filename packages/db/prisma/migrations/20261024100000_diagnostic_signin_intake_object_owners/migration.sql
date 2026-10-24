-- Forward-only source representability and opposing-writer corrections.
-- Guards/admission stay dormant/closed. Existing application authority remains
-- mandatory; a source receipt proves coverage, never code or runtime admission.
ALTER FUNCTION public.diagnostic_source_allows(text,text,text) RENAME TO diagnostic_source_allows_before_signin;
CREATE FUNCTION public.diagnostic_source_allows(op text,t text,v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN op='sign_in_method_change' THEN t='users' AND v='update'
 ELSE public.diagnostic_source_allows_before_signin(op,t,v) END
$$;
ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_signin_intake;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; r jsonb; prior jsonb; target jsonb; pair text[]; changed integer:=0; ids jsonb;
BEGIN
 IF c->>'operation'='intake_create' AND c ? 'intent' THEN
  IF (jsonb_typeof(c->'intent')='object' AND c->'intent'-'receptionQualificationIds'='{}'
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
END $$;

ALTER FUNCTION public.diagnostic_intake_effects(jsonb) RENAME TO diagnostic_intake_effects_before_peer_selection;
CREATE FUNCTION public.diagnostic_intake_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; selected text[]; qualified text[]; assignment_ids text[]; oid text; cid text;
BEGIN
 effects:=public.diagnostic_intake_effects_before_peer_selection(c);
 IF c->>'operation'<>'intake_create' THEN RETURN effects; END IF;
 oid:=c->'rows'->0->'next'->>'id'; cid:=c->'rows'->0->'next'->>'centerId';
 SELECT coalesce(array_agg(a.id ORDER BY a.id),'{}') INTO qualified
  FROM public.diagnostic_center_assignments a JOIN public.users u ON u.id=a."userId"
  JOIN public.staff_grants g ON g."userId"=u.id AND g.capability=a.capability AND g."revokedAt" IS NULL
  WHERE a."centerId"=cid AND a.capability='diagnostics.reception' AND a."revokedAt" IS NULL
   AND a."qualifiedUntil">clock_timestamp()::timestamp AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL;
 IF c ? 'intent' THEN
  SELECT array_agg(id ORDER BY id) INTO selected FROM jsonb_array_elements_text(c->'intent'->'receptionQualificationIds') id;
 ELSE selected:=qualified; END IF;
 IF coalesce(cardinality(selected),0)=0 OR NOT selected<@qualified THEN RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
 SELECT array_agg(public.diagnostic_intake_uuid('diagnostic-source:intake-assignment:'||oid||':'||id)) INTO assignment_ids FROM unnest(selected) id;
 -- Retain the exact original audit and generated assignment tuples. SQL checks
 -- qualifications/grants/eligibility independently of the runtime's selection.
 RETURN (SELECT coalesce(jsonb_agg(e ORDER BY e::text),'[]') FROM jsonb_array_elements(effects) e
  WHERE e->>'table'<>'diagnostic_order_assignments' OR e->'key'->>'id'=ANY(assignment_ids));
END $$;

-- Both existing INSERT triggers retain their shared ownership check. A late
-- material writer cannot wait for a key held by an evidence INSERT whose FK is
-- waiting on that writer's prepared Report. Contention aborts, never bypasses.
CREATE OR REPLACE FUNCTION public.diagnostic_object_owner_disjoint() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('diagnostic-object-owner:'||NEW.id)::bigint) THEN
  RAISE EXCEPTION 'diagnostic_object_owner_busy' USING ERRCODE='40001'; END IF;
 IF (TG_TABLE_NAME='diagnostic_evidence' AND EXISTS(SELECT 1 FROM public.diagnostic_identity_provenance p WHERE p.id=NEW.id))
  OR (TG_TABLE_NAME='diagnostic_identity_provenance' AND EXISTS(SELECT 1 FROM public.diagnostic_evidence e WHERE e.id=NEW.id)) THEN
  RAISE EXCEPTION 'diagnostic_object_owner_disjoint'; END IF;
 RETURN NEW;
END $$;
