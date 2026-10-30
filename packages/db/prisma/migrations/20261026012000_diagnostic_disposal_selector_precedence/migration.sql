-- Forward-only correction of JSON extraction precedence in the existing disposal selector.
-- Historical migrations and disposal policy remain unchanged; no activation.
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
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_components',r,patch));
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
