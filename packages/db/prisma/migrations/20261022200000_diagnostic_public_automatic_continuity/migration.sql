-- Public automatic continuity is admitted only for the unchanged commissioner
-- pair. Listing identity, current publisher authority and association remain
-- enforced by diagnostic_public_continuity_bound; comparative public pairs keep
-- their existing independent-commissioner path.
CREATE OR REPLACE FUNCTION diagnostic_continuity_proof_bound(proof diagnostic_continuity_proofs) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM diagnostic_reports a JOIN inspection_orders ao ON ao.id=a."orderId"
   JOIN inspection_orders b ON b.id=proof."candidateOrderId"
   WHERE a.id=proof."predecessorReportId" AND ao.id=proof."predecessorOrderId" AND ao.id<>b.id
    AND a."erasedAt" IS NULL AND ao."erasedAt" IS NULL AND b."erasedAt" IS NULL AND ao.synthetic AND b.synthetic
    AND a.status IN ('finalized','withdrawn') AND b.status='arrived'
    AND ao."physicalAuthorization" IS NOT NULL AND b."physicalAuthorization" IS NOT NULL
    AND a.audience=ao.audience AND ao."commissionerId" IS NOT NULL AND b."commissionerId" IS NOT NULL
    AND ((a.audience='buyer_private' AND b.audience='buyer_private' AND ao."commissionerId"=b."commissionerId")
      OR (a.audience='listing_public' AND b.audience='listing_public'
        AND ((proof.content->>'method'='comparative_attestation')
          OR (proof.content->>'method'='automatic_normalized_vin' AND ao."commissionerId"=b."commissionerId"))
        AND diagnostic_public_continuity_bound(proof,ao,b)))
    AND a.version=(proof.content->'predecessor'->>'reportVersion')::int
    AND a."snapshotHash"=proof.content->'predecessor'->>'snapshotHash'
    AND a."identityRecordId"=proof.content->'predecessor'->>'identityRecordId'
    AND a."identityRecordHash"=proof.content->'predecessor'->>'identityRecordHash'
    AND b.version=(proof.content->'candidate'->>'orderVersion')::int
    AND NOT EXISTS (SELECT 1 FROM diagnostic_reports s WHERE s."predecessorId"=a.id OR s."orderId"=b.id))
$$;
