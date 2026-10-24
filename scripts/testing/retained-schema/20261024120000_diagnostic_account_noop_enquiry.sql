-- Forward-only ACCOUNT-NOOP-ENQUIRY-001. Guards/admission remain dormant.
-- Full discovery, sorted locks and both whole-pair alternatives are unchanged.
ALTER FUNCTION public.diagnostic_source_enquiry_effects(jsonb) RENAME TO diagnostic_source_enquiry_effects_before_account_noop;
CREATE FUNCTION public.diagnostic_source_enquiry_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; uid text;
BEGIN
 effects:=public.diagnostic_source_enquiry_effects_before_account_noop(c);
 IF c->>'operation'='account_restore' THEN
  -- Only a completely unchanged protected User tuple may perform no UPDATE.
  -- Inactive schedule/moderation transitions keep their mandatory effects.
  SELECT e->'key'->>'id' INTO uid FROM jsonb_array_elements(c->'rows') e
   WHERE e->>'table'='users' AND e->>'verb'='update'
    AND e->'next' IS NOT DISTINCT FROM e->'expected'->'source';
  IF uid IS NOT NULL THEN
   SELECT coalesce(jsonb_agg(CASE WHEN
    (e->>'table'='conversations' AND e->'expected'->'source'->>'assigneeId'=uid)
    OR (e->>'table'='business_enquiry_audits' AND e->'next'->>'previousAssigneeId'=uid)
    THEN jsonb_set(e,'{enquiryOptional}','true') ELSE e END ORDER BY ord),'[]'::jsonb)
    INTO effects FROM jsonb_array_elements(effects) WITH ORDINALITY r(e,ord);
  END IF;
 END IF;
 RETURN effects;
END $$;

CREATE OR REPLACE FUNCTION public.requeue_departed_business_enquiries() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE departed_id text; owned_business text; changed record; reason text; prepared boolean; e jsonb; actual jsonb;
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
 -- An actual User UPDATE OF fires even when every declared value is equal.
 -- Optional completion is only for an absent event. Once this trigger ran,
 -- every predeclared pair for this User must exist exactly, including effects
 -- suppressed by another BEFORE trigger. No receipt or source tuple is changed.
 IF TG_TABLE_NAME='users' AND prepared THEN
  FOR e IN SELECT p FROM public.diagnostic_source_commands r,LATERAL jsonb_array_elements(r.effects) p
   WHERE r.backend_pid=pg_backend_pid() AND r.full_transaction_id=pg_current_xact_id()::text
    AND p->>'enquiry'='true' AND (
     (p->>'table'='conversations' AND p->'expected'->'source'->>'assigneeId'=departed_id)
     OR (p->>'table'='business_enquiry_audits' AND p->'next'->>'previousAssigneeId'=departed_id)) LOOP
   actual:=public.diagnostic_source_project(public.diagnostic_source_read(e->>'table',e->'key'),
    public.diagnostic_source_meta(e->>'table')->'fields');
   IF actual IS DISTINCT FROM e->'next' THEN RAISE EXCEPTION 'diagnostic_source_enquiry_effect_missing'; END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

-- The actual UPDATE OF event is authoritative only with its real AFTER trigger.
-- Refuse preparation if that trigger is absent, disabled or covers other fields.
ALTER FUNCTION public.diagnostic_source_guards_ready() RENAME TO diagnostic_source_guards_ready_before_account_noop;
CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_guards_ready_before_account_noop() AND EXISTS (
  SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.users'::regclass
   AND t.tgname='business_enquiry_user_revocation'
   AND t.tgfoid='public.requeue_departed_business_enquiries()'::regprocedure
   AND t.tgenabled='O' AND t.tgtype::int=17 AND t.tgqual IS NULL AND t.tgnargs=0 AND NOT t.tgisinternal
   AND t.tgattr::text=(SELECT string_agg(a.attnum::text,' ' ORDER BY f.ord)
    FROM unnest(ARRAY['suspendedAt','deletionScheduledAt']) WITH ORDINALITY f(name,ord)
    JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attname=f.name AND NOT a.attisdropped))
$$;
