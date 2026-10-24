-- Forward-only finite invariant corrections. Source guards remain DISABLED.
-- No callers, activation, automatic admission, backfill, grants or retained data.
-- Preserve every original UPDATE-OF invalidator and owner permission predicate.
-- Recovery is another forward migration; never reset a historical first slot.

-- Preserve account archival lineage in final-effect coverage as well as status.
ALTER FUNCTION public.diagnostic_source_registry() RENAME TO diagnostic_source_registry_before_invariants;
CREATE FUNCTION public.diagnostic_source_registry() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(CASE WHEN m->>'table'='listings' THEN jsonb_set(m,'{fields}',m->'fields'||'["archivedByDeletion"]'::jsonb) ELSE m END ORDER BY i)
 FROM jsonb_array_elements(public.diagnostic_source_registry_before_invariants()) WITH ORDINALITY x(m,i)
$$;

ALTER FUNCTION public.diagnostic_source_guard_specs() RENAME TO diagnostic_source_guard_specs_before_invariants;
CREATE FUNCTION public.diagnostic_source_guard_specs() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(CASE WHEN m->>'table'='listings' THEN jsonb_set(m,'{update}',m->'update'||'["archivedByDeletion"]'::jsonb) ELSE m END ORDER BY i)
 FROM jsonb_array_elements(public.diagnostic_source_guard_specs_before_invariants()) WITH ORDINALITY x(m,i)
$$;
DO $install$
DECLARE columns text;
BEGIN
 SELECT string_agg(format('%I',f),',' ORDER BY i) INTO columns FROM jsonb_array_elements(public.diagnostic_source_guard_specs()) m,
  LATERAL jsonb_array_elements_text(m->'update') WITH ORDINALITY x(f,i) WHERE m->>'table'='listings';
 DROP TRIGGER zz_diagnostic_source_presence ON public.listings;
 DROP TRIGGER zz_diagnostic_source_target ON public.listings;
 EXECUTE format('CREATE TRIGGER zz_diagnostic_source_presence BEFORE INSERT OR DELETE OR UPDATE OF %s ON public.listings FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_statement_guard()',columns);
 EXECUTE format('CREATE TRIGGER zz_diagnostic_source_target BEFORE UPDATE OF %s ON public.listings FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_row_guard(''target'')',columns);
 ALTER TABLE public.listings DISABLE TRIGGER zz_diagnostic_source_presence;
 ALTER TABLE public.listings DISABLE TRIGGER zz_diagnostic_source_target;
END $install$;

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
 IF (OLD.state='unchanged' AND NEW.state NOT IN ('unchanged','changed','erased'))
  OR NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."createdTransaction" IS DISTINCT FROM OLD."createdTransaction"
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

CREATE OR REPLACE FUNCTION public.diagnostic_source_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_row jsonb; after_row jsonb; spec jsonb;
BEGIN
 SELECT value INTO spec FROM jsonb_array_elements(public.diagnostic_source_guard_specs())
  WHERE value->>'table'=TG_TABLE_NAME;
 IF spec IS NULL THEN RAISE EXCEPTION 'diagnostic_source_guard_table'; END IF;
 before_row:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 IF TG_OP='INSERT' AND (spec->>'insert')::boolean IS NOT TRUE THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND TG_NARGS=0
  AND public.diagnostic_source_project(before_row,spec->'update')
   IS NOT DISTINCT FROM public.diagnostic_source_project(after_row,spec->'update') THEN
  RETURN NEW;
 END IF;
 -- UPDATE OF is a target-list check even for equal tuples. This prevents a
 -- no-op write on an uncovered row from reaching existing AFTER invalidators.
 -- The other trigger checks changes introduced by earlier BEFORE mutators,
 -- including primary-key changes on otherwise scalar statements.
 PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,before_row,after_row);
 -- The receipt and caller timestamps cannot extend rights while this command
 -- waits. These are unlocked reads of the already prepared dependency union.
 -- Invalidation, disposal and exact consumed-report retries retain their rules.
 IF TG_TABLE_NAME='diagnostic_continuity_proofs' AND
  (TG_OP='INSERT' OR (TG_OP='UPDATE' AND before_row->>'consumedReportId' IS NULL AND after_row->>'consumedReportId' IS NOT NULL)) THEN
  IF (after_row->>'rightsUntil')::timestamp <= clock_timestamp() AT TIME ZONE 'UTC' THEN
   RAISE EXCEPTION 'diagnostic_continuity_proof_expired';
  END IF;
 ELSIF TG_TABLE_NAME='diagnostic_reports' AND TG_OP='INSERT' AND after_row->>'continuityProofId' IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM public.diagnostic_continuity_proofs p WHERE p.id=after_row->>'continuityProofId'
   AND p."rightsUntil">clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'diagnostic_continuity_proof_expired'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- Finite incoming-FK effects for the two non-purge physical deletion commands.
-- These are the actual owner policies: DELETE CASCADE or SET NULL only. They do
-- not discover arbitrary database tables, erase semantic links, or grant actors
-- permission. Soft deletion and authority-only Session updates retain payloads.
CREATE FUNCTION public.diagnostic_source_fk_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; x record; effects jsonb:='[]'; sid text; lid text; conversations text[]; requests text[];
BEGIN
 FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'verb'='delete' LOOP
  IF c->>'operation'='session_change' AND e->>'table'='sessions' THEN
   sid:=e->'key'->>'id';
   FOR x IN SELECT to_jsonb(t) row FROM public.video_grants t WHERE t."ownerSessionId"=sid LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_grants',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.service_push_subscriptions t WHERE t."sessionId"=sid LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_push_subscriptions',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   SELECT coalesce(array_agg(id),'{}') INTO requests FROM public.diagnostic_continuity_requests WHERE "sessionId"=sid;
   FOR x IN SELECT to_jsonb(t) row FROM public.diagnostic_continuity_requests t WHERE t.id=ANY(requests) LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_requests',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.diagnostic_reports t WHERE t."continuityRequestId"=ANY(requests) LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_reports',x.row,jsonb_build_object('continuityRequestId',NULL,'continuityRequestSessionId',NULL)));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  ELSIF c->>'operation'='session_change' AND e->>'table'='totp_enrollments' THEN
   FOR x IN SELECT to_jsonb(t) row FROM public.totp_backup_codes t WHERE t."totpEnrollmentId"=e->'key'->>'id' LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('totp_backup_codes',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  ELSIF c->>'operation'='listing_delete' AND e->>'table'='listings' THEN
   lid:=e->'key'->>'id';
   FOR x IN SELECT to_jsonb(t) row FROM public.listing_media t WHERE t."listingId"=lid LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('listing_media',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.favorites t WHERE t."listingId"=lid LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('favorites',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   SELECT coalesce(array_agg(id),'{}') INTO conversations FROM public.conversations WHERE "listingId"=lid;
   FOR x IN SELECT to_jsonb(t) row FROM public.conversation_participants t WHERE t."conversationId"=ANY(conversations) LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('conversation_participants',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.messages t WHERE t."conversationId"=ANY(conversations) LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('messages',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.business_enquiry_audits t WHERE t."conversationId"=ANY(conversations) LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('business_enquiry_audits',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.conversations t WHERE t.id=ANY(conversations) LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('conversations',x.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.support_cases t WHERE t."sourceListingId"=lid LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('support_cases',x.row,jsonb_build_object('sourceListingId',NULL)));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
   FOR x IN SELECT to_jsonb(t) row FROM public.vehicle_history_requests t WHERE t."sourceListingId"=lid LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('vehicle_history_requests',x.row,jsonb_build_object('sourceListingId',NULL)));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  END IF;
 END LOOP;
 -- Multiple selected parents may reach one FK target. Its persisted tuple and
 -- exact final effect are identical; deduplicate before coverage and locking.
 RETURN (SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') FROM (SELECT DISTINCT value FROM jsonb_array_elements(effects)) d);
END $$;

-- Existing owner recovery/redemption also changes Business eligibility and
-- invalidates its collector baseline. These are fixed derived effects of the
-- declared owner member transition, never arbitrary additional caller rows.
CREATE FUNCTION public.diagnostic_source_member_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb:='[]'; e jsonb; old_member jsonb; bid text; target_status text; business_row jsonb; collector_row jsonb; baseline_row jsonb;
 businesses text[]:='{}';
BEGIN
 IF c->>'operation' NOT IN ('member_create','member_replace') THEN RETURN effects; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='dealership_members' LOOP
  old_member:=public.diagnostic_source_read('dealership_members',e->'key');
  IF old_member->>'role'='owner' THEN businesses:=array_append(businesses,old_member->>'dealershipId'); END IF;
  IF e->'next'->>'role'='owner' THEN businesses:=array_append(businesses,e->'next'->>'dealershipId'); END IF;
 END LOOP;
 FOR bid IN SELECT DISTINCT x FROM unnest(businesses) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT to_jsonb(b) INTO business_row FROM public.dealerships b WHERE b.id=bid;
  IF business_row IS NULL THEN CONTINUE; END IF;
  target_status:=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') p WHERE p->>'table'='dealership_members'
   AND p->>'verb'<>'delete' AND p->'next'->>'role'='owner' AND p->'next'->>'dealershipId'=bid) THEN 'active' ELSE 'recovery' END;
  IF business_row->>'status' IS DISTINCT FROM target_status THEN
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('dealerships',business_row,jsonb_build_object('status',target_status)));
  END IF;
 END LOOP;
 IF cardinality(businesses)>0 THEN
  SELECT to_jsonb(t) INTO collector_row FROM public.measurement_state t WHERE t.key='collector';
  SELECT to_jsonb(t) INTO baseline_row FROM public.measurement_state t WHERE t.key='inventory_baseline:'||(collector_row->>'epoch');
  IF baseline_row IS NOT NULL THEN effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_state',baseline_row,'{}',true)); END IF;
 END IF;
 RETURN effects;
END $$;

-- Account scheduling is not the later account purge. These exact effects are
-- owned by the existing deletion/restore UoWs; receipts do not grant authority.
CREATE FUNCTION public.diagnostic_source_account_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb:='[]'; e jsonb; uid text; r record; member jsonb; business_row jsonb; collector jsonb; baseline jsonb;
 caps jsonb; audit_id text; stamp timestamp:=date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC');
BEGIN
 IF c->>'operation' NOT IN ('account_schedule','account_restore') THEN RETURN effects; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='users' LOOP
  uid:=e->'key'->>'id';
  -- The same finite User commands cover moderation eligibility writes. Only
  -- an actual schedule transition invokes the account UoW's extra effects.
  IF e->'next'->'deletionScheduledAt' IS NOT DISTINCT FROM e->'expected'->'source'->'deletionScheduledAt' THEN CONTINUE; END IF;
  IF c->>'operation'='account_schedule' AND e->'next'->>'deletionScheduledAt' IS NULL THEN CONTINUE; END IF;
  IF c->>'operation'='account_restore' AND (e->'expected'->'source'->>'deletionScheduledAt' IS NULL OR e->'next'->>'deletionScheduledAt' IS NOT NULL) THEN CONTINUE; END IF;
  FOR r IN SELECT to_jsonb(l) row FROM public.listings l WHERE l."sellerId"=uid AND l."businessId" IS NULL
   AND ((c->>'operation'='account_schedule' AND l.status='active')
    OR (c->>'operation'='account_restore' AND l.status='archived' AND l."archivedByDeletion")) LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('listings',r.row,jsonb_build_object('status',CASE WHEN c->>'operation'='account_schedule' THEN 'archived' ELSE 'active' END,'archivedByDeletion',c->>'operation'='account_schedule')));
  END LOOP;
  SELECT to_jsonb(t) INTO collector FROM public.measurement_state t WHERE t.key='collector';
  SELECT to_jsonb(t) INTO baseline FROM public.measurement_state t WHERE t.key='inventory_baseline:'||(collector->>'epoch');
  IF baseline IS NOT NULL THEN effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_state',baseline,'{}',true)); END IF;
  IF c->>'operation'='account_restore' THEN CONTINUE; END IF;
  SELECT to_jsonb(t) INTO member FROM public.dealership_members t WHERE t."userId"=uid;
  IF member IS NOT NULL THEN
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('dealership_members',member,'{}',true));
   IF member->>'role'='owner' THEN
    SELECT to_jsonb(t) INTO business_row FROM public.dealerships t WHERE t.id=member->>'dealershipId';
    IF business_row->>'status'<>'suspended' THEN effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('dealerships',business_row,jsonb_build_object('status','recovery'))); END IF;
   END IF;
   audit_id:=public.diagnostic_intake_uuid('diagnostic-source:account_schedule:'||uid||':membership');
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('audit_logs',jsonb_build_object('id',audit_id),jsonb_build_object('id',audit_id,'actorId',uid,'action','BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION','targetType','Dealership','targetId',member->'dealershipId','details',jsonb_build_object('role',member->'role','recoveryRequired',member->>'role'='owner'),'createdAt',stamp))||jsonb_build_object('verb','insert','expected','absent'));
  END IF;
  FOR r IN SELECT to_jsonb(t) row FROM public.dealership_invitations t WHERE t."recipientUserId"=uid LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('dealership_invitations',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  SELECT jsonb_agg(capability ORDER BY capability) INTO caps FROM public.staff_grants WHERE "userId"=uid AND "revokedAt" IS NULL;
  FOR r IN SELECT to_jsonb(t) row FROM public.staff_grants t WHERE t."userId"=uid AND t."revokedAt" IS NULL LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('staff_grants',r.row,jsonb_build_object('revokedAt',stamp))); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  IF caps IS NOT NULL THEN
   audit_id:=public.diagnostic_intake_uuid('diagnostic-source:account_schedule:'||uid||':staff');
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('audit_logs',jsonb_build_object('id',audit_id),jsonb_build_object('id',audit_id,'actorId',uid,'action','STAFF_AUTHORITY_REVOKED_FOR_DELETION','targetType','User','targetId',uid,'details',jsonb_build_object('reason','Account deletion scheduled','capabilities',caps),'createdAt',stamp))||jsonb_build_object('verb','insert','expected','absent'));
  END IF;
  FOR r IN SELECT to_jsonb(t) row FROM public.measurement_investigation_exports t LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_investigation_exports',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  FOR r IN SELECT to_jsonb(t) row FROM public.measurement_records t WHERE t."principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid)
   OR t."visitId" IN (SELECT id FROM public.measurement_visits WHERE "principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) OR "linkedAccountId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid)) LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_records',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  FOR r IN SELECT to_jsonb(t) row FROM public.measurement_outbox t WHERE t."principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_outbox',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  FOR r IN SELECT to_jsonb(t) row FROM public.measurement_visits t WHERE t."principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) OR t."linkedAccountId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_visits',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  FOR r IN SELECT to_jsonb(t) row FROM public.measurement_principals t WHERE t."userId"=uid LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_principals',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') FROM (SELECT DISTINCT value FROM jsonb_array_elements(effects)) d);
END $$;

ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_finite_fk;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE roots jsonb:=c->'roots'; e jsonb; s record;
BEGIN
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_fk_effects(c)||public.diagnostic_source_member_effects(c)||public.diagnostic_source_account_effects(c)) LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table',e->'table','key',e->'key')); END LOOP;
 IF c->>'operation' IN ('account_schedule','account_restore') AND EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') p WHERE p->>'table'='users'
  AND p->'next'->'deletionScheduledAt' IS DISTINCT FROM p->'expected'->'source'->'deletionScheduledAt'
  AND ((c->>'operation'='account_schedule' AND p->'next'->>'deletionScheduledAt' IS NOT NULL) OR (c->>'operation'='account_restore' AND p->'expected'->'source'->>'deletionScheduledAt' IS NOT NULL AND p->'next'->>'deletionScheduledAt' IS NULL))) THEN
  roots:=roots||jsonb_build_array(jsonb_build_object('table','measurement_state','key',jsonb_build_object('key','collector')));
  roots:=roots||coalesce((SELECT jsonb_agg(jsonb_build_object('table','measurement_state','key',jsonb_build_object('key','inventory_baseline:'||epoch))) FROM public.measurement_state WHERE key='collector'),'[]');
 END IF;
 IF c->>'operation' IN ('member_create','member_replace') AND EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') p
  WHERE p->>'table'='dealership_members' AND (p->'next'->>'role'='owner' OR public.diagnostic_source_read('dealership_members',p->'key')->>'role'='owner')) THEN
  roots:=roots||jsonb_build_array(jsonb_build_object('table','measurement_state','key',jsonb_build_object('key','collector')));
  roots:=roots||coalesce((SELECT jsonb_agg(jsonb_build_object('table','measurement_state','key',jsonb_build_object('key','inventory_baseline:'||epoch))) FROM public.measurement_state WHERE key='collector'),'[]');
 END IF;
 -- A Session selector must find its actual incoming proof edge even if its User
 -- is merely an actor lock, rather than a root inventory/erasure subject.
 IF c->>'operation'='session_change' THEN
  FOR s IN SELECT p.id FROM public.diagnostic_continuity_proofs p WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements((c->'roots')||(c->'rows')) r WHERE r->>'table'='sessions' AND r->'key'->>'id'=p."issuerSessionId") LOOP
   roots:=roots||jsonb_build_array(jsonb_build_object('table','diagnostic_continuity_proofs','key',jsonb_build_object('id',s.id))); END LOOP;
 END IF;
 IF c->>'operation' IN ('staff_eligibility','staff_bootstrap') THEN
  FOR s IN SELECT p.id FROM public.diagnostic_continuity_proofs p WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements((c->'roots')||(c->'rows')) r WHERE
    (r->>'table'='staff_grants' AND r->'key'->>'userId' IN (p."issuerId",p."linkingTechnicianId")) OR
    (r->>'table'='diagnostic_center_assignments' AND
     (public.diagnostic_source_read('diagnostic_center_assignments',r->'key')->>'userId' IN (p."issuerId",p."linkingTechnicianId")
      OR r->'next'->>'userId' IN (p."issuerId",p."linkingTechnicianId")))) LOOP
   roots:=roots||jsonb_build_array(jsonb_build_object('table','diagnostic_continuity_proofs','key',jsonb_build_object('id',s.id))); END LOOP;
 END IF;
 RETURN public.diagnostic_source_scope_before_finite_fk(c||jsonb_build_object('roots',roots));
END $$;

ALTER FUNCTION public.diagnostic_source_effects(jsonb,jsonb) RENAME TO diagnostic_source_effects_before_finite_fk;
CREATE FUNCTION public.diagnostic_source_effects(c jsonb,scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; e jsonb;
BEGIN
 effects:=public.diagnostic_source_effects_before_finite_fk(c,scope);
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_fk_effects(c)||public.diagnostic_source_member_effects(c)||public.diagnostic_source_account_effects(c)) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(effects) p WHERE p->'table'=e->'table' AND p->'key'=e->'key') THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(effects) p WHERE p=e) THEN RAISE EXCEPTION 'diagnostic_source_overlapping_derived_effect'; END IF;
  ELSE effects:=effects||jsonb_build_array(e); END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(effects) e WHERE NOT EXISTS
  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=e->'table' AND n->'key'=e->'key')) THEN RAISE EXCEPTION 'diagnostic_source_effect_outside_scope'; END IF;
 -- Recompute after the complete finite effect union. A derived report request
 -- clearing is still an actual UPDATE and must retain the existing invalidator.
 SELECT coalesce(jsonb_agg(CASE WHEN p->>'derived'='invalidation' THEN
  p||jsonb_build_object('required',EXISTS(SELECT 1 FROM jsonb_array_elements(effects) changed
   WHERE public.diagnostic_source_invalidates(changed,p->'next') IS TRUE)) ELSE p END),'[]') INTO effects
 FROM jsonb_array_elements(effects) p;
 RETURN effects;
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_purge_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text
  AND (command->>'operation'='account_purge' OR (command->>'operation'='staff_bootstrap' AND TG_TABLE_NAME='audit_logs')
   OR (command->>'operation' IN ('session_change','listing_delete','account_schedule','account_restore') AND TG_TABLE_NAME<>'diagnostic_source_anchors')
   OR (command->>'operation' IN ('member_create','member_replace') AND TG_TABLE_NAME IN ('dealerships','measurement_state')))) THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

ALTER FUNCTION public.diagnostic_source_guards_ready() RENAME TO diagnostic_source_guards_ready_before_invariants;
CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_guards_ready_before_invariants() AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_guard_specs()) m
  CROSS JOIN (VALUES ('zz_diagnostic_source_presence','public.diagnostic_source_statement_guard()'::regprocedure),
   ('zz_diagnostic_source_effective','public.diagnostic_source_row_guard()'::regprocedure),
   ('zz_diagnostic_source_target','public.diagnostic_source_row_guard()'::regprocedure)) expected(name,implementation)
  WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(m->>'table'))
   AND t.tgname=expected.name AND t.tgfoid=expected.implementation))
$$;
