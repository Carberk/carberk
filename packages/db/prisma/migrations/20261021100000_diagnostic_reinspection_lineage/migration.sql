-- Forward-only. Rollback disables the reinspection route; never null predecessor
-- links, reclassify rows or rewrite released snapshots and artifacts.
-- Existing originals and same-order corrections remain reinspection=false.
ALTER TABLE diagnostic_reports ADD COLUMN reinspection BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE diagnostic_reports ADD CONSTRAINT diagnostic_reinspection_predecessor CHECK (NOT reinspection OR "predecessorId" IS NOT NULL);

-- Cross-order continuity is checked on INSERT only. Account erasure clears
-- mutable order fields after fencing reports, so UPDATE must not recheck the
-- predecessor relationship of a surviving reinspection. The admitted continuity
-- is the temporary equal-VIN, same-Listing, same-commissioner public case;
-- manual/changed identity and commissioner transfer remain unadmitted.
CREATE OR REPLACE FUNCTION diagnostic_report_pinned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o."templateVersionId"=NEW."templateVersionId" AND o.audience=NEW.audience AND o."erasedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_report_pinned'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."orderId",NEW."templateVersionId",NEW.audience,NEW."predecessorId",NEW.reinspection) IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."templateVersionId",OLD.audience,OLD."predecessorId",OLD.reinspection) THEN RAISE EXCEPTION 'diagnostic_report_identity_immutable'; END IF;
  IF OLD.snapshot IS NOT NULL AND ROW(NEW.snapshot,NEW."snapshotHash",NEW."finalizedAt",NEW.state->'findings',NEW.state->'observedAt',NEW.state->'mileageKm') IS DISTINCT FROM ROW(OLD.snapshot,OLD."snapshotHash",OLD."finalizedAt",OLD.state->'findings',OLD.state->'observedAt',OLD.state->'mileageKm') THEN RAISE EXCEPTION 'diagnostic_snapshot_immutable'; END IF;
  IF OLD.status IN ('finalized','withdrawn') AND NEW.status NOT IN ('finalized','withdrawn') THEN RAISE EXCEPTION 'diagnostic_snapshot_immutable'; END IF;
 END IF;
 IF NEW.reinspection THEN
  IF TG_OP='INSERT' AND NOT EXISTS (
   SELECT 1 FROM diagnostic_reports p
   JOIN inspection_orders po ON po.id=p."orderId"
   JOIN inspection_orders o ON o.id=NEW."orderId"
   WHERE p.id=NEW."predecessorId" AND p."orderId"<>NEW."orderId" AND p.audience=NEW.audience AND p.snapshot IS NOT NULL AND p."erasedAt" IS NULL
    AND po."erasedAt" IS NULL AND po.audience='listing_public' AND o.audience='listing_public'
    AND o."listingId" IS NOT NULL AND o."listingId"=po."listingId"
    AND o."commissionerId" IS NOT NULL AND o."commissionerId"=po."commissionerId"
    AND o."publicationAuthorization" IS NOT NULL AND o."associationValidatedAt" IS NOT NULL
    AND o."observedVehicle"->>'method'='vin' AND po."observedVehicle"->>'method'='vin'
    AND upper(btrim(o."observedVehicle"->>'vin'))=upper(btrim(po."observedVehicle"->>'vin'))
  ) THEN RAISE EXCEPTION 'diagnostic_reinspection_continuity'; END IF;
 ELSIF NEW."predecessorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_reports p WHERE p.id=NEW."predecessorId" AND p."orderId"=NEW."orderId" AND p.audience=NEW.audience AND p.snapshot IS NOT NULL) THEN RAISE EXCEPTION 'diagnostic_correction_audience';
 END IF;
 RETURN NEW;
END $$;

-- An order's first report is either an original or a reinspection; later
-- same-order corrections stay outside this index.
DROP INDEX diagnostic_report_original_order;
CREATE UNIQUE INDEX diagnostic_report_first_order ON diagnostic_reports("orderId") WHERE "predecessorId" IS NULL OR reinspection;
