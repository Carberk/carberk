-- Forward-only representation of existing independently due component expiry.
-- Grants keep their separate schedule; strict preparation and activation are unchanged.
CREATE OR REPLACE FUNCTION public.diagnostic_source_parse_before_intake(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; effect jsonb;
BEGIN
 parsed:=public.diagnostic_source_parse_before_purge(c);
 IF parsed->>'operation' IN ('ownership_revoke','ownership_expire') AND EXISTS(SELECT 1 FROM jsonb_array_elements(parsed->'rows') x WHERE x->>'table' NOT IN ('diagnostic_ownership_grants','diagnostic_audits') AND NOT (parsed->>'operation'='ownership_expire' AND x->>'table'='diagnostic_ownership_components')) THEN RAISE EXCEPTION 'diagnostic_source_disposal_intent'; END IF;
 PERFORM public.diagnostic_source_disposal_effects(parsed);
 IF parsed->>'operation'='account_purge' THEN
  IF jsonb_array_length(parsed->'roots')<>1 OR parsed->'roots'->0->>'table'<>'users'
   OR jsonb_array_length(parsed->'rows')<>1 OR parsed->'rows'->0->>'table'<>'users'
   OR parsed->'rows'->0->>'verb'<>'update' OR parsed->'rows'->0->'key' IS DISTINCT FROM parsed->'roots'->0->'key' THEN
   RAISE EXCEPTION 'diagnostic_source_purge_intent'; END IF;
  SELECT value INTO effect FROM jsonb_array_elements(public.diagnostic_account_purge_effects(parsed)) WHERE value->>'table'='users';
  IF parsed->'rows'->0->'next' IS DISTINCT FROM effect->'next' THEN RAISE EXCEPTION 'diagnostic_source_purge_intent'; END IF;
 END IF;
 RETURN parsed;
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_disposal_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb:='[]'; e jsonb; d jsonb; x record; r jsonb; patch jsonb; at_time timestamp:=COALESCE((c->>'cutoff')::timestamp,clock_timestamp() AT TIME ZONE 'UTC');
 components jsonb:='[]'; orders jsonb:='[]'; grants jsonb:='[]'; raw_ids jsonb:='[]';
BEGIN
 SELECT COALESCE((c->>'cutoff')::timestamp,min(COALESCE((z->'next'->>'erasedAt')::timestamp,(z->'next'->>'cleanupRequestedAt')::timestamp)),at_time) INTO at_time FROM jsonb_array_elements(c->'rows') z;
 IF at_time>clock_timestamp() AT TIME ZONE 'UTC' THEN RAISE EXCEPTION 'diagnostic_source_future_cutoff'; END IF;
 IF c->>'operation' IN ('ownership_revoke','ownership_expire') THEN
  FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='diagnostic_ownership_grants' LOOP
   IF e->>'verb'<>'update' OR e->'next'->>'state'<>'erased' THEN RAISE EXCEPTION 'diagnostic_source_disposal_intent'; END IF;
   IF c->>'operation'='ownership_expire' AND (e->'expected'->'source'->>'rightsUntil')::timestamp>at_time THEN RAISE EXCEPTION 'diagnostic_source_disposal_not_due'; END IF;
   d:=public.diagnostic_ownership_disposal_scope(NULL,at_time,e->'key'->>'id');
   components:=components||(d->'c'); grants:=grants||(d->'g');
  END LOOP;
 END IF;
 IF c->>'operation'='ownership_expire' THEN
  FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='diagnostic_ownership_components' LOOP
   r:=e->'expected'->'source';
   IF e->>'verb' IS DISTINCT FROM 'update' OR r->>'state' IS DISTINCT FROM 'available'
    OR r->>'rightsUntil' IS NULL OR (r->>'rightsUntil')::timestamp>at_time THEN
    RAISE EXCEPTION 'diagnostic_source_component_not_due'; END IF;
   IF components ? (e->'key'->>'identityRecordId') THEN RAISE EXCEPTION 'diagnostic_source_overlapping_derived_effect'; END IF;
   patch:=jsonb_build_object('state','erased','grantId',NULL,'scope',NULL,'sourceListingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,
    'businessId',NULL,'membershipId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredById',NULL,'declaredAt',NULL,'erasedAt',at_time);
   IF e->'next' IS DISTINCT FROM public.diagnostic_source_normalize('diagnostic_ownership_components',r||patch) THEN
    RAISE EXCEPTION 'diagnostic_source_component_erasure'; END IF;
   components:=components||jsonb_build_array(e->'key'->>'identityRecordId');
  END LOOP;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table' IN ('diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance') LOOP
  IF e->>'verb'='delete' OR e->'next'->>'erasedAt' IS NOT NULL OR e->'next'->>'cleanupRequestedAt' IS NOT NULL THEN
   orders:=orders||jsonb_build_array(e->'expected'->'source'->>'orderId');
   IF e->>'table'='diagnostic_identity_records' THEN raw_ids:=raw_ids||jsonb_build_array(e->'key'->>'id'); END IF;
  END IF;
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_ownership_components t WHERE
  (t.state='available' AND components ? t."identityRecordId") OR (t.state='available' AND raw_ids ? t."identityRecordId") LOOP
  r:=x.row; orders:=orders||jsonb_build_array(r->>'orderId');
  patch:=jsonb_build_object('state','erased','grantId',NULL,'scope',NULL,'sourceListingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,
   'businessId',NULL,'membershipId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredById',NULL,'declaredAt',NULL,'erasedAt',at_time);
  -- The exact component erasure may be intended; all other selected components
  -- retain their existing grant/raw-derived effect and completion obligations.
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') z WHERE z->>'table'='diagnostic_ownership_components'
   AND z->'key'->>'identityRecordId'=r->>'identityRecordId') THEN
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_components',r,patch)); END IF;
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_ownership_grants t WHERE t.state='available' AND grants ? t.id LOOP
  r:=x.row;
  patch:=jsonb_build_object('state','erased','listingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,'businessId',NULL,'membershipId',NULL,
   'grantorId',NULL,'grantorMembershipId',NULL,'sessionId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredAt',NULL,'erasedAt',at_time);
  -- The grant is the intended source row, but its actual erasure tuple is fixed
  -- by policy. It cannot preserve a writable fake payload in a purported erasure.
  SELECT value INTO e FROM jsonb_array_elements(c->'rows') z WHERE z->>'table'='diagnostic_ownership_grants' AND z->'key'->>'id'=r->>'id';
  IF e IS NOT NULL AND e->'next' IS DISTINCT FROM public.diagnostic_source_normalize('diagnostic_ownership_grants',r||patch) THEN RAISE EXCEPTION 'diagnostic_source_disposal_intent'; END IF;
  IF e IS NULL THEN effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_grants',r,patch)); END IF;
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_continuity_proofs t WHERE orders ? t."candidateOrderId" OR orders ? t."predecessorOrderId" LOOP
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_proofs',x.row,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_source_anchors t WHERE t.state<>'erased' AND
  (components ? t."firstRecordId" OR raw_ids ? t."firstRecordId" OR t."orderId" IN (SELECT "orderId" FROM public.diagnostic_ownership_grants WHERE grants ? id)) LOOP
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_source_anchors',x.row,jsonb_build_object('state','erased','source',NULL,'firstRecordId',NULL)));
 END LOOP;
 RETURN effects;
END $$;

CREATE FUNCTION public.diagnostic_dispose_ownership_components(component_ids text[],cutoff timestamp) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE receipt public.diagnostic_source_commands; selected text[]; orders text[]; e jsonb; rid text; n integer; removed integer:=0;
BEGIN
 IF component_ids IS NULL OR cardinality(component_ids) NOT BETWEEN 1 AND 100
  OR array_position(component_ids,NULL) IS NOT NULL
  OR cardinality(component_ids)<>(SELECT count(DISTINCT x) FROM unnest(component_ids) x)
 THEN RAISE EXCEPTION 'diagnostic_source_component_keys'; END IF;
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text;
 IF receipt.id IS NULL OR receipt.command->>'operation' IS DISTINCT FROM 'ownership_expire'
  OR cutoff IS NULL OR cutoff IS DISTINCT FROM (receipt.command->>'cutoff')::timestamp
 THEN RAISE EXCEPTION 'diagnostic_source_component_receipt'; END IF;
 SELECT array_agg(z->'key'->>'identityRecordId' ORDER BY z->'key'->>'identityRecordId'),
  array_agg(z->'expected'->'source'->>'orderId' ORDER BY z->'key'->>'identityRecordId') INTO selected,orders
 FROM jsonb_array_elements(receipt.command->'rows') z WHERE z->>'table'='diagnostic_ownership_components';
 IF selected IS DISTINCT FROM ARRAY(SELECT x FROM unnest(component_ids) x ORDER BY x)
 THEN RAISE EXCEPTION 'diagnostic_source_component_keys'; END IF;
 -- Only frozen, already-discovered PK effects are executed. No selection sweep,
 -- upstream lock, grant write, raw write or report write occurs after preparation.
 FOR e IN SELECT value FROM jsonb_array_elements(receipt.effects) WHERE value->>'table'='diagnostic_continuity_proofs'
  AND value->>'verb'='delete' AND (value->'expected'->'source'->>'candidateOrderId'=ANY(orders)
   OR value->'expected'->'source'->>'predecessorOrderId'=ANY(orders)) ORDER BY value->'key'->>'id' LOOP
  DELETE FROM public.diagnostic_continuity_proofs WHERE id=e->'key'->>'id';
 END LOOP;
 FOREACH rid IN ARRAY selected LOOP
  UPDATE public.diagnostic_ownership_components SET state='erased',"grantId"=NULL,scope=NULL,"sourceListingId"=NULL,"identityDigest"=NULL,
   "sellerId"=NULL,"commissionerId"=NULL,"businessId"=NULL,"membershipId"=NULL,rights=NULL,"rightsUntil"=NULL,
   "declaredById"=NULL,"declaredAt"=NULL,"erasedAt"=cutoff WHERE "identityRecordId"=rid AND state='available';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'diagnostic_source_component_changed'; END IF;
  removed:=removed+n;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(receipt.effects) WHERE value->>'table'='diagnostic_source_anchors'
  AND value->'expected'->'source'->>'firstRecordId'=ANY(selected) ORDER BY value->'key'->>'orderId' LOOP
  UPDATE public.diagnostic_source_anchors SET state='erased',source=NULL,"firstRecordId"=NULL WHERE "orderId"=e->'key'->>'orderId';
 END LOOP;
 RETURN removed;
END $$;
