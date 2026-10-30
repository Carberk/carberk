-- Forward-only public pair admission. No backfill, old snapshot rewrite, column or
-- retention extension. Rollback closes public proof admission in a later forward migration.
-- Listing/identity source changes permanently invalidate UNUSED proofs. Consumed links
-- and ordinary B writes do not re-evaluate A. Identity is locked by the application owner
-- as the complete sorted User union -> Business -> Listing -> orders -> reports/proof.

CREATE FUNCTION diagnostic_public_listing_bound(binding jsonb, listing_id text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM listings l WHERE l.id=listing_id
   AND binding->>'id'=l.id AND binding->>'sellerId'=l."sellerId"
   AND binding->>'businessId' IS NOT DISTINCT FROM l."businessId"
   AND binding->>'status'=l.status::text
   AND binding->>'deletedAt' IS NOT DISTINCT FROM CASE WHEN l."deletedAt" IS NULL THEN NULL ELSE to_char(l."deletedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
   AND binding->'identity'=jsonb_build_object('vin',upper(btrim(l.vin)),'brandId',l."brandId",'modelId',l."modelId",'year',l.year))
$$;
CREATE FUNCTION diagnostic_public_continuity_bound(proof diagnostic_continuity_proofs, ao inspection_orders, b inspection_orders) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT b."publicationAuthorization" IS NOT NULL AND b."associationValidatedAt" IS NOT NULL AND b."listingIdentityDigest" IS NOT NULL
  AND proof.bindings->'candidate'->>'audience'=b.audience
  AND proof.bindings->'predecessor'->>'audience'=ao.audience
  AND proof.bindings->'candidate'->>'commissionerId'=b."commissionerId"
  AND proof.bindings->'predecessor'->>'commissionerId'=ao."commissionerId"
  AND proof.bindings->'candidate'->'publicationAuthorization'=b."publicationAuthorization"
  AND proof.bindings->'candidate'->'listingBinding'->>'identityDigest'=b."listingIdentityDigest"
  AND proof.bindings->'candidate'->>'listingIdentityDigest'=b."listingIdentityDigest"
  AND proof.bindings->'candidate'->>'associationValidatedAt'=to_char(b."associationValidatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  AND diagnostic_public_listing_bound(proof.bindings->'predecessor'->'listingBinding',ao."listingId")
  AND diagnostic_public_listing_bound(proof.bindings->'candidate'->'listingBinding',b."listingId")
  AND EXISTS (SELECT 1 FROM listings l JOIN users u ON u.id=b."commissionerId"
   WHERE l.id=b."listingId" AND l.status='active' AND l."deletedAt" IS NULL AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL
    AND proof.bindings->'candidate'->'listingBinding'->'publisher'->>'userId'=u.id
    AND proof.bindings->'candidate'->'listingBinding'->'publisher'->>'sellerId'=l."sellerId"
    AND proof.bindings->'candidate'->'listingBinding'->'publisher'->>'businessId' IS NOT DISTINCT FROM l."businessId"
    AND ((l."businessId" IS NULL AND l."sellerId"=u.id)
      OR EXISTS (SELECT 1 FROM dealership_members m JOIN dealerships d ON d.id=m."dealershipId"
       WHERE m."userId"=u.id AND m."dealershipId"=l."businessId" AND m.status='active' AND d.status='active'
        AND proof.bindings->'candidate'->'listingBinding'->'publisher'->>'membershipId'=m.id)))
$$;

CREATE OR REPLACE FUNCTION diagnostic_continuity_proof_bound(proof diagnostic_continuity_proofs) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM diagnostic_reports a JOIN inspection_orders ao ON ao.id=a."orderId"
   JOIN inspection_orders b ON b.id=proof."candidateOrderId"
   WHERE a.id=proof."predecessorReportId" AND ao.id=proof."predecessorOrderId" AND ao.id<>b.id
    AND a."erasedAt" IS NULL AND ao."erasedAt" IS NULL AND b."erasedAt" IS NULL AND ao.synthetic AND b.synthetic
    AND a.status IN ('finalized','withdrawn') AND b.status='arrived'
    AND ao."physicalAuthorization" IS NOT NULL AND b."physicalAuthorization" IS NOT NULL
    AND a.audience=ao.audience AND ao."commissionerId" IS NOT NULL AND b."commissionerId" IS NOT NULL
    AND ((a.audience='buyer_private' AND b.audience='buyer_private' AND ao."commissionerId"=b."commissionerId")
      OR (a.audience='listing_public' AND b.audience='listing_public' AND proof.content->>'method'='comparative_attestation'
        AND diagnostic_public_continuity_bound(proof,ao,b)))
    AND a.version=(proof.content->'predecessor'->>'reportVersion')::int
    AND a."snapshotHash"=proof.content->'predecessor'->>'snapshotHash'
    AND a."identityRecordId"=proof.content->'predecessor'->>'identityRecordId'
    AND a."identityRecordHash"=proof.content->'predecessor'->>'identityRecordHash'
    AND b.version=(proof.content->'candidate'->>'orderVersion')::int
    AND NOT EXISTS (SELECT 1 FROM diagnostic_reports s WHERE s."predecessorId"=a.id OR s."orderId"=b.id))
$$;

CREATE OR REPLACE FUNCTION diagnostic_report_pinned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o."templateVersionId"=NEW."templateVersionId" AND o.audience=NEW.audience AND o."erasedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_report_pinned'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."orderId",NEW."templateVersionId",NEW.audience,NEW."predecessorId",NEW.reinspection,NEW."continuityProofId",NEW."reinspectionOrderVersion") IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."templateVersionId",OLD.audience,OLD."predecessorId",OLD.reinspection,OLD."continuityProofId",OLD."reinspectionOrderVersion") THEN RAISE EXCEPTION 'diagnostic_report_identity_immutable'; END IF;
  IF OLD.snapshot IS NOT NULL AND ROW(NEW.snapshot,NEW."snapshotHash",NEW."finalizedAt",NEW.state->'findings',NEW.state->'observedAt',NEW.state->'mileageKm') IS DISTINCT FROM ROW(OLD.snapshot,OLD."snapshotHash",OLD."finalizedAt",OLD.state->'findings',OLD.state->'observedAt',OLD.state->'mileageKm') THEN RAISE EXCEPTION 'diagnostic_snapshot_immutable'; END IF;
  IF OLD.status IN ('finalized','withdrawn') AND NEW.status NOT IN ('finalized','withdrawn') THEN RAISE EXCEPTION 'diagnostic_snapshot_immutable'; END IF;
 END IF;
 IF NEW.reinspection THEN
  IF TG_OP='INSERT' AND NEW."continuityProofId" IS NOT NULL THEN
   IF NOT EXISTS (
    SELECT 1 FROM diagnostic_continuity_proofs c
    JOIN diagnostic_reports p ON p.id=c."predecessorReportId"
    WHERE c.id=NEW."continuityProofId" AND c."consumedReportId"=NEW.id AND c."invalidatedAt" IS NULL AND c."erasedAt" IS NULL
     AND c."candidateOrderId"=NEW."orderId" AND p.id=NEW."predecessorId" AND p.audience=NEW.audience AND p.snapshot IS NOT NULL
     AND NEW.state->>'authorId'=c."linkingTechnicianId"
     AND NEW."reinspectionOrderVersion"=(c.content->'candidate'->>'orderVersion')::int
     AND diagnostic_continuity_proof_bound(c)
   ) THEN RAISE EXCEPTION 'diagnostic_reinspection_continuity'; END IF;
  ELSIF TG_OP='INSERT' THEN RAISE EXCEPTION 'diagnostic_reinspection_continuity'; END IF;
 ELSIF NEW."predecessorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_reports p WHERE p.id=NEW."predecessorId" AND p."orderId"=NEW."orderId" AND p.audience=NEW.audience AND p.snapshot IS NOT NULL) THEN RAISE EXCEPTION 'diagnostic_correction_audience';
 END IF;
 RETURN NEW;
END $$;

-- Exact transition invalidation rather than a repeatable membership-field digest. No ledger.
CREATE FUNCTION diagnostic_public_continuity_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; before_row jsonb; lid text; bid text; uid text; old_uid text; old_bid text;
BEGIN
 IF TG_OP='DELETE' THEN r=to_jsonb(OLD); ELSE r=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD) IS NOT DISTINCT FROM r THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN before_row=to_jsonb(OLD); END IF;
 IF TG_TABLE_NAME='listings' THEN lid=r->>'id';
 ELSIF TG_TABLE_NAME='users' THEN uid=r->>'id';
 ELSIF TG_TABLE_NAME='dealerships' THEN bid=r->>'id';
 ELSIF TG_TABLE_NAME='dealership_members' THEN uid=r->>'userId'; old_uid=before_row->>'userId'; bid=r->>'dealershipId'; old_bid=before_row->>'dealershipId'; END IF;
 UPDATE diagnostic_continuity_proofs p SET "invalidatedAt"=CURRENT_TIMESTAMP
 WHERE p."invalidatedAt" IS NULL AND p."consumedReportId" IS NULL AND p.bindings->'candidate'->>'audience'='listing_public'
  AND (p.bindings->'candidate'->'listingBinding'->>'id'=lid OR p.bindings->'predecessor'->'listingBinding'->>'id'=lid
    OR (TG_TABLE_NAME='dealerships' AND (p.bindings->'candidate'->'listingBinding'->>'businessId'=bid OR p.bindings->'predecessor'->'listingBinding'->>'businessId'=bid))
    OR (TG_TABLE_NAME='users' AND (p.bindings->'candidate'->>'commissionerId'=uid OR p.bindings->'predecessor'->>'commissionerId'=uid
       OR p.bindings->'candidate'->'listingBinding'->>'sellerId'=uid OR p.bindings->'predecessor'->'listingBinding'->>'sellerId'=uid))
    OR (TG_TABLE_NAME='dealership_members' AND (p.bindings->'candidate'->'listingBinding'->'publisher'->>'userId' IN (uid,old_uid))
       AND p.bindings->'candidate'->'listingBinding'->>'businessId' IN (bid,old_bid)));
 RETURN NULL;
END $$;
CREATE TRIGGER diagnostic_public_continuity_listing_changed AFTER UPDATE OF "sellerId","businessId",vin,"brandId","modelId",year,status,"deletedAt" OR DELETE ON listings
 FOR EACH ROW EXECUTE FUNCTION diagnostic_public_continuity_source_changed();
CREATE TRIGGER diagnostic_public_continuity_business_changed AFTER UPDATE OF status OR DELETE ON dealerships
 FOR EACH ROW EXECUTE FUNCTION diagnostic_public_continuity_source_changed();
CREATE TRIGGER diagnostic_public_continuity_member_changed AFTER INSERT OR UPDATE OF "userId","dealershipId",role,status OR DELETE ON dealership_members
 FOR EACH ROW EXECUTE FUNCTION diagnostic_public_continuity_source_changed();
CREATE TRIGGER diagnostic_public_continuity_user_changed AFTER UPDATE OF "suspendedAt","deletionScheduledAt" ON users
 FOR EACH ROW EXECUTE FUNCTION diagnostic_public_continuity_source_changed();

-- A deferred check observes the final transaction, after proof/report/audit writes.
-- Audit IDs bind issuance to this proof and consumption to its report without exposing
-- rationale, material or personal linkage in audit details. Private legacy proofs are unaffected.
CREATE FUNCTION diagnostic_public_continuity_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p diagnostic_continuity_proofs;
BEGIN
 SELECT * INTO p FROM diagnostic_continuity_proofs WHERE id=NEW.id;
 IF NOT FOUND OR p.bindings->'candidate'->>'audience'<>'listing_public' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM diagnostic_audits a WHERE a.id=p.id AND a."orderId"=p."candidateOrderId" AND a."actorId"=p."issuerId" AND a.action='CONTINUITY_PROOF_ISSUED')
 THEN RAISE EXCEPTION 'diagnostic_public_continuity_issue_audit'; END IF;
 IF p."consumedReportId" IS NOT NULL AND (NOT EXISTS (
    SELECT 1 FROM diagnostic_reports r WHERE r.id=p."consumedReportId" AND r."continuityProofId"=p.id AND r."orderId"=p."candidateOrderId" AND r."predecessorId"=p."predecessorReportId")
   OR NOT EXISTS (SELECT 1 FROM diagnostic_audits a WHERE a.id=p."consumedReportId" AND a."orderId"=p."candidateOrderId" AND a."actorId"=p."linkingTechnicianId" AND a.action='CONTINUITY_PROOF_CONSUMED' AND a.details->>'reportId'=p."consumedReportId")
   OR NOT EXISTS (SELECT 1 FROM diagnostic_audits a WHERE a."orderId"=p."candidateOrderId" AND a."actorId"=p."linkingTechnicianId" AND a.action='REPORT_REINSPECTION_CREATED' AND a.details->>'reportId'=p."consumedReportId"))
 THEN RAISE EXCEPTION 'diagnostic_public_continuity_consumption_atomic'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER diagnostic_public_continuity_atomic AFTER INSERT OR UPDATE ON diagnostic_continuity_proofs
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION diagnostic_public_continuity_atomic();
