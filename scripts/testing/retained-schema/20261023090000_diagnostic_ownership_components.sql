-- Forward only. No historical backfill, new retention period, hold or ownership witness.
-- Rollback closes collection and leaves these classified components subject to disposal.
-- A nullable server-only receipt leaves every historical raw untouched. xmin
-- alone is insufficient: a later allowed no-op UPDATE changes xmin and could
-- otherwise impersonate a fresh INSERT. No Listing/order history is written.
ALTER TABLE diagnostic_identity_records ADD COLUMN "ownershipCaptureTransaction" text;
CREATE FUNCTION diagnostic_ownership_raw_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW."ownershipCaptureTransaction":=pg_current_xact_id()::text;
 ELSIF NEW."ownershipCaptureTransaction" IS DISTINCT FROM OLD."ownershipCaptureTransaction" THEN
  RAISE EXCEPTION 'diagnostic_ownership_raw_transaction_immutable';
 END IF;
 IF NEW."erasedAt" IS NOT NULL THEN NEW."ownershipCaptureTransaction":=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_ownership_raw_transaction BEFORE INSERT OR UPDATE ON diagnostic_identity_records
 FOR EACH ROW EXECUTE FUNCTION diagnostic_ownership_raw_transaction();

CREATE TABLE diagnostic_ownership_components (
 "identityRecordId" text PRIMARY KEY REFERENCES diagnostic_identity_records(id) ON DELETE CASCADE,
 "orderId" text NOT NULL, "orderVersion" integer NOT NULL,
 state text NOT NULL CHECK (state IN ('available','unavailable','erased')),
 scope text, "sourceListingId" text, "identityDigest" text, "sellerId" text, "commissionerId" text,
 "businessId" text, "membershipId" text, rights jsonb, "rightsUntil" timestamp(3),
 "declaredById" text, "declaredAt" timestamp(3), "erasedAt" timestamp(3),
 CONSTRAINT diagnostic_ownership_shape CHECK ((
  CASE WHEN state='available' THEN
   scope='diagnostic_ownership_continuity' AND "sourceListingId" IS NOT NULL AND "identityDigest" ~ '^[a-f0-9]{64}$'
   AND "sellerId" IS NOT NULL AND "commissionerId" IS NOT NULL AND rights IS NOT NULL
   AND "rightsUntil" IS NOT NULL AND "declaredAt" IS NOT NULL AND "rightsUntil">"declaredAt" AND "erasedAt" IS NULL
   AND (("businessId" IS NULL AND "membershipId" IS NULL) OR ("businessId" IS NOT NULL AND "membershipId" IS NOT NULL))
  ELSE scope IS NULL AND "sourceListingId" IS NULL AND "identityDigest" IS NULL AND "sellerId" IS NULL
   AND "commissionerId" IS NULL AND "businessId" IS NULL AND "membershipId" IS NULL AND rights IS NULL
   AND "rightsUntil" IS NULL AND "declaredById" IS NULL AND "declaredAt" IS NULL
   AND ((state='erased' AND "erasedAt" IS NOT NULL) OR (state='unavailable' AND "erasedAt" IS NULL)) END
 ) IS TRUE),
 UNIQUE ("orderId","orderVersion")
);
CREATE INDEX diagnostic_ownership_components_sellerId_idx ON diagnostic_ownership_components("sellerId");
CREATE INDEX diagnostic_ownership_components_commissionerId_idx ON diagnostic_ownership_components("commissionerId");
CREATE INDEX diagnostic_ownership_components_declaredById_idx ON diagnostic_ownership_components("declaredById");
CREATE INDEX diagnostic_ownership_components_rightsUntil_state_idx ON diagnostic_ownership_components("rightsUntil",state);

-- Strict rights vocabulary. NULL/UNKNOWN, extra fields and malformed timestamps refuse.
CREATE FUNCTION diagnostic_ownership_rights_valid(r jsonb, until_at timestamp) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; limits integer[]:=ARRAY[300,500,1000,1000]; n integer:=0;
BEGIN
 IF (jsonb_typeof(r)='object' AND r ?& ARRAY['category','purpose','basis','provenance','identifiability','use','schedule','supplierRestrictions','hold']
  AND (r-ARRAY['category','purpose','basis','provenance','identifiability','use','schedule','supplierRestrictions','hold'])='{}'::jsonb
  AND r->>'category'='vehicle_observation' AND r->>'identifiability' IN ('personal','pseudonymous')
  AND r->'use'='["service"]'::jsonb AND r->'hold'='null'::jsonb
  AND jsonb_typeof(r->'schedule')='object' AND (r->'schedule') ?& ARRAY['kind','until','reason']
  AND ((r->'schedule')-ARRAY['kind','until','reason'])='{}'::jsonb AND r->'schedule'->>'kind'='until'
  AND jsonb_typeof(r->'schedule'->'until')='string' AND r->'schedule'->>'until' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' AND (r->'schedule'->>'until')::timestamptz=until_at AT TIME ZONE 'UTC'
  AND jsonb_typeof(r->'schedule'->'reason')='string' AND length(btrim(r->'schedule'->>'reason')) BETWEEN 1 AND 500) IS NOT TRUE THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['purpose','basis','provenance','supplierRestrictions'] LOOP
  n:=n+1;
  IF (jsonb_typeof(r->k)='string' AND length(btrim(r->>k)) BETWEEN CASE WHEN k='supplierRestrictions' THEN 0 ELSE 1 END AND limits[n]) IS NOT TRUE THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- This guard writes only its own component, never an order. The raw must have
-- been inserted in this very transaction; an earlier observation cannot be classified later.
CREATE FUNCTION diagnostic_ownership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE raw diagnostic_identity_records; o inspection_orders; l listings; m dealership_members; expected text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM diagnostic_identity_records WHERE id=OLD."identityRecordId") THEN RAISE EXCEPTION 'diagnostic_ownership_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."identityRecordId",NEW."orderId",NEW."orderVersion") IS DISTINCT FROM ROW(OLD."identityRecordId",OLD."orderId",OLD."orderVersion")
   OR (NEW."declaredById" IS NOT NULL AND NEW."declaredById" IS DISTINCT FROM OLD."declaredById")
   OR (OLD.state IN ('unavailable','erased') AND NEW IS DISTINCT FROM OLD)
   OR (OLD.state='available' AND NEW.state NOT IN ('available','erased'))
   OR (NEW.state='available' AND (to_jsonb(NEW)-'declaredById') IS DISTINCT FROM (to_jsonb(OLD)-'declaredById'))
  THEN RAISE EXCEPTION 'diagnostic_ownership_immutable'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO raw FROM diagnostic_identity_records WHERE id=NEW."identityRecordId" AND "ownershipCaptureTransaction"=pg_current_xact_id()::text;
 SELECT * INTO o FROM inspection_orders WHERE id=NEW."orderId";
 IF (raw.id IS NOT NULL AND raw."orderId"=NEW."orderId" AND raw."orderVersion"=NEW."orderVersion"
   AND raw."erasedAt" IS NULL AND o.id IS NOT NULL AND o.version=NEW."orderVersion" AND o."erasedAt" IS NULL
   AND o."observedVehicle"=raw.observation) IS NOT TRUE OR NEW.state='erased' THEN RAISE EXCEPTION 'diagnostic_ownership_binding'; END IF;
 IF NEW.state='unavailable' THEN RETURN NEW; END IF;
 SELECT * INTO l FROM listings WHERE id=o."listingId";
 IF l."businessId" IS NOT NULL THEN SELECT * INTO m FROM dealership_members WHERE "userId"=o."commissionerId"; END IF;
 -- PostgreSQL sha256(bytea) avoids introducing a new extension. Assemble exactly
 -- the existing JSON.stringify array, preserving spaces inside source values.
 expected:=encode(sha256(convert_to('['||to_json(l.id)::text||','||to_json(l."sellerId")::text||','||COALESCE(to_json(l."businessId")::text,'null')||','||COALESCE(to_json(upper(btrim(l.vin)))::text,'null')||','||to_json(l."brandId")::text||','||to_json(l."modelId")::text||','||COALESCE(to_json(l.year)::text,'null')||']','UTF8')),'hex');
 IF (o.audience='listing_public' AND l.id IS NOT NULL AND l."deletedAt" IS NULL
   AND NEW.scope='diagnostic_ownership_continuity' AND NEW."sourceListingId"=l.id AND NEW."identityDigest"=expected
   AND NEW."sellerId"=l."sellerId" AND NEW."commissionerId"=o."commissionerId"
   AND EXISTS (SELECT 1 FROM users u WHERE u.id=l."sellerId" AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
   AND EXISTS (SELECT 1 FROM users u WHERE u.id=o."commissionerId" AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
   AND NEW."businessId" IS NOT DISTINCT FROM l."businessId"
   AND ((l."businessId" IS NULL AND NEW."membershipId" IS NULL) OR
    (l."businessId" IS NOT NULL AND m.id IS NOT NULL AND m."dealershipId"=l."businessId" AND m.status='active' AND NEW."membershipId"=m.id))
   AND NEW."declaredById"=raw."recordedById" AND NEW."declaredAt"=raw."recordedAt"
   AND NEW."rightsUntil">clock_timestamp() AT TIME ZONE 'UTC' AND diagnostic_ownership_rights_valid(NEW.rights,NEW."rightsUntil")
   AND NOT EXISTS (SELECT 1 FROM diagnostic_identity_records earlier LEFT JOIN diagnostic_ownership_components c ON c."identityRecordId"=earlier.id
    WHERE earlier."orderId"=o.id AND earlier."orderVersion"<raw."orderVersion" AND
     (c.state IS DISTINCT FROM 'available' OR c."rightsUntil" IS NULL OR c."rightsUntil"<=clock_timestamp() AT TIME ZONE 'UTC'))) IS NOT TRUE
 THEN RAISE EXCEPTION 'diagnostic_ownership_source'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_ownership_guard BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_ownership_components
 FOR EACH ROW EXECUTE FUNCTION diagnostic_ownership_guard();

-- Discovery chooses a lock set only, never authority. Include existing commissioner,
-- staff and direct-reader erasure plus both endpoints of every affected proof/report edge.
-- The complete connected set avoids acquiring a new predecessor/successor behind an order.
CREATE FUNCTION diagnostic_ownership_disposal_targets(subject_id text, cutoff timestamp) RETURNS jsonb LANGUAGE sql VOLATILE AS $$
 WITH RECURSIVE
 selected AS MATERIALIZED (
  SELECT c."identityRecordId",c."orderId" FROM diagnostic_ownership_components c WHERE c.state='available'
   AND ((subject_id IS NOT NULL AND (c."sellerId"=subject_id OR c."commissionerId"=subject_id))
    OR (subject_id IS NULL AND c."rightsUntil"<=cutoff)) ORDER BY c."identityRecordId"
   LIMIT CASE WHEN subject_id IS NULL THEN 100 ELSE 2147483647 END
 ),
 subject_proofs AS MATERIALIZED (SELECT * FROM diagnostic_continuity_proofs WHERE subject_id IS NOT NULL AND ("issuerId"=subject_id OR "linkingTechnicianId"=subject_id
   OR bindings->'predecessor'->>'commissionerId'=subject_id OR bindings->'candidate'->>'commissionerId'=subject_id
   OR bindings->'predecessor'->'listingBinding'->>'sellerId'=subject_id OR bindings->'candidate'->'listingBinding'->>'sellerId'=subject_id)),
 edges0 AS (
  SELECT "predecessorOrderId" a,"candidateOrderId" b FROM diagnostic_continuity_proofs
  UNION SELECT a."orderId",b."orderId" FROM diagnostic_reports a JOIN diagnostic_reports b ON b."predecessorId"=a.id
 ), edges AS (SELECT a,b FROM edges0 UNION SELECT b,a FROM edges0),
 seeds AS (
  SELECT "orderId" id FROM selected
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
  UNION SELECT "sourceListingId" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT bindings->'predecessor'->'listingBinding'->>'id' FROM proofs
  UNION SELECT bindings->'candidate'->'listingBinding'->>'id' FROM proofs
  UNION SELECT id FROM listings WHERE subject_id IS NOT NULL AND "sellerId"=subject_id AND "businessId" IS NULL
 ),
 users0(id) AS (
  SELECT subject_id UNION SELECT "commissionerId" FROM inspection_orders WHERE id IN (SELECT id FROM walk)
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
  SELECT "businessId" FROM listings WHERE id IN (SELECT id FROM listings0)
  UNION SELECT "businessId" FROM diagnostic_ownership_components WHERE "orderId" IN (SELECT id FROM walk)
  UNION SELECT "dealershipId" FROM dealership_members WHERE "userId" IN (SELECT id FROM users0)
  UNION SELECT bindings->'predecessor'->'listingBinding'->>'businessId' FROM proofs
  UNION SELECT bindings->'candidate'->'listingBinding'->>'businessId' FROM proofs
 )
 SELECT jsonb_build_object(
  'c',COALESCE((SELECT jsonb_agg("identityRecordId" ORDER BY "identityRecordId") FROM selected),'[]'::jsonb),
  'u',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM users0 WHERE id IS NOT NULL),'[]'::jsonb),
  'b',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM businesses WHERE id IS NOT NULL),'[]'::jsonb),
  'l',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM listings0 WHERE id IS NOT NULL),'[]'::jsonb),
  'o',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM walk),'[]'::jsonb),
  'r',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM diagnostic_reports WHERE "orderId" IN (SELECT id FROM walk)),'[]'::jsonb),
  'p',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM proofs),'[]'::jsonb)
 )
$$;

-- Explicit worker operation, not a source-writing trigger. Purge calls it before
-- even its original deleting-User lock; expiry uses the same prefix and revalidation.
-- Subject indexes remain searchable until the last component-only redaction.
CREATE FUNCTION diagnostic_dispose_ownership(subject_id text, cutoff timestamp) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE targets jsonb; count_erased integer;
BEGIN
 targets:=diagnostic_ownership_disposal_targets(subject_id,cutoff);
 PERFORM id FROM users WHERE id IN (SELECT jsonb_array_elements_text(targets->'u')) ORDER BY id FOR UPDATE;
 PERFORM id FROM dealerships WHERE id IN (SELECT jsonb_array_elements_text(targets->'b')) ORDER BY id FOR UPDATE;
 PERFORM id FROM listings WHERE id IN (SELECT jsonb_array_elements_text(targets->'l')) ORDER BY id FOR UPDATE;
 PERFORM id FROM inspection_orders WHERE id IN (SELECT jsonb_array_elements_text(targets->'o')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_reports WHERE id IN (SELECT jsonb_array_elements_text(targets->'r')) ORDER BY id FOR UPDATE;
 PERFORM id FROM diagnostic_continuity_proofs WHERE id IN (SELECT jsonb_array_elements_text(targets->'p')) ORDER BY id FOR UPDATE;
 IF diagnostic_ownership_disposal_targets(subject_id,cutoff) IS DISTINCT FROM targets THEN RAISE EXCEPTION 'diagnostic_ownership_disposal_targets_changed'; END IF;
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

-- Restricted synchronous component projection. Every consumer must use its own
-- current authority plus this rights fence; no proof consumes the component yet.
CREATE FUNCTION diagnostic_live_ownership_component(raw_id text, at_time timestamp)
 RETURNS SETOF diagnostic_ownership_components LANGUAGE sql STABLE AS $$
 SELECT c.* FROM diagnostic_ownership_components c JOIN diagnostic_identity_records r ON r.id=c."identityRecordId"
 JOIN inspection_orders o ON o.id=r."orderId" WHERE c."identityRecordId"=raw_id AND c.state='available'
 AND c."rightsUntil">at_time AND c."erasedAt" IS NULL AND r."erasedAt" IS NULL AND o."erasedAt" IS NULL
$$;
