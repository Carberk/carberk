-- Forward-only. No historical backfill or snapshot rewrite. Rollback disables
-- comparison and leaves pins in place; removal requires a reviewed forward change.
ALTER TABLE diagnostic_reports ADD COLUMN "identityRecordId" TEXT,
 ADD COLUMN "identityRecordHash" TEXT;
ALTER TABLE diagnostic_reports ADD CONSTRAINT diagnostic_report_identity_pin_pair CHECK (
 ("identityRecordId" IS NULL AND "identityRecordHash" IS NULL) OR
 ("identityRecordId" IS NOT NULL AND "identityRecordHash" IS NOT NULL AND "identityRecordHash" ~ '^[a-f0-9]{64}$'));
ALTER TABLE diagnostic_reports ADD CONSTRAINT "diagnostic_reports_identityRecordId_fkey"
 FOREIGN KEY ("identityRecordId") REFERENCES diagnostic_identity_records(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- This guard supplements the existing report/snapshot guard. Later intake
-- observations never repin a report, including a legacy report with no pin.
CREATE FUNCTION diagnostic_report_identity_pin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_id TEXT; selected_hash TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."identityRecordId",NEW."identityRecordHash") IS DISTINCT FROM ROW(OLD."identityRecordId",OLD."identityRecordHash")
   AND NOT (OLD."erasedAt" IS NULL AND NEW."erasedAt" IS NOT NULL AND NEW."identityRecordId" IS NULL AND NEW."identityRecordHash" IS NULL)
  THEN RAISE EXCEPTION 'diagnostic_report_identity_pin_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."erasedAt" IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_report_identity_pin_binding'; END IF;
 IF NEW."predecessorId" IS NOT NULL AND NOT NEW.reinspection THEN
  SELECT p."identityRecordId",p."identityRecordHash" INTO selected_id,selected_hash
   FROM diagnostic_reports p WHERE p.id=NEW."predecessorId" AND p."orderId"=NEW."orderId";
 ELSE
  SELECT i.id,i."observationHash" INTO selected_id,selected_hash FROM diagnostic_identity_records i
   WHERE i."orderId"=NEW."orderId" AND i."erasedAt" IS NULL ORDER BY i."orderVersion" DESC LIMIT 1;
 END IF;
 IF ROW(NEW."identityRecordId",NEW."identityRecordHash") IS DISTINCT FROM ROW(selected_id,selected_hash)
 THEN RAISE EXCEPTION 'diagnostic_report_identity_pin_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_report_identity_pin BEFORE INSERT OR UPDATE ON diagnostic_reports
 FOR EACH ROW EXECUTE FUNCTION diagnostic_report_identity_pin();
