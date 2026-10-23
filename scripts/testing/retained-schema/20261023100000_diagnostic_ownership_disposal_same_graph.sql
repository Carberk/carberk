-- Forward-only function replacement; no historical data or schema shape changes.
-- Keep the complete sorted lock prefix and refuse every graph change.
CREATE OR REPLACE FUNCTION diagnostic_dispose_ownership(subject_id text, cutoff timestamp) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE targets jsonb; refreshed jsonb; count_erased integer;
BEGIN
 targets:=diagnostic_ownership_disposal_targets(subject_id,cutoff);
 PERFORM id FROM users WHERE id IN (SELECT jsonb_array_elements_text(targets->'u')) ORDER BY id FOR UPDATE;
 PERFORM id FROM dealerships WHERE id IN (SELECT jsonb_array_elements_text(targets->'b')) ORDER BY id FOR UPDATE;
 PERFORM id FROM listings WHERE id IN (SELECT jsonb_array_elements_text(targets->'l')) ORDER BY id FOR UPDATE;
 PERFORM id FROM inspection_orders WHERE id IN (SELECT jsonb_array_elements_text(targets->'o')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_reports WHERE id IN (SELECT jsonb_array_elements_text(targets->'r')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_continuity_proofs WHERE id IN (SELECT jsonb_array_elements_text(targets->'p')) ORDER BY id FOR UPDATE;
 -- Capture can INSERT before rights end and commit after discovery while this
 -- operation waits on its User prefix. Component IDs are disposal work, not
 -- upstream lock targets. Accept only additions inside the exact locked graph.
 -- Never extend a User/Business/Listing/order/report/proof lock set here.
 refreshed:=diagnostic_ownership_disposal_targets(subject_id,cutoff);
 IF (refreshed-'c') IS DISTINCT FROM (targets-'c')
  OR NOT ((refreshed->'c') @> (targets->'c')) THEN
  RAISE EXCEPTION 'diagnostic_ownership_disposal_targets_changed';
 END IF;
 targets:=refreshed;
 -- Payload erasure includes consumed proofs. B keeps its independent report-level
 -- opaque proof id/order-version retry binding, observations and release unchanged.
 DELETE FROM diagnostic_continuity_proofs WHERE "predecessorOrderId" IN
  (SELECT "orderId" FROM diagnostic_ownership_components WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(targets->'c')))
  OR "candidateOrderId" IN
  (SELECT "orderId" FROM diagnostic_ownership_components WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(targets->'c')))
  OR (subject_id IS NOT NULL AND ("issuerId"=subject_id OR "linkingTechnicianId"=subject_id
   OR bindings->'predecessor'->>'commissionerId'=subject_id OR bindings->'candidate'->>'commissionerId'=subject_id
   OR bindings->'predecessor'->'listingBinding'->>'sellerId'=subject_id OR bindings->'candidate'->'listingBinding'->>'sellerId'=subject_id));
 UPDATE diagnostic_ownership_components SET state='erased',scope=NULL,"sourceListingId"=NULL,"identityDigest"=NULL,
  "sellerId"=NULL,"commissionerId"=NULL,"businessId"=NULL,"membershipId"=NULL,rights=NULL,"rightsUntil"=NULL,
  "declaredById"=NULL,"declaredAt"=NULL,"erasedAt"=cutoff
 WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(targets->'c')) AND state='available';
 GET DIAGNOSTICS count_erased=ROW_COUNT;
 IF subject_id IS NOT NULL THEN UPDATE diagnostic_ownership_components SET "declaredById"=NULL WHERE "declaredById"=subject_id; END IF;
 RETURN count_erased;
END $$;
