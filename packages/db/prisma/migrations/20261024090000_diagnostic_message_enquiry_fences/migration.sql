-- Forward-only dormant correction. No callers, activation or admission changes.
-- Late ordinary writers may already hold Conversation/Business row locks. Never
-- wait for an earlier source key from these triggers: refuse and roll back.
CREATE FUNCTION public.diagnostic_message_presence_fence() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(898310,hashtext(jsonb_build_array('pk',jsonb_build_object('id',NEW.id))::text)) THEN
  RAISE EXCEPTION 'diagnostic_source_message_busy' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_diagnostic_source_message_fence BEFORE INSERT OR UPDATE OF id ON public.messages
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_message_presence_fence();
ALTER TABLE public.messages DISABLE TRIGGER zz_diagnostic_source_message_fence;

CREATE FUNCTION public.diagnostic_enquiry_assignment_fence() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE uid text; ids text[]:='{}';
BEGIN
 IF NEW."businessId" IS NOT NULL THEN ids:=array_append(ids,NEW."assigneeId"); END IF;
 IF TG_OP='UPDATE' AND OLD."businessId" IS NOT NULL THEN ids:=array_append(ids,OLD."assigneeId"); END IF;
 FOR uid IN SELECT DISTINCT x FROM unnest(ids) x WHERE x IS NOT NULL ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock(897100,hashtext(jsonb_build_array('pk',jsonb_build_object('id',uid))::text)) THEN
   RAISE EXCEPTION 'diagnostic_source_assignment_busy' USING ERRCODE='40001'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_diagnostic_source_assignment_fence BEFORE INSERT OR UPDATE OF "assigneeId","businessId" ON public.conversations
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_enquiry_assignment_fence();
ALTER TABLE public.conversations DISABLE TRIGGER zz_diagnostic_source_assignment_fence;

ALTER FUNCTION public.diagnostic_source_guards_ready() RENAME TO diagnostic_source_guards_ready_before_message_enquiry;
CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_guards_ready_before_message_enquiry() AND NOT EXISTS (
  SELECT 1 FROM (VALUES ('messages','zz_diagnostic_source_message_fence','public.diagnostic_message_presence_fence()'),
   ('conversations','zz_diagnostic_source_assignment_fence','public.diagnostic_enquiry_assignment_fence()'),
   ('conversations','zz_diagnostic_source_enquiry_effect','public.diagnostic_enquiry_effect_guard()'),
   ('business_enquiry_audits','zz_diagnostic_source_enquiry_effect','public.diagnostic_enquiry_effect_guard()')) required(relation,name,implementation)
  WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||required.relation)
   AND t.tgname=required.name AND t.tgfoid=to_regprocedure(required.implementation) AND t.tgenabled='O' AND (t.tgtype::int & 3)=3))
$$;

-- Discover assignee-only targets, and lock their User before Business/Conversation.
ALTER FUNCTION public.diagnostic_source_registry() RENAME TO diagnostic_source_registry_before_enquiry;
CREATE FUNCTION public.diagnostic_source_registry() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(CASE WHEN m->>'table'='conversations' THEN
  jsonb_set(m,'{refs}',(m->'refs')||'[{"table":"users","columns":["assigneeId"],"target":["id"]}]') ELSE m END ORDER BY ord)
 FROM jsonb_array_elements(public.diagnostic_source_registry_before_enquiry()) WITH ORDINALITY r(m,ord)
$$;

-- Same SQL owner generates a stable ID during discovery and the trigger write.
-- Full transaction ID prevents repeated commands/rollback retries from sharing
-- an audit ID. Outside prepared work the original random UUID remains in use.
CREATE FUNCTION public.diagnostic_enquiry_audit_id(conversation_id text, next_version integer) RETURNS text
LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_intake_uuid(jsonb_build_array('business-enquiry-requeue',pg_current_xact_id()::text,conversation_id,next_version)::text)
$$;
CREATE FUNCTION public.diagnostic_source_enquiry_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb:='[]'; selected jsonb; e jsonb; r record; uid text; reason text; audit_row jsonb;
 departed jsonb:='{}'; entry jsonb; optional boolean; audit_id text; stamp timestamp:=transaction_timestamp()::timestamp(3);
BEGIN
 -- Include the actual derived membership deletion, without recursively calling
 -- the FK-effect wrapper this helper augments.
 selected:=(c->'rows')||public.diagnostic_source_account_effects(c);
 IF c->>'operation'='account_purge' THEN selected:=selected||public.diagnostic_account_purge_effects(c); END IF;
 -- Existing account UoW is User-first. A later member trigger finds no assigned
 -- rows. Standalone member commands retain membership_revoked as their action.
 FOR e IN SELECT value FROM jsonb_array_elements(selected) WHERE value->>'table'='users' AND value->>'verb'='update'
  AND c->>'operation' IN ('user_eligibility','account_schedule','account_restore','account_purge') LOOP
  IF e->'next'->>'suspendedAt' IS NOT NULL OR e->'next'->>'deletionScheduledAt' IS NOT NULL THEN
   departed:=departed||jsonb_build_object(e->'key'->>'id',jsonb_build_object('reason','user_inactive','optional',false)); END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(selected) WHERE value->>'table'='dealership_members'
  AND (value->>'verb'='delete' OR (value->>'verb'='update' AND value->'next'->>'status'<>'active')) LOOP
  uid:=e->'expected'->'source'->>'userId';
  IF uid IS NOT NULL AND NOT departed ? uid THEN
   -- UPDATE OF status fires even for a no-op SET status=status. A role-only
   -- UPDATE with the same suspended status does not fire it. The tuple wire
   -- cannot distinguish these; lock both possibilities and require either the
   -- exact whole trigger effect or the wholly unchanged pair at completion.
   optional:=e->>'verb'='update' AND e->'next'->'status' IS NOT DISTINCT FROM e->'expected'->'source'->'status';
   departed:=departed||jsonb_build_object(uid,jsonb_build_object('reason','membership_revoked','optional',optional)); END IF;
 END LOOP;
 FOR uid,entry IN SELECT key,value FROM jsonb_each(departed) ORDER BY key LOOP
  reason:=entry->>'reason'; optional:=(entry->>'optional')::boolean;
  FOR r IN SELECT to_jsonb(t) row FROM public.conversations t WHERE t."assigneeId"=uid AND t."businessId" IS NOT NULL ORDER BY t.id LOOP
   audit_id:=public.diagnostic_enquiry_audit_id(r.row->>'id',(r.row->>'version')::int+1);
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('conversations',r.row,
    jsonb_build_object('assigneeId',NULL,'version',(r.row->>'version')::int+1,'updatedAt',stamp))||jsonb_build_object('enquiry',true,'enquiryOptional',optional,'enquiryAuditId',audit_id));
   audit_row:=jsonb_build_object('id',audit_id,
    'conversationId',r.row->'id','version',(r.row->>'version')::int+1,'actorId',NULL,'action',reason,
    'previousAssigneeId',uid,'assigneeId',NULL,'enquiryState',r.row->'enquiryState','createdAt',stamp);
   IF public.diagnostic_source_read('business_enquiry_audits',jsonb_build_object('id',audit_row->'id')) IS NOT NULL THEN
    RAISE EXCEPTION 'diagnostic_source_enquiry_audit_collision'; END IF;
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('business_enquiry_audits',audit_row,'{}')||
    jsonb_build_object('verb','insert','expected','absent','enquiry',true,'enquiryOptional',optional,'enquiryConversation',r.row));
   IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
  END LOOP;
 END LOOP;
 RETURN effects;
END $$;
ALTER FUNCTION public.diagnostic_source_fk_effects(jsonb) RENAME TO diagnostic_source_fk_effects_before_enquiry;
CREATE FUNCTION public.diagnostic_source_fk_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN public.diagnostic_source_fk_effects_before_enquiry(c)||public.diagnostic_source_enquiry_effects(c);
END $$;

-- Every NEW audit key and conversation/version unique key participates in the
-- existing deterministic order, including non-moderation member/account work.
ALTER FUNCTION public.diagnostic_source_lock_keys(jsonb,jsonb) RENAME TO diagnostic_source_lock_keys_before_enquiry;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN public.diagnostic_source_lock_keys_before_enquiry(scope,
  c||jsonb_build_object('rows',(c->'rows')||public.diagnostic_source_enquiry_effects(c)));
END $$;
ALTER FUNCTION public.campaign_source_mutations(jsonb,jsonb) RENAME TO campaign_source_mutations_before_enquiry;
CREATE FUNCTION public.campaign_source_mutations(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN public.campaign_source_mutations_before_enquiry(scope,
  c||jsonb_build_object('rows',(c->'rows')||public.diagnostic_source_enquiry_effects(c)));
END $$;

-- The existing AFTER trigger remains the sole requeue writer. Its SQL, actions,
-- timestamp defaults and Business -> Conversation ordering are preserved. Only
-- prepared audit-ID generation changes; the receipt selects its exact tuple.
CREATE OR REPLACE FUNCTION public.requeue_departed_business_enquiries() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE departed_id text; owned_business text; changed record; reason text; prepared boolean;
BEGIN
 IF TG_TABLE_NAME='users' THEN
  IF NEW."suspendedAt" IS NULL AND NEW."deletionScheduledAt" IS NULL THEN RETURN NEW; END IF;
  departed_id:=NEW.id; reason:='user_inactive';
 ELSE
  IF TG_OP='UPDATE' AND NEW.status='active' THEN RETURN NEW; END IF;
  departed_id:=OLD."userId"; reason:='membership_revoked';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text) INTO prepared;
 FOR owned_business IN SELECT DISTINCT "businessId" FROM public.conversations
  WHERE "assigneeId"=departed_id AND "businessId" IS NOT NULL ORDER BY "businessId" LOOP
  PERFORM id FROM public.dealerships WHERE id=owned_business FOR UPDATE;
  FOR changed IN UPDATE public.conversations SET "assigneeId"=NULL,version=version+1,"updatedAt"=CURRENT_TIMESTAMP
   WHERE "businessId"=owned_business AND "assigneeId"=departed_id RETURNING id,version,"enquiryState" LOOP
   INSERT INTO public.business_enquiry_audits(id,"conversationId",version,action,"previousAssigneeId","enquiryState")
    VALUES(CASE WHEN prepared THEN public.diagnostic_enquiry_audit_id(changed.id,changed.version) ELSE gen_random_uuid()::text END,
     changed.id,changed.version,reason,departed_id,changed."enquiryState");
  END LOOP;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

-- Member commands get exactly these derived writes; no other dependency table
-- becomes caller-writable. Existing broader account/moderation guards still run.
CREATE FUNCTION public.diagnostic_enquiry_effect_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text AND command->>'operation' IN ('member_remove','member_eligibility','member_replace','member_create')) THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,
   CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER zz_diagnostic_source_enquiry_effect BEFORE INSERT OR UPDATE OR DELETE ON public.conversations
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_enquiry_effect_guard();
CREATE TRIGGER zz_diagnostic_source_enquiry_effect BEFORE INSERT OR UPDATE OR DELETE ON public.business_enquiry_audits
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_enquiry_effect_guard();
ALTER TABLE public.conversations DISABLE TRIGGER zz_diagnostic_source_enquiry_effect;
ALTER TABLE public.business_enquiry_audits DISABLE TRIGGER zz_diagnostic_source_enquiry_effect;

-- These tuples are owned by the requeue trigger, never arbitrary dependency DML.
-- The generic purge comparator intentionally allows some intermediate values;
-- enquiry version/state/time and its generated audit require exact tuples.
ALTER FUNCTION public.diagnostic_assert_source_write(text,text,jsonb,jsonb) RENAME TO diagnostic_assert_source_write_before_enquiry;
CREATE FUNCTION public.diagnostic_assert_source_write(table_name text,operation text,old_row jsonb,new_row jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; k jsonb;
BEGIN
 k:=public.diagnostic_source_key(table_name,coalesce(old_row,new_row));
 SELECT p INTO e FROM public.diagnostic_source_commands r,LATERAL jsonb_array_elements(r.effects) p
  WHERE r.backend_pid=pg_backend_pid() AND r.full_transaction_id=pg_current_xact_id()::text
   AND p->>'table'=table_name AND p->'key'=k;
 IF e->>'enquiry'='true' THEN
  IF pg_trigger_depth()<2 OR operation<>upper(e->>'verb')
   OR public.diagnostic_source_project(new_row,public.diagnostic_source_meta(table_name)->'fields') IS DISTINCT FROM e->'next'
   OR (operation='UPDATE' AND public.diagnostic_source_project(old_row,public.diagnostic_source_meta(table_name)->'fields') IS DISTINCT FROM e->'expected'->'source') THEN
   RAISE EXCEPTION 'diagnostic_source_enquiry_effect_mismatch'; END IF;
  RETURN;
 END IF;
 PERFORM public.diagnostic_assert_source_write_before_enquiry(table_name,operation,old_row,new_row);
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_purge_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; actual jsonb; conversation_row jsonb;
BEGIN
 PERFORM public.diagnostic_assert_source(OLD.id,OLD.command->>'operation');
 FOR e IN SELECT value FROM jsonb_array_elements(OLD.effects) WHERE value->>'derived'='purge' LOOP
  actual:=public.diagnostic_source_project(public.diagnostic_source_read(e->>'table',e->'key'),public.diagnostic_source_meta(e->>'table')->'fields');
  IF e->>'enquiry'='true' THEN
   IF e->>'enquiryOptional'='true' THEN
    IF e->>'table'='conversations' THEN
     IF actual IS NOT DISTINCT FROM e->'expected'->'source'
      AND public.diagnostic_source_read('business_enquiry_audits',jsonb_build_object('id',e->'enquiryAuditId')) IS NULL THEN CONTINUE; END IF;
    ELSE
     conversation_row:=public.diagnostic_source_project(public.diagnostic_source_read('conversations',jsonb_build_object('id',e->'enquiryConversation'->'id')),
      public.diagnostic_source_meta('conversations')->'fields');
     IF actual IS NULL AND conversation_row IS NOT DISTINCT FROM public.diagnostic_source_project(e->'enquiryConversation',public.diagnostic_source_meta('conversations')->'fields') THEN CONTINUE; END IF;
    END IF;
   END IF;
   IF actual IS DISTINCT FROM e->'next' THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
  ELSIF e->>'verb'='delete' THEN
   IF actual IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
  ELSIF public.diagnostic_purge_tuple(e,actual,true) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
 END LOOP;
 RETURN OLD;
END $$;

-- Preserve the complete preparation protocol; only Message-key contention
-- refuses instead of waiting after earlier Conversation locks.
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
   IF (n->>'namespace')::int=898310 THEN
    -- Ordinary INSERT takes this key before its Conversation FK. Preparation
    -- may already hold that Conversation; never wait for the opposing key.
    IF NOT pg_try_advisory_xact_lock(898310,(n->>'key')::int) THEN
     RAISE EXCEPTION 'diagnostic_source_message_busy' USING ERRCODE='40001'; END IF;
   ELSE PERFORM pg_advisory_xact_lock((n->>'namespace')::int,(n->>'key')::int); END IF;
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
