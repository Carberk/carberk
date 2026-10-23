-- Forward-only source-authenticated grants. Automatic proof admission remains CLOSED.
-- No backfill, fixed retention, broader issuer, or source/order-writing trigger.
CREATE TABLE diagnostic_ownership_grants (
 id text PRIMARY KEY, "orderId" text NOT NULL UNIQUE REFERENCES inspection_orders(id) ON DELETE CASCADE,
 state text NOT NULL CHECK (state IN ('available','erased')), "listingId" text, "identityDigest" text,
 "sellerId" text, "commissionerId" text, "businessId" text, "membershipId" text,
 "grantorId" text, "grantorMembershipId" text, "sessionId" text, rights jsonb,
 "rightsUntil" timestamp(3), "declaredAt" timestamp(3), "erasedAt" timestamp(3),
 CONSTRAINT diagnostic_ownership_grant_shape CHECK ((CASE WHEN state='available' THEN
  "listingId" IS NOT NULL AND "identityDigest" ~ '^[a-f0-9]{64}$' AND "sellerId" IS NOT NULL AND "commissionerId" IS NOT NULL
  AND "grantorId" IS NOT NULL AND "sessionId" IS NOT NULL AND "declaredAt" IS NOT NULL AND "rightsUntil">"declaredAt"
  AND diagnostic_ownership_rights_valid(rights,"rightsUntil") AND "erasedAt" IS NULL
  AND (("businessId" IS NULL AND "membershipId" IS NULL AND "grantorMembershipId" IS NULL)
   OR ("businessId" IS NOT NULL AND "membershipId" IS NOT NULL AND "grantorMembershipId" IS NOT NULL))
 ELSE "erasedAt" IS NOT NULL AND "listingId" IS NULL AND "identityDigest" IS NULL AND "sellerId" IS NULL AND "commissionerId" IS NULL
  AND "businessId" IS NULL AND "membershipId" IS NULL AND "grantorId" IS NULL AND "grantorMembershipId" IS NULL
  AND "sessionId" IS NULL AND rights IS NULL AND "rightsUntil" IS NULL AND "declaredAt" IS NULL END) IS TRUE)
);
CREATE INDEX diagnostic_ownership_grants_sellerId_idx ON diagnostic_ownership_grants("sellerId");
CREATE INDEX diagnostic_ownership_grants_commissionerId_idx ON diagnostic_ownership_grants("commissionerId");
CREATE INDEX diagnostic_ownership_grants_grantorId_idx ON diagnostic_ownership_grants("grantorId");
CREATE INDEX diagnostic_ownership_grants_rightsUntil_state_idx ON diagnostic_ownership_grants("rightsUntil",state);
ALTER TABLE diagnostic_ownership_components ADD COLUMN "grantId" text REFERENCES diagnostic_ownership_grants(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX diagnostic_ownership_components_grantId_idx ON diagnostic_ownership_components("grantId");

-- Exact source digest shares the existing observation component normalization.
CREATE FUNCTION diagnostic_ownership_grant_current(g diagnostic_ownership_grants, at_time timestamp) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT (g.state='available' AND g."erasedAt" IS NULL AND g."rightsUntil">at_time
 AND diagnostic_ownership_rights_valid(g.rights,g."rightsUntil") AND o.audience='listing_public' AND o.synthetic AND o."erasedAt" IS NULL
 AND o."listingId"=g."listingId" AND o."commissionerId"=g."commissionerId" AND l."deletedAt" IS NULL
 AND l."sellerId"=g."sellerId" AND l."businessId" IS NOT DISTINCT FROM g."businessId"
 AND g."identityDigest"=encode(sha256(convert_to('['||to_json(l.id)::text||','||to_json(l."sellerId")::text||','||COALESCE(to_json(l."businessId")::text,'null')||','||COALESCE(to_json(upper(btrim(l.vin)))::text,'null')||','||to_json(l."brandId")::text||','||to_json(l."modelId")::text||','||COALESCE(to_json(l.year)::text,'null')||']','UTF8')),'hex')
 AND EXISTS (SELECT 1 FROM users u WHERE u.id=g."sellerId" AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
 AND EXISTS (SELECT 1 FROM users u WHERE u.id=g."commissionerId" AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
 AND EXISTS (SELECT 1 FROM users u WHERE u.id=g."grantorId" AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
 AND ((g."businessId" IS NULL AND g."grantorId"=g."sellerId" AND g."membershipId" IS NULL AND g."grantorMembershipId" IS NULL)
 OR (g."businessId" IS NOT NULL AND EXISTS (SELECT 1 FROM dealership_members m JOIN dealerships b ON b.id=m."dealershipId"
  WHERE m.id=g."grantorMembershipId" AND m."userId"=g."grantorId" AND m."dealershipId"=g."businessId" AND m.role='owner' AND m.status='active' AND b.status='active')
 AND EXISTS (SELECT 1 FROM dealership_members m WHERE m.id=g."membershipId" AND m."userId"=g."commissionerId" AND m."dealershipId"=g."businessId" AND m.status='active')))) IS TRUE
 FROM inspection_orders o JOIN listings l ON l.id=o."listingId" WHERE o.id=g."orderId"
$$;
CREATE FUNCTION diagnostic_ownership_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM inspection_orders WHERE id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_ownership_grant_immutable'; END IF;
  RETURN OLD;
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
   OR (NEW IS DISTINCT FROM OLD AND (OLD.state='erased' OR NEW.state<>'erased')) THEN RAISE EXCEPTION 'diagnostic_ownership_grant_immutable'; END IF;
  IF NEW.state='erased' AND EXISTS (SELECT 1 FROM diagnostic_ownership_components WHERE "grantId"=OLD.id AND state='available') THEN RAISE EXCEPTION 'diagnostic_ownership_grant_disposal_required'; END IF;
  RETURN NEW;
 END IF;
 IF diagnostic_ownership_grant_current(NEW,clock_timestamp() AT TIME ZONE 'UTC') IS NOT TRUE
  OR EXISTS (SELECT 1 FROM diagnostic_identity_records WHERE "orderId"=NEW."orderId")
  OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id=NEW."sessionId" AND s."userId"=NEW."grantorId" AND s."expiresAt">clock_timestamp() AT TIME ZONE 'UTC')
 THEN RAISE EXCEPTION 'diagnostic_ownership_grant_source'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_ownership_grant_guard BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_ownership_grants
 FOR EACH ROW EXECUTE FUNCTION diagnostic_ownership_grant_guard();
CREATE FUNCTION diagnostic_ownership_component_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g diagnostic_ownership_grants;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW."grantId" IS DISTINCT FROM OLD."grantId" AND NOT (NEW.state='erased' AND NEW."grantId" IS NULL) THEN RAISE EXCEPTION 'diagnostic_ownership_grant_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.state<>'available' THEN
  IF NEW."grantId" IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_ownership_grant_binding'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO g FROM diagnostic_ownership_grants WHERE id=NEW."grantId";
 IF (diagnostic_ownership_grant_current(g,clock_timestamp() AT TIME ZONE 'UTC') AND g."orderId"=NEW."orderId"
  AND g."listingId"=NEW."sourceListingId" AND g."identityDigest"=NEW."identityDigest" AND g."sellerId"=NEW."sellerId"
  AND g."commissionerId"=NEW."commissionerId" AND g."businessId" IS NOT DISTINCT FROM NEW."businessId"
  AND g."membershipId" IS NOT DISTINCT FROM NEW."membershipId" AND NEW."rightsUntil"<=g."rightsUntil"
  AND (NEW.rights-'schedule')=(g.rights-'schedule')) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_ownership_grant_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_ownership_component_grant_guard BEFORE INSERT OR UPDATE ON diagnostic_ownership_components
 FOR EACH ROW EXECUTE FUNCTION diagnostic_ownership_component_grant_guard();
CREATE FUNCTION diagnostic_ownership_disposal_scope(subject_id text, cutoff timestamp, grant_id text) RETURNS jsonb LANGUAGE sql VOLATILE AS $$
 WITH RECURSIVE
 selected_grants AS MATERIALIZED (
  SELECT * FROM diagnostic_ownership_grants g WHERE g.state='available' AND
   ((grant_id IS NOT NULL AND g.id=grant_id) OR (subject_id IS NOT NULL AND subject_id IN (g."sellerId",g."commissionerId",g."grantorId"))
    OR (grant_id IS NULL AND subject_id IS NULL AND g."rightsUntil"<=cutoff)) ORDER BY g.id
   LIMIT CASE WHEN subject_id IS NULL AND grant_id IS NULL THEN 100 ELSE 2147483647 END
 ),
 selected_expiry AS MATERIALIZED (
  SELECT c."identityRecordId",c."orderId" FROM diagnostic_ownership_components c WHERE c.state='available'
   AND ((subject_id IS NOT NULL AND (c."sellerId"=subject_id OR c."commissionerId"=subject_id))
    OR (subject_id IS NULL AND grant_id IS NULL AND c."rightsUntil"<=cutoff) OR c."grantId" IN (SELECT id FROM selected_grants)) ORDER BY c."identityRecordId"
   LIMIT CASE WHEN subject_id IS NULL THEN 100 ELSE 2147483647 END
 ), selected AS MATERIALIZED (SELECT * FROM selected_expiry UNION SELECT c."identityRecordId",c."orderId" FROM diagnostic_ownership_components c WHERE c.state='available' AND c."grantId" IN (SELECT id FROM selected_grants)),
 subject_proofs AS MATERIALIZED (SELECT * FROM diagnostic_continuity_proofs WHERE subject_id IS NOT NULL AND ("issuerId"=subject_id OR "linkingTechnicianId"=subject_id
   OR bindings->'predecessor'->>'commissionerId'=subject_id OR bindings->'candidate'->>'commissionerId'=subject_id
   OR bindings->'predecessor'->'listingBinding'->>'sellerId'=subject_id OR bindings->'candidate'->'listingBinding'->>'sellerId'=subject_id)),
 edges0 AS (
  SELECT "predecessorOrderId" a,"candidateOrderId" b FROM diagnostic_continuity_proofs
  UNION SELECT a."orderId",b."orderId" FROM diagnostic_reports a JOIN diagnostic_reports b ON b."predecessorId"=a.id
 ), edges AS (SELECT a,b FROM edges0 UNION SELECT b,a FROM edges0),
 seeds AS (
  SELECT "orderId" id FROM selected
  UNION SELECT "orderId" FROM selected_grants
  UNION SELECT id FROM inspection_orders WHERE subject_id IS NOT NULL AND "commissionerId"=subject_id
  UNION SELECT "orderId" FROM diagnostic_reports WHERE subject_id IS NOT NULL AND (state->>'authorId'=subject_id OR state->>'reviewerId'=subject_id)
  UNION SELECT "orderId" FROM diagnostic_identity_records WHERE subject_id IS NOT NULL AND "recordedById"=subject_id
  UNION SELECT "orderId" FROM diagnostic_ownership_components WHERE subject_id IS NOT NULL AND "declaredById"=subject_id
  UNION SELECT "predecessorOrderId" FROM subject_proofs
  UNION SELECT "candidateOrderId" FROM subject_proofs
 ), walk(id) AS (SELECT id FROM seeds WHERE id IS NOT NULL UNION SELECT e.b FROM walk w JOIN edges e ON e.a=w.id WHERE e.b IS NOT NULL),
 proofs AS MATERIALIZED (SELECT * FROM diagnostic_continuity_proofs WHERE "predecessorOrderId" IN (SELECT id FROM walk) OR "candidateOrderId" IN (SELECT id FROM walk)),
 listings0(id) AS (
  SELECT "listingId" FROM inspection_orders WHERE id IN (SELECT id FROM walk)
  UNION SELECT "listingId" FROM diagnostic_ownership_grants WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "sourceListingId" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT bindings->'predecessor'->'listingBinding'->>'id' FROM proofs
  UNION SELECT bindings->'candidate'->'listingBinding'->>'id' FROM proofs
  UNION SELECT id FROM listings WHERE subject_id IS NOT NULL AND "sellerId"=subject_id AND "businessId" IS NULL
 ),
 users0(id) AS (
  SELECT subject_id
  UNION SELECT "sellerId" FROM diagnostic_ownership_grants WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "commissionerId" FROM diagnostic_ownership_grants WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "grantorId" FROM diagnostic_ownership_grants WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "commissionerId" FROM inspection_orders WHERE id IN (SELECT id FROM walk)
  UNION SELECT "sellerId" FROM listings WHERE id IN (SELECT id FROM listings0)
  UNION SELECT "sellerId" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "commissionerId" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "declaredById" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "recordedById" FROM diagnostic_identity_records WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "userId" FROM diagnostic_order_assignments WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT state->>'authorId' FROM diagnostic_reports WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT state->>'reviewerId' FROM diagnostic_reports WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "issuerId" FROM proofs UNION SELECT "linkingTechnicianId" FROM proofs
  UNION SELECT bindings->'predecessor'->>'commissionerId' FROM proofs
  UNION SELECT bindings->'candidate'->>'commissionerId' FROM proofs
  UNION SELECT bindings->'predecessor'->'listingBinding'->>'sellerId' FROM proofs
  UNION SELECT bindings->'candidate'->'listingBinding'->>'sellerId' FROM proofs
 ),
 businesses(id) AS (
  SELECT "businessId" FROM diagnostic_ownership_grants WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "businessId" FROM listings WHERE id IN (SELECT id FROM listings0)
  UNION SELECT "businessId" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "dealershipId" FROM dealership_members WHERE "userId" IN (SELECT id FROM users0)
  UNION SELECT bindings->'predecessor'->'listingBinding'->>'businessId' FROM proofs
  UNION SELECT bindings->'candidate'->'listingBinding'->>'businessId' FROM proofs
 )
 SELECT jsonb_build_object(
  'g',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM selected_grants),'[]'::jsonb),
  'c',COALESCE((SELECT jsonb_agg("identityRecordId" ORDER BY "identityRecordId") FROM selected),'[]'::jsonb),
  'u',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM users0 WHERE id IS NOT NULL),'[]'::jsonb),
  'b',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM businesses WHERE id IS NOT NULL),'[]'::jsonb),
  'l',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM listings0 WHERE id IS NOT NULL),'[]'::jsonb),
  'o',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM walk),'[]'::jsonb),
  'r',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM diagnostic_reports WHERE "orderId" IN (SELECT id FROM walk)),'[]'::jsonb),
  'p',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM proofs),'[]'::jsonb)
 )
$$;

CREATE FUNCTION diagnostic_lock_ownership_disposal(subject_id text, cutoff timestamp, grant_id text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE targets jsonb; refreshed jsonb;
BEGIN
 targets:=diagnostic_ownership_disposal_scope(subject_id,cutoff,grant_id);
 PERFORM id FROM users WHERE id IN (SELECT jsonb_array_elements_text(targets->'u')) ORDER BY id FOR UPDATE;
 PERFORM id FROM dealerships WHERE id IN (SELECT jsonb_array_elements_text(targets->'b')) ORDER BY id FOR UPDATE;
 PERFORM id FROM listings WHERE id IN (SELECT jsonb_array_elements_text(targets->'l')) ORDER BY id FOR UPDATE;
 PERFORM id FROM inspection_orders WHERE id IN (SELECT jsonb_array_elements_text(targets->'o')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_reports WHERE id IN (SELECT jsonb_array_elements_text(targets->'r')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_order_assignments WHERE "orderId" IN (SELECT jsonb_array_elements_text(targets->'o')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_continuity_proofs WHERE id IN (SELECT jsonb_array_elements_text(targets->'p')) ORDER BY id FOR UPDATE;
 refreshed:=diagnostic_ownership_disposal_scope(subject_id,cutoff,grant_id);
 IF (refreshed-'c') IS DISTINCT FROM (targets-'c') OR NOT ((refreshed->'c') @> (targets->'c')) THEN
  RAISE EXCEPTION 'diagnostic_ownership_disposal_targets_changed';
 END IF;
 RETURN refreshed;
END $$;
CREATE FUNCTION diagnostic_dispose_ownership_scope(subject_id text, cutoff timestamp, grant_id text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE targets jsonb; refreshed jsonb; count_erased integer;
BEGIN
 targets:=diagnostic_lock_ownership_disposal(subject_id,cutoff,grant_id);
 -- Payload erasure includes consumed proofs. B keeps its independent report-level
 -- opaque proof id/order-version retry binding, observations and release unchanged.
 DELETE FROM diagnostic_continuity_proofs WHERE "predecessorOrderId" IN
  (SELECT "orderId" FROM diagnostic_ownership_components WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(targets->'c')))
  OR "candidateOrderId" IN
  (SELECT "orderId" FROM diagnostic_ownership_components WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(targets->'c')))
  OR (subject_id IS NOT NULL AND ("issuerId"=subject_id OR "linkingTechnicianId"=subject_id
   OR bindings->'predecessor'->>'commissionerId'=subject_id OR bindings->'candidate'->>'commissionerId'=subject_id
   OR bindings->'predecessor'->'listingBinding'->>'sellerId'=subject_id OR bindings->'candidate'->'listingBinding'->>'sellerId'=subject_id));
 UPDATE diagnostic_ownership_components SET state='erased',"grantId"=NULL,scope=NULL,"sourceListingId"=NULL,"identityDigest"=NULL,
  "sellerId"=NULL,"commissionerId"=NULL,"businessId"=NULL,"membershipId"=NULL,rights=NULL,"rightsUntil"=NULL,
  "declaredById"=NULL,"declaredAt"=NULL,"erasedAt"=cutoff
 WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(targets->'c')) AND state='available';
 GET DIAGNOSTICS count_erased=ROW_COUNT;
 IF subject_id IS NOT NULL THEN UPDATE diagnostic_ownership_components SET "declaredById"=NULL WHERE "declaredById"=subject_id; END IF;
 UPDATE diagnostic_ownership_grants SET state='erased',"listingId"=NULL,"identityDigest"=NULL,"sellerId"=NULL,"commissionerId"=NULL,
  "businessId"=NULL,"membershipId"=NULL,"grantorId"=NULL,"grantorMembershipId"=NULL,"sessionId"=NULL,rights=NULL,"rightsUntil"=NULL,"declaredAt"=NULL,"erasedAt"=cutoff
 WHERE id IN (SELECT jsonb_array_elements_text(targets->'g')) AND state='available';
 RETURN count_erased;
END $$;
-- Existing worker expiry and account purge entry points now include grants, even before capture.
CREATE OR REPLACE FUNCTION diagnostic_ownership_disposal_targets(subject_id text, cutoff timestamp) RETURNS jsonb LANGUAGE sql VOLATILE AS $$
 SELECT diagnostic_ownership_disposal_scope(subject_id,cutoff,NULL)
$$;
CREATE OR REPLACE FUNCTION diagnostic_dispose_ownership(subject_id text, cutoff timestamp) RETURNS integer LANGUAGE sql VOLATILE AS $$
 SELECT diagnostic_dispose_ownership_scope(subject_id,cutoff,NULL)
$$;
