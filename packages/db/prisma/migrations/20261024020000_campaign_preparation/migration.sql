-- Dormant campaign preparation expansion. No caller activation or admission change.
-- Existing campaign tracking functions, signatures, hashes and operational allowlists
-- remain untouched. Their AFTER triggers still own all authorization and journaling.
-- Before later activation, callers must enter here before row/FK/collector locks.

CREATE FUNCTION public.campaign_preparation_tables() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT '["audit_logs", "blocked_users", "business_enquiry_audits", "content_reports", "conversation_participants", "conversations", "dealership_invitations", "dealership_members", "dealerships", "diagnostic_audits", "diagnostic_center_assignments", "diagnostic_centers", "diagnostic_order_assignments", "diagnostic_template_versions", "favorites", "inspection_orders", "listing_drafts", "listing_media", "listings", "media_uploads", "messages", "notification_preferences", "otp_requests", "owned_vehicles", "service_audits", "service_conversations", "service_erasure_fences", "service_messages", "service_outbox", "service_read_states", "sessions", "staff_grants", "support_cases", "totp_backup_codes", "totp_enrollments", "users", "verified_contact_phones"]'::jsonb
$$;

CREATE FUNCTION public.campaign_row_key(t text,r jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN t='staff_grants' THEN jsonb_build_object('userId',r->'userId','capability',r->'capability')
 WHEN t='service_read_states' THEN jsonb_build_object('conversationId',r->'conversationId','userId',r->'userId')
 WHEN t='service_erasure_fences' THEN jsonb_build_object('conversationId',r->'conversationId')
 ELSE jsonb_build_object('id',r->'id') END
$$;

-- Resolve only namespaces with an actual existing tracker on this relation.
-- OLD and NEW are evaluated independently. Tombstoned records retain ownership.
CREATE FUNCTION public.campaign_row_namespaces(t text,r jsonb,include_media boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE ns text; kind text; owned boolean; hit boolean; result jsonb:='[]'; e record; m jsonb; mapping jsonb; h text; root_id text;
BEGIN
 IF r IS NULL OR r='null' THEN RETURN result; END IF;
 FOR ns,kind IN SELECT DISTINCT n.nspname,p.proname FROM pg_trigger tr
  JOIN pg_proc p ON p.oid=tr.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE tr.tgrelid=to_regclass('public.'||t) AND tr.tgenabled='O'
   AND n.nspname ~ '^cf_[a-f0-9]{32}$' AND p.proname IN ('track_auth','track_business')
  ORDER BY n.nspname,p.proname LOOP
  EXECUTE format('SELECT CASE WHEN count(*)=1 THEN jsonb_agg(to_jsonb(m))->0 ELSE NULL END FROM %I.campaign_manifest m',ns) INTO m;
  IF m IS NULL OR m->>'reservation_id'<>substr(ns,4) OR m->>'candidate' !~ '^[a-f0-9]{40}$' OR m->>'profile' NOT IN ('campaign897-identities-v1','campaign897-business-v2','campaign897-full-v3') THEN
   RAISE EXCEPTION 'campaign_preparation_binding';
  END IF;
  IF kind='track_business' THEN
   EXECUTE format('SELECT count(*)=1 AND bool_and(tracking_hash=md5(pg_get_functiondef(to_regprocedure(%L)))) FROM %I.campaign_manifest',format('%I.track_business()',ns),ns) INTO hit;
   IF hit IS NOT TRUE THEN RAISE EXCEPTION 'campaign_preparation_tracking_changed'; END IF;
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.campaign_records WHERE table_name=$1 AND row_key=$2 AND ($3=''track_business'' OR NOT deleted))',ns)
   INTO owned USING t,public.campaign_row_key(t,r),kind;
  IF t='users' THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.campaign_entities WHERE user_id=$1 OR email=$2)',ns) INTO hit USING r->>'id',r->>'email';
   owned:=owned OR hit;
  ELSIF kind='track_auth' THEN
   IF t='totp_backup_codes' THEN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.totp_enrollments t JOIN %I.campaign_entities e ON e.user_id=t."userId" WHERE t.id=$1)',ns) INTO hit USING r->>'totpEnrollmentId';
   ELSE
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.campaign_entities WHERE user_id=$1 OR ($2=''otp_requests'' AND email=$3) OR ($2=''audit_logs'' AND $4=''User'' AND user_id=$5))',ns)
     INTO hit USING CASE WHEN t='audit_logs' THEN r->>'actorId' ELSE r->>'userId' END,t,r->>'destination',r->>'targetType',r->>'targetId';
   END IF;
   owned:=owned OR hit;
  ELSIF t='dealerships' THEN
   h:=encode(sha256(convert_to((m->>'reservation_id')||':campaign897-business:'||(m->>'candidate')||':'||(m->>'profile')||':'||(m->>'reservation_id')||':root','UTF8')),'hex');
   root_id:=substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12);
   h:=encode(sha256(convert_to((m->>'reservation_id')||':'||(m->>'candidate')||':business-contact','UTF8')),'hex');
   owned:=owned OR r->>'id'=root_id OR r->>'slug'='campaign897-'||(m->>'reservation_id')||'-'||left(m->>'candidate',12)
    OR r->>'contactPhone'='+999'||lpad(((('x'||left(h,12))::bit(48)::bigint)%1000000000000)::text,12,'0');
  ELSIF t='diagnostic_centers' THEN
   h:=encode(sha256(convert_to((m->>'reservation_id')||':campaign897:diagnostics:center:'||(m->>'reservation_id')||':'||(m->>'candidate'),'UTF8')),'hex');
   root_id:=substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12);
   owned:=owned OR r->>'id'=root_id OR r->>'code'='campaign897-'||(m->>'reservation_id')||'-'||left(m->>'candidate',12)||'-diagnostics';
  ELSIF t='otp_requests' THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.campaign_entities WHERE user_id=$1 OR email=$2)',ns) INTO hit USING r->>'userId',r->>'destination';
   owned:=owned OR hit;
  ELSE
   mapping:=CASE WHEN t IN ('support_cases','service_conversations','service_messages','service_outbox','service_read_states','service_audits','service_erasure_fences') THEN '{"conversationId": "service_conversations", "supportCaseId": "support_cases", "historyRequestId": "vehicle_history_requests", "attachmentId": "service_attachments", "customerId": "users", "assigneeId": "users", "senderId": "users", "userId": "users", "actorId": "users", "targetStaffId": "users", "resourceId": "support_cases", "sourceListingId": "listings"}'::jsonb
    WHEN t IN ('diagnostic_center_assignments','diagnostic_template_versions','inspection_orders','diagnostic_order_assignments','diagnostic_audits') THEN '{"centerId": "diagnostic_centers", "templateVersionId": "diagnostic_template_versions", "orderId": "inspection_orders", "userId": "users", "actorId": "users", "commissionerId": "users", "publishedById": "users", "listingId": "listings"}'::jsonb
    ELSE '{"businessId": "dealerships", "dealershipId": "dealerships", "sellerId": "users", "userId": "users", "buyerId": "users", "recipientUserId": "users", "senderId": "users", "blockerId": "users", "blockedId": "users", "conversationId": "conversations", "listingId": "listings", "reporterUserId": "users", "reviewedById": "users", "actorId": "users", "assigneeId": "users", "previousAssigneeId": "users", "lastEditedById": "users", "suspendedById": "users", "lastMessageId": "messages", "firstBuyerMessageId": "messages", "firstSellerReplyId": "messages"}'::jsonb END;
   FOR e IN SELECT * FROM jsonb_each_text(mapping) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.campaign_records WHERE table_name=$1 AND row_key->>''id''=$2)',ns) INTO hit USING e.value,r->>e.key;
    owned:=owned OR hit;
   END LOOP;
   IF t='audit_logs' AND r->>'targetType' IN ('User','user') THEN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.campaign_entities WHERE user_id=$1)',ns) INTO hit USING r->>'targetId';
    owned:=owned OR hit;
   END IF;
  END IF;
  -- This existing v3 fence also takes N for foreign scalar/media references.
  -- It is not ownership or private admission, and deleted ledger keys still fence.
  IF include_media AND m->>'profile'='campaign897-full-v3' AND t IN ('media_uploads','listing_media','listing_drafts','users') THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM (
    SELECT u.id upload_id,regexp_replace(u.key,''[^/]+$'','''') directory FROM public.media_uploads u JOIN %I.campaign_records cr ON cr.table_name=''media_uploads'' AND NOT cr.deleted AND cr.row_key=jsonb_build_object(''id'',u.id)
    UNION SELECT l.upload_id,regexp_replace(l.object_key,''[^/]+$'','''') FROM %I.campaign_object_ledger l) o
    WHERE $1->>''uploadId''=o.upload_id OR $1->>''avatarUploadId''=o.upload_id
     OR starts_with($1->>''key'',o.directory) OR starts_with($1->>''posterKey'',o.directory) OR starts_with($1->>''avatarKey'',o.directory)
     OR position(o.directory IN $1->>''avatarUrl'')>0 OR position(o.directory IN ($1->''objectKeys'')::text)>0
     OR position(o.directory IN ($1->''payload'')::text)>0 OR position(o.upload_id IN ($1->''payload'')::text)>0)',ns,ns) INTO hit USING r;
   owned:=coalesce(owned,false) OR hit;
  END IF;
  IF coalesce(owned,false) THEN result:=result||jsonb_build_array(ns); END IF;
 END LOOP;
 RETURN result;
END $$;

-- The reset prelude's two phases: tracked tables sorted first, then their
-- referencing FK relations sorted. Deduplicate across affected namespaces.
CREATE FUNCTION public.campaign_preparation_scope(mutations jsonb) RETURNS jsonb
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
 SELECT coalesce(jsonb_agg(t ORDER BY t COLLATE "C"),'[]') INTO tracked FROM (
  SELECT DISTINCT cl.relname t FROM pg_trigger tr JOIN pg_class cl ON cl.oid=tr.tgrelid JOIN pg_proc p ON p.oid=tr.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE namespaces ? n.nspname AND p.proname IN ('track_auth','track_business') AND tr.tgenabled='O' AND tr.tgtype=29
   AND cl.relnamespace='public'::regnamespace
 ) s;
 SELECT coalesce(jsonb_agg(t ORDER BY t COLLATE "C"),'[]') INTO dependencies FROM (
  SELECT DISTINCT format('%I.%I',n.nspname,cl.relname) t FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
  WHERE c.contype='f' AND c.confrelid IN (SELECT to_regclass('public.'||value) FROM jsonb_array_elements_text(tracked))
 ) s;
 RETURN jsonb_build_object('namespaces',namespaces,'tracked',tracked,'dependencies',dependencies,'legacy_reset',legacy_reset);
END $$;

CREATE FUNCTION public.campaign_preparation_check_entry() RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'campaign_preparation_isolation'; END IF;
 IF EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted AND (
  (l.locktype='relation' AND l.mode IN ('RowShareLock','RowExclusiveLock','ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock') AND l.relation IN (
   SELECT to_regclass('public.'||value) FROM jsonb_array_elements_text(public.campaign_preparation_tables())
   UNION SELECT to_regclass('public.'||(value->>'table')) FROM jsonb_array_elements(public.diagnostic_source_registry())
   UNION SELECT cl.oid FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname ~ '^cf_[a-f0-9]{32}$'
   UNION SELECT c.conrelid FROM pg_constraint c WHERE c.contype='f' AND c.confrelid IN (SELECT to_regclass('public.'||value) FROM jsonb_array_elements_text(public.campaign_preparation_tables()))))
  OR (l.locktype='advisory' AND l.objsubid=2 AND l.classid BETWEEN 897100 AND 898399)
  OR (l.locktype='advisory' AND l.objsubid=1 AND EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname ~ '^cf_[a-f0-9]{32}$'
   AND l.classid::bigint=((hashtextextended(n.nspname,0)>>32)&4294967295) AND l.objid::bigint=(hashtextextended(n.nspname,0)&4294967295))))) THEN RAISE EXCEPTION 'campaign_preparation_preheld_lock'; END IF;
END $$;

CREATE TABLE public.campaign_preparations (
 id uuid PRIMARY KEY, backend_pid integer NOT NULL, full_transaction_id text NOT NULL,
 mutations jsonb NOT NULL, scope jsonb NOT NULL,
 UNIQUE(backend_pid,full_transaction_id)
);

CREATE FUNCTION public.campaign_preparation_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(public.campaign_preparation_tables()) t
  CROSS JOIN (VALUES ('zzzz_campaign_preparation'),('zzzz_campaign_preparation_truncate')) names(name)
  WHERE NOT EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=to_regclass('public.'||t)
   AND tr.tgname=names.name AND tr.tgenabled='O'))
 AND NOT EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgenabled='O' AND (tr.tgtype::int & 3)=3
  AND NOT tr.tgisinternal AND tr.tgname COLLATE "C">'zzzz_campaign_preparation' COLLATE "C"
  AND tr.tgrelid IN (SELECT to_regclass('public.'||value) FROM jsonb_array_elements_text(public.campaign_preparation_tables())))
$$;

CREATE FUNCTION public.campaign_preparation_insert() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE before_scope jsonb; t text; ns text; lock_suffix text;
BEGIN
 IF public.campaign_preparation_ready() IS NOT TRUE THEN RAISE EXCEPTION 'campaign_preparation_dormant'; END IF;
 IF EXISTS(SELECT 1 FROM public.campaign_preparations WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text)
  OR EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'campaign_preparation_nested'; END IF;
 PERFORM public.campaign_preparation_check_entry();
 before_scope:=public.campaign_preparation_scope(NEW.mutations);
 -- v1's historical reset takes its table set in declaration order. Preserve the
 -- operational program and fail closed on prelude contention instead of waiting
 -- in a potentially inverted order. This is not a retry or a lock escalation.
 lock_suffix:=CASE WHEN (before_scope->>'legacy_reset')::boolean THEN ' NOWAIT' ELSE '' END;
 BEGIN
  FOR t IN SELECT jsonb_array_elements_text(before_scope->'tracked') LOOP EXECUTE format('LOCK TABLE public.%I IN ROW EXCLUSIVE MODE',t)||lock_suffix; END LOOP;
  FOR t IN SELECT jsonb_array_elements_text(before_scope->'dependencies') LOOP EXECUTE 'LOCK TABLE '||t||' IN ROW EXCLUSIVE MODE'||lock_suffix; END LOOP;
 EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'campaign_preparation_legacy_reset_busy';
 END;
 FOR ns IN SELECT jsonb_array_elements_text(before_scope->'namespaces') LOOP PERFORM pg_advisory_xact_lock(hashtextextended(ns,0)); END LOOP;
 -- Fresh READ COMMITTED rediscovery after every wait. Never extend scope late.
 IF public.campaign_preparation_scope(NEW.mutations) IS DISTINCT FROM before_scope THEN RAISE EXCEPTION 'campaign_preparation_changed'; END IF;
 NEW.id:=gen_random_uuid(); NEW.backend_pid:=pg_backend_pid(); NEW.full_transaction_id:=pg_current_xact_id()::text; NEW.scope:=before_scope;
 RETURN NEW;
END $$;
CREATE TRIGGER campaign_preparation_insert BEFORE INSERT ON public.campaign_preparations FOR EACH ROW EXECUTE FUNCTION public.campaign_preparation_insert();

CREATE FUNCTION public.campaign_preparation_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'DELETE' THEN RAISE EXCEPTION 'campaign_preparation_immutable'; END IF;
 IF OLD.backend_pid<>pg_backend_pid() OR OLD.full_transaction_id<>pg_current_xact_id()::text THEN RAISE EXCEPTION 'campaign_preparation_receipt'; END IF;
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'campaign_preparation_source_open'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER campaign_preparation_immutable BEFORE UPDATE OR DELETE ON public.campaign_preparations FOR EACH ROW EXECUTE FUNCTION public.campaign_preparation_immutable();
CREATE TRIGGER campaign_preparation_no_truncate BEFORE TRUNCATE ON public.campaign_preparations FOR EACH STATEMENT EXECUTE FUNCTION public.campaign_preparation_immutable();
CREATE FUNCTION public.campaign_preparation_must_finish() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaign_preparations WHERE id=NEW.id) THEN RAISE EXCEPTION 'campaign_preparation_unfinished'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER campaign_preparation_must_finish AFTER INSERT ON public.campaign_preparations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.campaign_preparation_must_finish();

CREATE FUNCTION public.campaign_prepare(mutations jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE receipt uuid;
BEGIN
 INSERT INTO public.campaign_preparations(mutations) VALUES(mutations) RETURNING id INTO receipt;
 RETURN receipt;
END $$;
CREATE FUNCTION public.campaign_finish(receipt uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 DELETE FROM public.campaign_preparations WHERE id=receipt AND backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_preparation_receipt'; END IF;
END $$;

-- No locks here. An AFTER tracker may only reacquire an already-held namespace.
-- Ordinary non-campaign rows need no preparation. Receipt presence is never
-- source authorization; the independent selective source guards still apply.
CREATE FUNCTION public.campaign_preparation_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE required jsonb; receipt public.campaign_preparations; before_row jsonb; after_row jsonb;
BEGIN
 before_row:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 required:=public.campaign_row_namespaces(TG_TABLE_NAME,before_row,false)||public.campaign_row_namespaces(TG_TABLE_NAME,after_row);
 SELECT * INTO receipt FROM public.campaign_preparations WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF required<>'[]' THEN
  IF receipt.id IS NULL THEN RAISE EXCEPTION 'campaign_preparation_missing'; END IF;
  IF NOT (receipt.scope->'tracked' ? TG_TABLE_NAME) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(required) n WHERE NOT (receipt.scope->'namespaces' ? n)) THEN RAISE EXCEPTION 'campaign_preparation_uncovered'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION public.campaign_preparation_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE t.tgrelid=TG_RELID AND t.tgenabled='O' AND n.nspname ~ '^cf_[a-f0-9]{32}$' AND p.proname IN ('track_auth','track_business')) THEN
  RAISE EXCEPTION 'campaign_preparation_truncate';
 END IF;
 RETURN NULL;
END $$;
DO $install$
DECLARE t text;
BEGIN
 FOR t IN SELECT jsonb_array_elements_text(public.campaign_preparation_tables()) LOOP
  EXECUTE format('CREATE TRIGGER zzzz_campaign_preparation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.campaign_preparation_guard()',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zzzz_campaign_preparation',t);
  EXECUTE format('CREATE TRIGGER zzzz_campaign_preparation_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.campaign_preparation_truncate()',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zzzz_campaign_preparation_truncate',t);
 END LOOP;
END $install$;

-- The final campaign guard observes OLD/NEW and returns them unchanged. Admit
-- only that exact guard after the final source check, never another late mutator.
CREATE OR REPLACE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
 SELECT NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_guard_specs()) m
  CROSS JOIN (VALUES ('zz_diagnostic_source_presence',2),
                     ('zz_diagnostic_source_effective',3),
                     ('zz_diagnostic_source_target',3)) names(name,timing)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t
   WHERE t.tgrelid=to_regclass('public.'||(m->>'table'))
    AND t.tgname=names.name AND t.tgenabled='O'
    AND (t.tgtype::int & 3)=names.timing)
 ) AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_registry()) m
  WHERE m->>'table'<>'diagnostic_source_anchors' AND NOT EXISTS (
   SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(m->>'table'))
    AND t.tgname='diagnostic_source_no_truncate' AND t.tgenabled='O')
 ) AND NOT EXISTS (
  -- Refuse preparation if later DDL has installed a BEFORE ROW mutator after
  -- the final effective check. Privileged DDL remains outside runtime authority.
  SELECT 1 FROM pg_trigger t
  JOIN jsonb_array_elements(public.diagnostic_source_guard_specs()) m
   ON t.tgrelid=to_regclass('public.'||(m->>'table'))
  WHERE (t.tgtype::int & 3)=3 AND NOT t.tgisinternal AND t.tgenabled='O'
   AND t.tgname COLLATE "C">'zz_diagnostic_source_effective' COLLATE "C"
   AND t.tgname<>'zz_diagnostic_source_target'
   AND NOT (t.tgname='zzzz_campaign_preparation' AND t.tgfoid='public.campaign_preparation_guard()'::regprocedure)
 ) AND public.campaign_preparation_ready()
$$;

-- This projection only translates the already server-discovered source graph.
-- It neither parses caller lock plans nor grants ownership-command authority.
CREATE FUNCTION public.campaign_source_mutations(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(e),'[]') FROM (
  SELECT jsonb_build_object('table',r->'table','key',r->'key','verb',r->'verb','next',r->'next') e
   FROM jsonb_array_elements(c->'rows') r
  UNION ALL
  SELECT jsonb_build_object('table',r->'table','key',r->'key',
   'verb',CASE WHEN r->'row' IS NULL OR r->'row'='null' THEN 'insert' ELSE 'update' END,
   'next',coalesce(nullif(r->'row','null'),'{}'))
   FROM jsonb_array_elements(scope) r
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') e WHERE e->'table'=r->'table' AND e->'key'=r->'key')
 ) s
$$;
CREATE OR REPLACE FUNCTION public.diagnostic_source_campaigns(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT public.campaign_preparation_scope(public.campaign_source_mutations(scope,c))->'namespaces'
$$;
CREATE OR REPLACE FUNCTION public.diagnostic_source_insert_receipt() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_scope jsonb; after_scope jsonb; c jsonb; keys jsonb; campaigns jsonb; n jsonb; t text; ns text; k jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaign_preparations WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'campaign_preparation_nested'; END IF;
 IF public.diagnostic_source_guards_ready() IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_dormant'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'diagnostic_source_isolation'; END IF;
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'diagnostic_source_nested'; END IF;
 BEGIN
  PERFORM public.campaign_preparation_check_entry();
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='campaign_preparation_preheld_lock' THEN RAISE EXCEPTION 'diagnostic_source_preheld_lock'; END IF;
  RAISE;
 END;
 c:=public.diagnostic_source_parse(NEW.command);
 before_scope:=public.diagnostic_source_scope(c);
 -- Entry is shared with ordinary excluded writers, before source ranks/rows.
 PERFORM public.campaign_prepare(public.campaign_source_mutations(before_scope,c));
 campaigns:=public.diagnostic_source_campaigns(before_scope,c);
 keys:=public.diagnostic_source_lock_keys(before_scope,c);
 FOR t IN SELECT m->>'table' FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY (m->>'namespace')::int LOOP
  FOR n IN SELECT value FROM jsonb_array_elements(keys) WHERE (value->>'namespace')::int=(public.diagnostic_source_meta(t)->>'namespace')::int ORDER BY (value->>'key')::int LOOP
   PERFORM pg_advisory_xact_lock((n->>'namespace')::int,(n->>'key')::int);
  END LOOP;
  FOR k IN SELECT value->'key' FROM jsonb_array_elements(before_scope) WHERE value->>'table'=t ORDER BY (value->'key')::text LOOP
   EXECUTE format('SELECT 1 FROM public.%I s WHERE to_jsonb(s) @> $1 FOR UPDATE',t) USING k;
  END LOOP;
 END LOOP;
 -- This is a separate VOLATILE SQL invocation after all waits. PostgreSQL READ
 -- COMMITTED takes fresh command visibility for its database reads.
 after_scope:=public.diagnostic_source_scope(c);
 IF after_scope IS DISTINCT FROM before_scope OR public.diagnostic_source_lock_keys(after_scope,c) IS DISTINCT FROM keys
  OR public.diagnostic_source_campaigns(after_scope,c) IS DISTINCT FROM campaigns THEN RAISE EXCEPTION 'diagnostic_source_graph_changed'; END IF;
 PERFORM public.diagnostic_source_parse(c);
 NEW.id:=gen_random_uuid(); NEW.backend_pid:=pg_backend_pid(); NEW.full_transaction_id:=pg_current_xact_id()::text;
 NEW.command:=c; NEW.scope:=after_scope; NEW.lock_keys:=keys; NEW.campaigns:=campaigns;
 NEW.effects:=public.diagnostic_source_effects(c,after_scope);
 RETURN NEW;
END $$;
CREATE FUNCTION public.campaign_source_finished() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE receipt uuid;
BEGIN
 SELECT id INTO receipt FROM public.campaign_preparations WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 PERFORM public.campaign_finish(receipt);
 RETURN NULL;
END $$;
CREATE TRIGGER campaign_source_finished AFTER DELETE ON public.diagnostic_source_commands FOR EACH ROW EXECUTE FUNCTION public.campaign_source_finished();
