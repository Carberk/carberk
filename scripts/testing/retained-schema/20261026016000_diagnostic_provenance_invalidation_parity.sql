-- Forward-only planner parity for provenance event boundaries. The existing AFTER UPDATE OR DELETE trigger remains unchanged.
CREATE OR REPLACE FUNCTION public.diagnostic_source_invalidates(e jsonb,p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE t text:=e->>'table'; r jsonb:=COALESCE(NULLIF(e->'next','null'),e->'expected'->'source'); prior jsonb:=e->'expected'->'source'; oid text; uid text; sid text;
BEGIN
 IF t='diagnostic_identity_provenance' AND e->>'verb'='insert' THEN RETURN false; END IF;
 IF t='diagnostic_identity_provenance' AND e->>'verb'='update' AND (r-ARRAY['writeLeaseUntil','cleanupLeaseUntil','cleanupAttempts','cleanupFailureCode']) IS NOT DISTINCT FROM (prior-ARRAY['writeLeaseUntil','cleanupLeaseUntil','cleanupAttempts','cleanupFailureCode']) THEN RETURN false; END IF;
 IF e->>'verb'='update' AND r=prior THEN RETURN false; END IF;
 IF t='inspection_orders' THEN oid:=r->>'id';
 ELSIF t IN ('diagnostic_reports','diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance','diagnostic_order_assignments') THEN oid:=r->>'orderId';
 ELSIF t='users' THEN
  IF e->>'verb'<>'update' OR ROW(prior->'suspendedAt',prior->'deletionScheduledAt') IS NOT DISTINCT FROM ROW(r->'suspendedAt',r->'deletionScheduledAt') THEN RETURN false; END IF;
  uid:=r->>'id';
 ELSIF t IN ('staff_grants','diagnostic_center_assignments') THEN uid:=r->>'userId';
 ELSIF t='sessions' THEN sid:=r->>'id'; END IF;
 IF oid IN (p->>'candidateOrderId',p->>'predecessorOrderId') OR uid IN (p->>'issuerId',p->>'linkingTechnicianId') OR sid=p->>'issuerSessionId' THEN RETURN true; END IF;
 IF p->'bindings'->'candidate'->>'audience'<>'listing_public' THEN RETURN false; END IF;
 IF t='listings' THEN RETURN r->>'id' IN (p->'bindings'->'candidate'->'listingBinding'->>'id',p->'bindings'->'predecessor'->'listingBinding'->>'id'); END IF;
 IF t='dealerships' THEN RETURN r->>'id' IN (p->'bindings'->'candidate'->'listingBinding'->>'businessId',p->'bindings'->'predecessor'->'listingBinding'->>'businessId'); END IF;
 IF t='users' THEN RETURN r->>'id' IN (p->'bindings'->'candidate'->>'commissionerId',p->'bindings'->'predecessor'->>'commissionerId',p->'bindings'->'candidate'->'listingBinding'->>'sellerId',p->'bindings'->'predecessor'->'listingBinding'->>'sellerId'); END IF;
 IF t='dealership_members' THEN RETURN p->'bindings'->'candidate'->'listingBinding'->'publisher'->>'userId' IN (r->>'userId',prior->>'userId')
  AND p->'bindings'->'candidate'->'listingBinding'->>'businessId' IN (r->>'dealershipId',prior->>'dealershipId'); END IF;
 RETURN false;
END $$;
