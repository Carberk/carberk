-- Finite publication effects belong to existing listing_create. Caller rows
-- remain Listing-only. All additional effects are derived from persisted owners.
CREATE FUNCTION public.diagnostic_listing_publication_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE i jsonb:=c->'intent'->'publication'; d jsonb; l jsonb; p jsonb; u jsonb; v jsonb; g jsonb; principal jsonb; e jsonb;
 effects jsonb:='[]'; stamp timestamp(3); lid text; uid text:=c->>'actorUserId'; ready boolean; pending boolean;
BEGIN
 IF c->>'operation'<>'listing_create' OR i IS NULL THEN RETURN effects; END IF;
 l:=c->'rows'->0->'next'; lid:=l->>'id'; stamp:=(i->>'at')::timestamptz AT TIME ZONE 'UTC';
 d:=public.diagnostic_source_read('listing_drafts',jsonb_build_object('id',i->'draftId'));
 IF d IS NULL OR (d->>'businessId' IS NULL AND d->>'userId' IS DISTINCT FROM uid) OR d->'businessId' IS DISTINCT FROM l->'businessId'
  OR l->>'sellerId' IS DISTINCT FROM uid THEN RAISE EXCEPTION 'listing_publication_draft_owner'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('brandId'),('modelId'),('year')) f(name)
  WHERE coalesce(d->'payload'->f.name,'null') IS DISTINCT FROM l->f.name) THEN RAISE EXCEPTION 'listing_publication_draft_listing'; END IF;
 IF upper(d->'payload'->>'vin') IS DISTINCT FROM l->>'vin' THEN RAISE EXCEPTION 'listing_publication_draft_listing'; END IF;
 IF (SELECT coalesce(jsonb_agg(jsonb_build_object('photoId',x->'photoId','key',x->'key','sortOrder',x->'sortOrder') ORDER BY x->>'photoId'),'[]') FROM jsonb_array_elements(d->'payload'->'photos') x WHERE x->>'key' IS NOT NULL)
  IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('photoId',x->'photoId','key',x->'key','sortOrder',x->'sortOrder') ORDER BY x->>'photoId') FROM jsonb_array_elements(i->'photos') x)
 THEN RAISE EXCEPTION 'listing_publication_photos'; END IF;
 effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('listing_drafts',d,'{}',true));
 FOR p IN SELECT value FROM jsonb_array_elements(i->'photos') LOOP
  u:=public.diagnostic_source_read('media_uploads',jsonb_build_object('id',p->'uploadId'));
  IF u IS NULL OR (d->>'businessId' IS NULL AND u->>'userId' IS DISTINCT FROM uid) OR u->'businessId' IS DISTINCT FROM d->'businessId'
   OR u->'key' IS DISTINCT FROM p->'key' OR u->>'kind'<>'image'
   OR u->>'claimTargetType'<>'listing' OR u->>'claimTargetId' IS DISTINCT FROM lid
  THEN RAISE EXCEPTION 'listing_publication_upload'; END IF;
  IF public.diagnostic_source_read('listing_media',jsonb_build_object('id',p->'photoId')) IS NOT NULL THEN RAISE EXCEPTION 'listing_publication_photo_collision'; END IF;
  e:=jsonb_build_object('id',p->'photoId','listingId',lid,'kind','image','key',p->'key','sortOrder',p->'sortOrder',
   'width',NULL,'height',NULL,'durationMs',NULL,'posterKey',NULL,'thumbHash',p->'thumbHash','createdAt',stamp,'uploadId',p->'uploadId');
  effects:=effects||jsonb_build_array(jsonb_build_object('table','listing_media','key',jsonb_build_object('id',p->'photoId'),'verb','insert','expected','absent','next',public.diagnostic_source_normalize('listing_media',e)));
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('media_uploads',u,jsonb_build_object('state','ADOPTED','claimToken',NULL,'claimDeadline',NULL))-'derived');
 END LOOP;
 -- Select the actual latest draft candidate on every discovery, including
 -- invalid candidates. Invalid candidates are dependencies, never mutations.
 SELECT to_jsonb(s) INTO v FROM public.video_upload_sessions s WHERE s."protocolVersion"=1 AND s."targetKind"='draft' AND s."targetId"=i->>'draftId'
  ORDER BY s."targetRevision" DESC,s.id DESC LIMIT 1;
 IF v IS NOT NULL THEN
  u:=public.diagnostic_source_read('media_uploads',jsonb_build_object('id',v->'uploadId'));
  g:=public.diagnostic_source_read('video_generations',jsonb_build_object('id',v->'id'));
  IF u IS NOT NULL AND g IS NOT NULL AND v->>'cancelledAt' IS NULL AND (v->>'expiresAt')::timestamp>stamp AND (v->>'targetRevision')::int>0
   AND u->'businessId'=d->'businessId' AND u->'userId'=v->'userId' AND u->>'writeProtocol'='video-v1' AND u->>'kind'='video'
   AND u->>'state'='PREPARING' AND u->'claimToken'=v->'id' AND u->>'claimTargetType'='video_session' AND u->'claimTargetId'=v->'id'
   AND u->'key'=v->'sourceKey' AND v->>'sourceKey'='video/v1/'||(u->>'id')||'/'||(v->>'id')||'/source.mp4'
   AND g->'sessionId'=v->'id' AND g->'uploadId'=u->'id' AND g->'listingId'=i->'draftId'
   AND g->'targetRevision'=v->'targetRevision' AND g->>'retiredAt' IS NULL THEN
   ready:=v->>'state'='READY' AND g->>'state'='READY' AND g->>'readyAt' IS NOT NULL AND (g->>'durationMs')::int BETWEEN 1 AND 90000
    AND g->>'posterKey'='video/v1/'||(u->>'id')||'/'||(g->>'id')||'/poster.jpg' AND g->>'manifest' IS NOT NULL;
   pending:=v->>'state' IN ('INITIALIZING','UPLOADING','PAUSED','COMPLETING','PROCESSING') AND g->>'state' IN ('UPLOADING','PROCESSING');
   IF ready OR pending THEN
    IF (ready AND l->'activeVideoGenerationId' IS DISTINCT FROM g->'id') OR (pending AND l->'pendingVideoGenerationId' IS DISTINCT FROM g->'id')
     OR l->'activeVideoRevision' IS DISTINCT FROM v->'targetRevision' THEN RAISE EXCEPTION 'listing_publication_video_binding'; END IF;
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_upload_sessions',v,jsonb_build_object('targetKind','listing','targetId',lid,'listingId',lid,'updatedAt',stamp))-'derived',
     public.diagnostic_purge_effect('video_generations',g,jsonb_build_object('listingId',lid))-'derived');
    IF ready THEN effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('media_uploads',u,jsonb_build_object('state','ADOPTED','claimTargetType','listing','claimTargetId',lid,'claimToken',NULL,'claimDeadline',NULL))-'derived'); END IF;
   END IF;
  END IF;
 END IF;
 IF NOT coalesce(ready,false) AND l->>'activeVideoGenerationId' IS NOT NULL OR NOT coalesce(pending,false) AND l->>'pendingVideoGenerationId' IS NOT NULL THEN RAISE EXCEPTION 'listing_publication_video_binding'; END IF;
 e:=jsonb_build_object('id',i->'auditId','actorId',uid,'action','listing.published','targetType','Listing','targetId',lid,'createdAt',stamp,
  'details',jsonb_build_object('brandId',d->'payload'->'brandId','modelId',d->'payload'->'modelId','cityId',d->'payload'->'cityId','priceAmount',d->'payload'->'priceAmount','priceCurrency',d->'payload'->'priceCurrency'));
 IF public.diagnostic_source_read('audit_logs',jsonb_build_object('id',i->'auditId')) IS NOT NULL THEN RAISE EXCEPTION 'listing_publication_audit_collision'; END IF;
 effects:=effects||jsonb_build_array(jsonb_build_object('table','audit_logs','key',jsonb_build_object('id',i->'auditId'),'verb','insert','expected','absent','next',public.diagnostic_source_normalize('audit_logs',e)));
 IF i ? 'measurement' THEN
  principal:=public.diagnostic_source_read('measurement_principals',jsonb_build_object('id',i->'measurement'->'principalId'));
  IF principal->>'userId' IS DISTINCT FROM uid OR principal->'generation' IS DISTINCT FROM i->'measurement'->'generation'
   OR principal->'epoch' IS DISTINCT FROM i->'measurement'->'epoch'
   OR (SELECT epoch FROM public.measurement_state WHERE key='collector') IS DISTINCT FROM i->'measurement'->>'epoch'
  THEN RAISE EXCEPTION 'listing_publication_measurement_identity'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(i->'measurement'->'events') LOOP
   IF public.diagnostic_source_read('measurement_outbox',jsonb_build_object('id',e->'eventId')) IS NOT NULL THEN RAISE EXCEPTION 'listing_publication_event_collision'; END IF;
   p:=jsonb_build_object('id',e->'eventId','principalId',principal->'id','generation',principal->'generation','epoch',principal->'epoch',
    'environment',i->'measurement'->'environment','population','synthetic','conversionEligible',true,'event',e,
    'createdAt',i->'measurement'->'createdAt'->(e->>'eventId'),'expiresAt',i->'measurement'->'expiresAt'->(e->>'eventId'));
   effects:=effects||jsonb_build_array(jsonb_build_object('table','measurement_outbox','key',jsonb_build_object('id',e->'eventId'),'verb','insert','expected','absent',
    'next',public.diagnostic_source_normalize('measurement_outbox',p),'derived','purge','publicationOptional',true));
  END LOOP;
 END IF;
 RETURN effects;
END $$;

ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; i jsonb:=c->'intent'->'publication'; p jsonb; m jsonb; e jsonb; lid text;
BEGIN
 IF c->>'operation'<>'listing_create' OR NOT c ? 'intent' THEN RETURN public.diagnostic_source_parse_before_listing_publication(c); END IF;
 IF (c->'intent')-'publication'<>'{}' OR i IS NULL OR jsonb_typeof(i)<>'object'
  OR i-ARRAY['draftId','photos','auditId','at','measurement']<>'{}' OR NOT i ?& ARRAY['draftId','photos','auditId','at']
  OR jsonb_typeof(i->'draftId')<>'string' OR jsonb_typeof(i->'auditId')<>'string' OR jsonb_typeof(i->'at')<>'string'
  OR jsonb_typeof(i->'photos')<>'array' THEN RAISE EXCEPTION 'listing_publication_intent_shape'; END IF;
 IF jsonb_array_length(i->'photos') NOT BETWEEN 3 AND 20 THEN RAISE EXCEPTION 'listing_publication_photo_count'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(i->'photos') LOOP
  IF p-ARRAY['photoId','uploadId','key','sortOrder','thumbHash']<>'{}' OR NOT p ?& ARRAY['photoId','uploadId','key','sortOrder','thumbHash']
   OR jsonb_typeof(p->'photoId')<>'string' OR jsonb_typeof(p->'uploadId')<>'string' OR jsonb_typeof(p->'key')<>'string'
   OR jsonb_typeof(p->'sortOrder')<>'number' OR jsonb_typeof(p->'thumbHash') NOT IN ('string','null')
  THEN RAISE EXCEPTION 'listing_publication_photo_shape'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM (VALUES ('photoId'),('uploadId'),('key')) f(name) WHERE
  (SELECT count(DISTINCT x->>f.name) FROM jsonb_array_elements(i->'photos') x)<>jsonb_array_length(i->'photos')) THEN RAISE EXCEPTION 'listing_publication_photo_duplicate'; END IF;
 -- Delegate every original row/operation check without widening the allowlist.
 -- Publication effects are server derived, never admitted as caller rows.
 parsed:=public.diagnostic_source_parse_before_listing_publication(c-'intent');
 IF jsonb_array_length(parsed->'rows')<>1 THEN RAISE EXCEPTION 'listing_publication_listing_count'; END IF;
 lid:=parsed->'rows'->0->'key'->>'id';
 IF i ? 'measurement' THEN
  m:=i->'measurement';
  IF jsonb_typeof(m)<>'object' OR m-ARRAY['events','principalId','generation','epoch','environment','createdAt','expiresAt']<>'{}'
   OR NOT m ?& ARRAY['events','principalId','generation','epoch','environment','createdAt','expiresAt']
   OR jsonb_typeof(m->'events')<>'array' OR jsonb_array_length(m->'events')<>2
   OR m->>'environment' NOT IN ('test','staging','production') OR jsonb_typeof(m->'principalId')<>'string'
   OR jsonb_typeof(m->'generation')<>'string' OR jsonb_typeof(m->'epoch')<>'string'
   OR jsonb_typeof(m->'createdAt')<>'object' OR jsonb_typeof(m->'expiresAt')<>'object'
  THEN RAISE EXCEPTION 'listing_publication_measurement_shape'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(m->'createdAt'))<>2 OR (SELECT count(*) FROM jsonb_object_keys(m->'expiresAt'))<>2
   OR m->'events'->0->>'eventId'=m->'events'->1->>'eventId' THEN RAISE EXCEPTION 'listing_publication_measurement_shape'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(m->'events') LOOP
   IF e-ARRAY['version','eventId','occurredAt','purpose','eventName','context','payload']<>'{}'
    OR e->>'version'<>'1' OR e->>'purpose'<>'product_improvement' OR e->'context' IS DISTINCT FROM '{"platform":"server","release":"server","build":"server","locale":"ru"}'::jsonb
    OR e->'payload'->>'listingId' IS DISTINCT FROM lid OR e->'occurredAt' IS DISTINCT FROM i->'at'
    OR jsonb_typeof(m->'createdAt'->(e->>'eventId')) IS DISTINCT FROM 'string' OR jsonb_typeof(m->'expiresAt'->(e->>'eventId')) IS DISTINCT FROM 'string'
    OR (m->'expiresAt'->>(e->>'eventId'))::timestamptz-(m->'createdAt'->>(e->>'eventId'))::timestamptz<>interval '7 days'
    OR NOT ((e->>'eventName'='listing_published' AND (e->'payload')-ARRAY['listingId','cityId','draftId']='{}' AND e->'payload'->'draftId'=i->'draftId' AND e->'payload'->'cityId'=(public.diagnostic_source_read('listing_drafts',jsonb_build_object('id',i->'draftId'))->'payload'->'cityId'))
     OR (e->>'eventName'='listing_visibility_changed' AND e->'payload'=jsonb_build_object('listingId',lid,'visibility','public','reason','published')))
   THEN RAISE EXCEPTION 'listing_publication_event'; END IF;
  END LOOP;
  IF m->'events'->0->>'eventName'<>'listing_published' OR m->'events'->1->>'eventName'<>'listing_visibility_changed' THEN RAISE EXCEPTION 'listing_publication_event'; END IF;
 END IF;
 parsed:=parsed||jsonb_build_object('intent',jsonb_build_object('publication',i));
 PERFORM public.diagnostic_listing_publication_effects(parsed);
 RETURN parsed;
END $$;

-- Re-evaluated by the existing receipt before and after every managed wait.
-- Dynamic selectors include absent collector, reverse adopters, cleanup and the
-- latest video candidate even when the candidate produces no mutation.
CREATE FUNCTION public.diagnostic_listing_publication_graph(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE roots jsonb:=c->'roots'; effects jsonb; e jsonb; p jsonb; v record; r record;
BEGIN
 IF c->>'operation'<>'listing_create' OR NOT c->'intent' ? 'publication' THEN RETURN c; END IF;
 effects:=public.diagnostic_listing_publication_effects(c);
 FOR e IN SELECT value FROM jsonb_array_elements(effects) LOOP roots:=roots||jsonb_build_array(jsonb_build_object('table',e->'table','key',e->'key')); END LOOP;
 FOR v IN SELECT s.id,s."uploadId" FROM public.video_upload_sessions s WHERE s."protocolVersion"=1 AND s."targetKind"='draft' AND s."targetId"=c->'intent'->'publication'->>'draftId' ORDER BY s."targetRevision" DESC,s.id DESC LIMIT 1 LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table','video_upload_sessions','key',jsonb_build_object('id',v.id)),jsonb_build_object('table','video_generations','key',jsonb_build_object('id',v.id)),jsonb_build_object('table','media_uploads','key',jsonb_build_object('id',v."uploadId")));
 END LOOP;
 FOR p IN SELECT value FROM jsonb_array_elements(c->'intent'->'publication'->'photos') UNION ALL
  SELECT jsonb_build_object('uploadId',s."uploadId") FROM public.video_upload_sessions s WHERE s."protocolVersion"=1 AND s."targetKind"='draft' AND s."targetId"=c->'intent'->'publication'->>'draftId' ORDER BY 1 LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table','media_upload_cleanups','key',jsonb_build_object('uploadId',p->'uploadId')));
  FOR r IN SELECT 'users' AS t,id FROM public.users WHERE "avatarUploadId"=p->>'uploadId' UNION ALL SELECT 'listing_media',id FROM public.listing_media WHERE "uploadId"=p->>'uploadId' LOOP
   roots:=roots||jsonb_build_array(jsonb_build_object('table',r.t,'key',jsonb_build_object('id',r.id)));
  END LOOP;
 END LOOP;
 IF c->'intent'->'publication' ? 'measurement' THEN
  roots:=roots||jsonb_build_array(jsonb_build_object('table','measurement_state','key',jsonb_build_object('key','collector')),
   jsonb_build_object('table','measurement_principals','key',jsonb_build_object('id',c->'intent'->'publication'->'measurement'->'principalId')));
 END IF;
 RETURN c||jsonb_build_object('roots',roots,'rows',(c->'rows')||effects);
END $$;
ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_scope_before_listing_publication(public.diagnostic_listing_publication_graph(c))
$$;
ALTER FUNCTION public.diagnostic_source_effects(jsonb,jsonb) RENAME TO diagnostic_source_effects_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_effects(c jsonb,scope jsonb) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_effects_before_listing_publication(c,scope)||public.diagnostic_listing_publication_effects(c)
$$;
ALTER FUNCTION public.campaign_source_mutations(jsonb,jsonb) RENAME TO campaign_source_mutations_before_listing_publication;
CREATE FUNCTION public.campaign_source_mutations(scope jsonb,c jsonb) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT public.campaign_source_mutations_before_listing_publication(scope,public.diagnostic_listing_publication_graph(c))
$$;
ALTER FUNCTION public.diagnostic_source_lock_keys(jsonb,jsonb) RENAME TO diagnostic_source_lock_keys_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; p jsonb; t text; m jsonb; fields jsonb; k jsonb;
BEGIN
 result:=public.diagnostic_source_lock_keys_before_listing_publication(scope,public.diagnostic_listing_publication_graph(c));
 IF c->>'operation'='listing_create' AND c->'intent' ? 'publication' THEN
  FOR p IN SELECT value FROM jsonb_array_elements(c->'intent'->'publication'->'photos') UNION ALL
   SELECT jsonb_build_object('uploadId',n->'row'->'uploadId') FROM jsonb_array_elements(scope) n WHERE n->>'table'='video_upload_sessions' LOOP
   FOREACH t IN ARRAY ARRAY['users','listing_media'] LOOP
    m:=public.diagnostic_source_meta(t);
    fields:=CASE t WHEN 'users' THEN '["avatarUploadId"]'::jsonb ELSE '["uploadId"]'::jsonb END;
    IF NOT (m->'unique') @> jsonb_build_array(fields) THEN RAISE EXCEPTION 'listing_publication_unique_metadata'; END IF;
    k:=public.diagnostic_source_project(jsonb_build_object(fields->>0,p->'uploadId'),fields);
    result:=result||jsonb_build_array(jsonb_build_object('namespace',(m->>'namespace')::int,'key',hashtext(jsonb_build_array('unique',fields,k)::text)));
   END LOOP;
  END LOOP;
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'namespace')::int,(x->>'key')::int),'[]') FROM (SELECT DISTINCT value x FROM jsonb_array_elements(result)) d);
END $$;

-- Only these two server-derived outbox rows permit optional absence. The
-- existing purge completion invokes this predicate; every present row must be
-- exact. All mandatory source effects retain their original completion checks.
ALTER FUNCTION public.diagnostic_purge_tuple(jsonb,jsonb,boolean) RENAME TO diagnostic_purge_tuple_before_listing_publication;
CREATE FUNCTION public.diagnostic_purge_tuple(e jsonb,r jsonb,final boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF e->>'publicationOptional'='true' AND e->>'table'='measurement_outbox' AND e->>'verb'='insert' THEN
  RETURN (final AND r IS NULL) OR r IS NOT DISTINCT FROM e->'next';
 END IF;
 RETURN public.diagnostic_purge_tuple_before_listing_publication(e,r,final);
END $$;

-- Dependency-table protocols remain ordinary outside a live publication.
-- During publication every effective write must match the same outer receipt.
CREATE FUNCTION public.diagnostic_listing_publication_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text AND command->>'operation'='listing_create' AND command->'intent' ? 'publication') THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $install$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['listing_drafts','listing_media','media_uploads','video_upload_sessions','video_generations','measurement_outbox','audit_logs','media_upload_cleanups'] LOOP
  EXECUTE format('CREATE TRIGGER zz_diagnostic_source_publication BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.diagnostic_listing_publication_guard()',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zz_diagnostic_source_publication',t);
 END LOOP;
END $install$;
ALTER FUNCTION public.diagnostic_source_guards_ready() RENAME TO diagnostic_source_guards_ready_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_guards_ready_before_listing_publication() AND NOT EXISTS(
  SELECT 1 FROM unnest(ARRAY['listing_drafts','listing_media','media_uploads','video_upload_sessions','video_generations','measurement_outbox','audit_logs','media_upload_cleanups']) x(t)
  WHERE NOT EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid=to_regclass('public.'||x.t) AND g.tgname='zz_diagnostic_source_publication'
   AND g.tgenabled='O' AND g.tgfoid='public.diagnostic_listing_publication_guard()'::regprocedure))
$$;
