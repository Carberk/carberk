-- One bounded seven-finding source correction. Historical migrations are immutable.
-- Expansion only: no guard activation, admission, callers, grants or backfill.

-- Actual physical InspectionInterest names, including its absent unique key and
-- both FK endpoints. Keep its existing rank/namespace and every other registry row.
ALTER FUNCTION public.diagnostic_source_registry() RENAME TO diagnostic_source_registry_before_source_correction;
CREATE FUNCTION public.diagnostic_source_registry() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(CASE WHEN m->>'table'='inspection_interests' THEN m||jsonb_build_object(
  'fields',jsonb_build_array('id','listing_id','requester_user_id','side','willingness_to_pay_tmt','created_at','updated_at'),
  'unique',jsonb_build_array(jsonb_build_array('listing_id','requester_user_id')),
  'refs',jsonb_build_array(
   jsonb_build_object('table','listings','columns',jsonb_build_array('listing_id'),'target',jsonb_build_array('id')),
   jsonb_build_object('table','users','columns',jsonb_build_array('requester_user_id'),'target',jsonb_build_array('id'))))
 ELSE m END ORDER BY i)
 FROM jsonb_array_elements(public.diagnostic_source_registry_before_source_correction()) WITH ORDINALITY x(m,i)
$$;

-- Role/status describe current eligibility. Only membership identity loss or
-- replacement changes the sticky witness. Existing proof invalidators and
-- current OWNER checks are independent and remain intact.
CREATE OR REPLACE FUNCTION public.diagnostic_source_transition() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_row jsonb; after_row jsonb; oid text; receipt public.diagnostic_source_commands; initial boolean:=false;
BEGIN
 before_row:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF TG_TABLE_NAME='listings' THEN
  IF TG_OP='UPDATE' AND ROW(OLD."sellerId",OLD."businessId",OLD."brandId",OLD."modelId",OLD.year,upper(btrim(OLD.vin)))
   IS NOT DISTINCT FROM ROW(NEW."sellerId",NEW."businessId",NEW."brandId",NEW."modelId",NEW.year,upper(btrim(NEW.vin))) THEN RETURN NULL; END IF;
  UPDATE public.diagnostic_source_anchors a SET state='changed' WHERE a.state IN ('pending','unchanged')
   AND (a.source->>'listingId'=before_row->>'id' OR a.source->>'listingId'=after_row->>'id');
 ELSIF TG_TABLE_NAME='dealership_members' THEN
  IF TG_OP='UPDATE' AND ROW(OLD.id,OLD."userId",OLD."dealershipId") IS NOT DISTINCT FROM ROW(NEW.id,NEW."userId",NEW."dealershipId") THEN RETURN NULL; END IF;
  UPDATE public.diagnostic_source_anchors a SET state='changed' WHERE a.state IN ('pending','unchanged')
   AND (a.source->>'memberId'=before_row->>'id' OR a.source->>'memberId'=after_row->>'id'
    OR (a.source->>'commissionerId' IN (before_row->>'userId',after_row->>'userId') AND a.source->>'memberBusinessId' IN (before_row->>'dealershipId',after_row->>'dealershipId')));
 ELSIF TG_TABLE_NAME='inspection_orders' THEN
  oid:=after_row->>'id';
  IF ROW(OLD."listingId",OLD."commissionerId",OLD.audience) IS DISTINCT FROM ROW(NEW."listingId",NEW."commissionerId",NEW.audience) THEN
   UPDATE public.diagnostic_source_anchors SET state='changed' WHERE "orderId"=oid AND state IN ('pending','unchanged');
  ELSIF public.diagnostic_source_observed_identity(OLD."observedVehicle") IS DISTINCT FROM public.diagnostic_source_observed_identity(NEW."observedVehicle") THEN
   initial:=OLD."observedVehicle" IS NULL AND receipt.command->>'operation'='observation_append'
    AND EXISTS (SELECT 1 FROM public.diagnostic_source_anchors WHERE "orderId"=oid AND "firstRecordId" IS NULL AND state='pending')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.command->'rows') r WHERE r->>'table'='diagnostic_identity_records' AND r->>'verb'='insert' AND r->'next'->>'orderId'=oid
     AND public.diagnostic_source_observed_identity(r->'next'->'observation')=public.diagnostic_source_observed_identity(NEW."observedVehicle"));
   IF initial IS NOT TRUE THEN UPDATE public.diagnostic_source_anchors SET state='changed' WHERE "orderId"=oid AND state IN ('pending','unchanged'); END IF;
  END IF;
 ELSIF TG_TABLE_NAME='diagnostic_ownership_components' THEN
  IF NEW.state='erased' THEN UPDATE public.diagnostic_source_anchors SET state='erased',source=NULL,"firstRecordId"=NULL WHERE "firstRecordId"=NEW."identityRecordId" AND state<>'erased'; END IF;
 ELSIF TG_TABLE_NAME='diagnostic_identity_records' THEN
  IF TG_OP='DELETE' OR after_row->'erasedAt'<>'null' THEN
   UPDATE public.diagnostic_source_anchors SET state='erased',source=NULL,"firstRecordId"=NULL WHERE "firstRecordId"=before_row->>'id' AND state<>'erased';
  END IF;
 END IF;
 RETURN NULL;
END $$;

-- Complete the physical Listing FK union. The FK action changes listingId only;
-- its existing order AFTER triggers mark the anchor changed and invalidate any
-- unused proof. Scope preparation already roots every derived effect, discovers
-- its retained graph, and locks/rechecks it before mutation. No trigger adds locks.
ALTER FUNCTION public.diagnostic_source_fk_effects(jsonb) RENAME TO diagnostic_source_fk_effects_before_source_correction;
CREATE FUNCTION public.diagnostic_source_fk_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; e jsonb; r record;
BEGIN
 effects:=public.diagnostic_source_fk_effects_before_source_correction(c);
 IF c->>'operation'='listing_delete' THEN
  FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='listings' AND value->>'verb'='delete' LOOP
   FOR r IN SELECT to_jsonb(t) row FROM public.inspection_orders t WHERE t."listingId"=e->'key'->>'id' LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('inspection_orders',r.row,jsonb_build_object('listingId',NULL)));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
   END LOOP;
   FOR r IN SELECT to_jsonb(t) row FROM public.inspection_interests t WHERE t.listing_id=e->'key'->>'id' LOOP
    effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('inspection_interests',r.row,'{}',true));
    IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
   END LOOP;
  END LOOP;
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') FROM (SELECT DISTINCT value FROM jsonb_array_elements(effects)) d);
END $$;

-- One event per outer scheduling transaction. Full xid includes its epoch and
-- cannot be chosen by caller JSON or confused with a reused schedule date.
-- The same function supplies the later caller's exact mandatory INSERT IDs.
-- Re-preparation after writes is still refused; no receipt or payload persists.
CREATE FUNCTION public.diagnostic_source_account_audit_id(user_id text,family text) RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF user_id IS NULL OR family IS NULL OR family NOT IN ('membership','staff') THEN RAISE EXCEPTION 'diagnostic_source_account_audit_family'; END IF;
 RETURN public.diagnostic_intake_uuid(jsonb_build_array('diagnostic-source:account_schedule',pg_current_xact_id()::text,user_id,family)::text);
END $$;

-- Match the existing owner's CURRENT_TIMESTAMP assignment to TIMESTAMP(3):
-- PostgreSQL rounds, including .123600 -> .124. The same session timezone
-- cast as CURRENT_TIMESTAMP also preserves the existing owner's exact target.
-- No tolerance or caller-selected target.
CREATE FUNCTION public.diagnostic_source_staff_revocation_timestamp(at_time timestamptz) RETURNS timestamp
LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,public AS $$
 SELECT at_time::timestamp(3)
$$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_account_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb:='[]'; e jsonb; uid text; r record; member jsonb; business_row jsonb; collector jsonb; baseline jsonb;
 caps jsonb; audit_id text; stamp timestamp:=public.diagnostic_source_staff_revocation_timestamp(transaction_timestamp());
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
   audit_id:=public.diagnostic_source_account_audit_id(uid,'membership');
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('audit_logs',jsonb_build_object('id',audit_id),jsonb_build_object('id',audit_id,'actorId',uid,'action','BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION','targetType','Dealership','targetId',member->'dealershipId','details',jsonb_build_object('role',member->'role','recoveryRequired',member->>'role'='owner'),'createdAt',stamp))||jsonb_build_object('verb','insert','expected','absent'));
  END IF;
  FOR r IN SELECT to_jsonb(t) row FROM public.dealership_invitations t WHERE t."recipientUserId"=uid LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('dealership_invitations',r.row,'{}',true)); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  SELECT jsonb_agg(capability ORDER BY capability) INTO caps FROM public.staff_grants WHERE "userId"=uid AND "revokedAt" IS NULL;
  FOR r IN SELECT to_jsonb(t) row FROM public.staff_grants t WHERE t."userId"=uid AND t."revokedAt" IS NULL LOOP
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('staff_grants',r.row,jsonb_build_object('revokedAt',stamp))); IF jsonb_array_length(effects)>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF; END LOOP;
  IF caps IS NOT NULL THEN
   audit_id:=public.diagnostic_source_account_audit_id(uid,'staff');
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
