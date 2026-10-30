-- Finite private intake/publication composition only. Guards and public automatic
-- admission remain dormant/CLOSED. Historical migrations and authority are unchanged.
CREATE FUNCTION public.diagnostic_intake_campaign_command(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT coalesce(c->'intent' ? 'campaignAdmission',false) THEN RETURN NULL; END IF;
 IF c->>'operation' NOT IN ('intake_create','template_publish') OR c->'intent'->'campaignAdmission' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_array_length(c->'rows')<>1 OR jsonb_typeof(c->'actorUserId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(c->'sessionId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'diagnostic_intake_composition'; END IF;
 RETURN jsonb_build_object('operation','campaign_admit','roots',jsonb_build_array(jsonb_build_object('table','diagnostic_centers',
  'key',jsonb_build_object('id',c->'rows'->0->'next'->'centerId'))),'rows','[]'::jsonb,'actorUserId',c->'actorUserId',
  'sessionId',c->'sessionId','cutoff',NULL,'campaign',NULL,'intent','{}'::jsonb);
END $$;

ALTER FUNCTION public.diagnostic_intake_effects(jsonb) RENAME TO diagnostic_intake_effects_before_composition;
CREATE FUNCTION public.diagnostic_intake_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE admission jsonb; contract jsonb; effects jsonb; base jsonb; e jsonb; q jsonb; selected text[]; qualified text[];
 cid text; oid text; at_time timestamp(3):=transaction_timestamp() AT TIME ZONE 'UTC'; peer record;
BEGIN
 admission:=public.diagnostic_intake_campaign_command(c);
 IF admission IS NULL THEN RETURN public.diagnostic_intake_effects_before_composition(c); END IF;
 contract:=public.diagnostic_campaign_intake(admission);
 effects:=contract->'effects';
 IF c->>'operation'='template_publish' THEN
  RETURN effects||public.diagnostic_intake_effects_before_composition(c-'intent');
 END IF;
 -- Keep the exact 20261024100000 selected-subset rule. During first admission,
 -- only the one persisted-roster reception qualification is additionally possible.
 cid:=c->'rows'->0->'next'->>'centerId'; oid:=c->'rows'->0->'next'->>'id';
 SELECT array_agg(id ORDER BY id) INTO selected FROM jsonb_array_elements_text(c->'intent'->'receptionQualificationIds') id;
 SELECT coalesce(array_agg(a.id ORDER BY a.id),'{}') INTO qualified
  FROM public.diagnostic_center_assignments a JOIN public.users u ON u.id=a."userId"
  JOIN public.staff_grants g ON g."userId"=u.id AND g.capability=a.capability AND g."revokedAt" IS NULL
  WHERE a."centerId"=cid AND a.capability='diagnostics.reception' AND a."revokedAt" IS NULL
   AND a."qualifiedUntil">clock_timestamp()::timestamp AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL;
 FOR e IN SELECT value FROM jsonb_array_elements(effects) WHERE value->>'table'='diagnostic_center_assignments'
  AND value->'next'->>'capability'='diagnostics.reception' LOOP
  q:=e->'next';
  IF EXISTS(SELECT 1 FROM public.users u JOIN public.staff_grants g ON g."userId"=u.id AND g.capability='diagnostics.reception' AND g."revokedAt" IS NULL
   WHERE u.id=q->>'userId' AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL) THEN qualified:=array_append(qualified,q->>'id'); END IF;
 END LOOP;
 IF coalesce(cardinality(selected),0)=0 OR NOT selected<@qualified THEN RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
 -- Original audit convention and transaction timestamp; rebuild only selected
 -- assignments, including the absent server-derived first qualification.
 base:=public.diagnostic_intake_effects_before_peer_selection(c-'intent');
 FOR e IN SELECT value FROM jsonb_array_elements(base) WHERE value->>'table'<>'diagnostic_order_assignments' LOOP
  effects:=effects||jsonb_build_array(e);
 END LOOP;
 FOR peer IN
  SELECT a.id,a."userId" AS uid,a.capability FROM public.diagnostic_center_assignments a WHERE a.id=ANY(selected)
  UNION ALL SELECT value->'next'->>'id',value->'next'->>'userId',value->'next'->>'capability'
   FROM jsonb_array_elements(contract->'effects') WHERE value->>'table'='diagnostic_center_assignments'
    AND value->'next'->>'id'=ANY(selected) LOOP
  q:=jsonb_build_object('id',public.diagnostic_intake_uuid('diagnostic-source:intake-assignment:'||oid||':'||peer.id),
   'orderId',oid,'userId',peer.uid,'capability',peer.capability,'assignedAt',at_time,'revokedAt',NULL);
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_order_assignments',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(e ORDER BY e::text),'[]') FROM jsonb_array_elements(effects) e);
END $$;

ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_composition;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; admission jsonb; ids jsonb; allowed text[];
BEGIN
 admission:=public.diagnostic_intake_campaign_command(c);
 IF admission IS NULL THEN RETURN public.diagnostic_source_parse_before_composition(c); END IF;
 allowed:=CASE WHEN c->>'operation'='intake_create' THEN ARRAY['campaignAdmission','receptionQualificationIds'] ELSE ARRAY['campaignAdmission'] END;
 IF c->'intent'-allowed<>'{}' OR c->'cutoff'<>'null' OR c->'campaign'<>'null' THEN RAISE EXCEPTION 'diagnostic_intake_composition'; END IF;
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
END $$;

ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_composition;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE roots jsonb:=c->'roots'; e jsonb;
BEGIN
 IF public.diagnostic_intake_campaign_command(c) IS NULL THEN RETURN public.diagnostic_source_scope_before_composition(c); END IF;
 -- Existing intake scope already unions every derived bootstrap/assignment/audit
 -- and its NEW references before locking. Add absent/current staff-grant slots
 -- for qualifications that do not exist yet, as well as persisted ones.
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_intake_effects(c)) WHERE value->>'table'='diagnostic_center_assignments' LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table','staff_grants','key',jsonb_build_object('userId',e->'next'->'userId','capability',e->'next'->'capability')));
 END LOOP;
 RETURN public.diagnostic_source_scope_before_composition(c||jsonb_build_object('roots',roots));
END $$;

CREATE FUNCTION public.diagnostic_intake_campaign_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE admission jsonb; ns text; m jsonb; b jsonb; admitted boolean; signature text;
BEGIN
 admission:=public.diagnostic_intake_campaign_command(OLD.command);
 IF admission IS NULL THEN RETURN OLD; END IF;
 ns:=OLD.campaigns->>0;
 IF ns IS NULL OR ns !~ '^cf_[a-f0-9]{32}$' OR jsonb_array_length(OLD.campaigns)<>1 THEN RAISE EXCEPTION 'diagnostic_intake_campaign_binding'; END IF;
 EXECUTE format('SELECT to_jsonb(b) FROM %I.campaign_diagnostic_binding b',ns) INTO b;
 IF b IS NULL THEN RAISE EXCEPTION 'diagnostic_intake_campaign_unadmitted'; END IF;
 signature:=format('%I.campaign_diagnostic_authority(text,text,text,text,text,text,text)',ns);
 EXECUTE format('SELECT to_jsonb(m) FROM %I.campaign_manifest m',ns) INTO m;
 IF m->>'state'<>'identities' OR m->>'profile'<>'campaign897-full-v3' OR m->>'delivery_version'<>'3'
  OR m->>'diagnostic_contract_hash' IS DISTINCT FROM md5(pg_get_functiondef(to_regprocedure(signature))) THEN RAISE EXCEPTION 'diagnostic_intake_campaign_unadmitted'; END IF;
 EXECUTE format('SELECT %I.campaign_diagnostic_authority($1,$2,$3,NULL,NULL,NULL,$4)',ns) INTO admitted
  USING OLD.command->>'actorUserId',OLD.command->>'sessionId',admission->'roots'->0->'key'->>'id',m->>'candidate';
 IF admitted IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_intake_campaign_unadmitted'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER diagnostic_intake_campaign_completion BEFORE DELETE ON public.diagnostic_source_commands
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_intake_campaign_completion();
