-- Forward-only. No backfill: earlier visits keep no structured evidence and earlier
-- reports keep no evidence pin. Rollback disables the routes and leaves rows in place.
-- AlterTable
ALTER TABLE "inspection_orders" ADD COLUMN     "identityEvidenceGeneration" INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE "diagnostic_reports" ADD COLUMN     "identityEvidenceHash" TEXT,
ADD COLUMN     "identityEvidenceId" TEXT;
-- CreateTable
CREATE TABLE "diagnostic_identity_provenance" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "declaredSizeBytes" INTEGER NOT NULL,
    "rights" JSONB,
    "rightsUntil" TIMESTAMP(3) NOT NULL,
    "objectKey" TEXT,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "mime" TEXT,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "epoch" TEXT NOT NULL,
    "writeLeaseUntil" TIMESTAMP(3),
    "cleanupLeaseUntil" TIMESTAMP(3),
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "cleanupFailureCode" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "cleanupRequestedAt" TIMESTAMP(3),
    "cleanupCompletedAt" TIMESTAMP(3),
    "erasedAt" TIMESTAMP(3),
    CONSTRAINT "diagnostic_identity_provenance_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "diagnostic_identity_evidence" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderVersion" INTEGER NOT NULL,
    "identityRecordId" TEXT NOT NULL,
    "observationHash" TEXT,
    "identifiers" JSONB,
    "provenance" JSONB,
    "rights" JSONB,
    "rightsUntil" TIMESTAMP(3) NOT NULL,
    "supersedesId" TEXT,
    "explanation" TEXT,
    "recordHash" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "erasedAt" TIMESTAMP(3),
    CONSTRAINT "diagnostic_identity_evidence_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_identity_provenance_objectKey_key" ON "diagnostic_identity_provenance"("objectKey");
-- CreateIndex
CREATE INDEX "diagnostic_identity_provenance_orderId_state_idx" ON "diagnostic_identity_provenance"("orderId", "state");
-- CreateIndex
CREATE INDEX "diagnostic_identity_provenance_createdById_idx" ON "diagnostic_identity_provenance"("createdById");
-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_identity_evidence_supersedesId_key" ON "diagnostic_identity_evidence"("supersedesId");
-- CreateIndex
CREATE INDEX "diagnostic_identity_evidence_identityRecordId_idx" ON "diagnostic_identity_evidence"("identityRecordId");
-- CreateIndex
CREATE INDEX "diagnostic_identity_evidence_recordedById_idx" ON "diagnostic_identity_evidence"("recordedById");
-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_identity_evidence_orderId_orderVersion_key" ON "diagnostic_identity_evidence"("orderId", "orderVersion");
-- AddForeignKey
ALTER TABLE "diagnostic_identity_provenance" ADD CONSTRAINT "diagnostic_identity_provenance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inspection_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "diagnostic_identity_provenance" ADD CONSTRAINT "diagnostic_identity_provenance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "diagnostic_identity_evidence" ADD CONSTRAINT "diagnostic_identity_evidence_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inspection_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "diagnostic_identity_evidence" ADD CONSTRAINT "diagnostic_identity_evidence_identityRecordId_fkey" FOREIGN KEY ("identityRecordId") REFERENCES "diagnostic_identity_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "diagnostic_identity_evidence" ADD CONSTRAINT "diagnostic_identity_evidence_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "diagnostic_identity_evidence"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
-- AddForeignKey
ALTER TABLE "diagnostic_identity_evidence" ADD CONSTRAINT "diagnostic_identity_evidence_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_identityEvidenceId_fkey" FOREIGN KEY ("identityEvidenceId") REFERENCES "diagnostic_identity_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE inspection_orders ADD CONSTRAINT inspection_order_identity_evidence_generation CHECK ("identityEvidenceGeneration" >= 0);
ALTER TABLE diagnostic_identity_provenance ADD CONSTRAINT diagnostic_identity_provenance_content CHECK (
 "contentType" IN ('image/jpeg','image/png','image/webp') AND "declaredSizeBytes" BETWEEN 1 AND 10485760
 AND state IN ('staged','verified','cleanup_pending','removed')
 AND (("erasedAt" IS NULL AND rights IS NOT NULL) OR ("erasedAt" IS NOT NULL AND rights IS NULL))
 AND (("objectKey" IS NULL AND sha256 IS NULL AND "sizeBytes" IS NULL AND mime IS NULL) OR
  ("objectKey" IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$' AND "objectKey"='diagnostic-evidence/' || id || '/' || sha256 AND "sizeBytes" > 0 AND mime='image/webp'))
 AND (state <> 'verified' OR ("objectKey" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "cleanupRequestedAt" IS NULL AND "erasedAt" IS NULL)));
-- Restricted content exists until erasure or declared rights expiry, then never again.
ALTER TABLE diagnostic_identity_evidence ADD CONSTRAINT diagnostic_identity_evidence_content CHECK (
 ("erasedAt" IS NULL AND "observationHash" IS NOT NULL AND "observationHash" ~ '^[a-f0-9]{64}$' AND "recordHash" IS NOT NULL AND "recordHash" ~ '^[a-f0-9]{64}$'
  AND identifiers IS NOT NULL AND provenance IS NOT NULL AND rights IS NOT NULL)
 OR ("erasedAt" IS NOT NULL AND "observationHash" IS NULL AND "recordHash" IS NULL AND identifiers IS NULL AND provenance IS NULL AND rights IS NULL AND explanation IS NULL));
-- A raw observation has at most one structured root; later changes need an explicit correction edge.
CREATE UNIQUE INDEX diagnostic_identity_evidence_root ON diagnostic_identity_evidence("identityRecordId") WHERE "supersedesId" IS NULL;
ALTER TABLE diagnostic_reports ADD CONSTRAINT diagnostic_report_evidence_pin_pair CHECK (
 ("identityEvidenceId" IS NULL AND "identityEvidenceHash" IS NULL) OR
 ("identityEvidenceId" IS NOT NULL AND "identityEvidenceHash" IS NOT NULL AND "identityEvidenceHash" ~ '^[a-f0-9]{64}$'));

-- Report evidence and identity provenance share diagnostic-evidence/<id>/<sha256>
-- keys and exact cleanup; one id belongs to at most one owner.
CREATE FUNCTION diagnostic_object_owner_disjoint() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('diagnostic-object-owner:' || NEW.id));
 IF (TG_TABLE_NAME='diagnostic_evidence' AND EXISTS (SELECT 1 FROM diagnostic_identity_provenance p WHERE p.id=NEW.id))
  OR (TG_TABLE_NAME='diagnostic_identity_provenance' AND EXISTS (SELECT 1 FROM diagnostic_evidence e WHERE e.id=NEW.id))
 THEN RAISE EXCEPTION 'diagnostic_object_owner_disjoint'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_evidence_owner_disjoint BEFORE INSERT ON diagnostic_evidence
 FOR EACH ROW EXECUTE FUNCTION diagnostic_object_owner_disjoint();
CREATE TRIGGER diagnostic_identity_provenance_owner_disjoint BEFORE INSERT ON diagnostic_identity_provenance
 FOR EACH ROW EXECUTE FUNCTION diagnostic_object_owner_disjoint();

-- The classified intent and a bound object descriptor never change. Erasure or
-- expiry clears only the classification; account deletion detaches the creator.
CREATE FUNCTION diagnostic_identity_provenance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_identity_provenance_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'staged' OR NEW."objectKey" IS NOT NULL OR NEW."erasedAt" IS NOT NULL OR NEW."cleanupRequestedAt" IS NOT NULL OR NEW."createdById" IS NULL
   OR NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o."erasedAt" IS NULL AND o.synthetic)
  THEN RAISE EXCEPTION 'diagnostic_identity_provenance_binding'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW."orderId",NEW."contentType",NEW."declaredSizeBytes",NEW."rightsUntil",NEW."createdAt")
   IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."contentType",OLD."declaredSizeBytes",OLD."rightsUntil",OLD."createdAt")
  OR (OLD."objectKey" IS NOT NULL AND ROW(NEW."objectKey",NEW.sha256,NEW."sizeBytes",NEW.mime) IS DISTINCT FROM ROW(OLD."objectKey",OLD.sha256,OLD."sizeBytes",OLD.mime))
  OR (OLD."objectKey" IS NULL AND NEW."objectKey" IS NOT NULL AND (OLD.state<>'staged' OR OLD."cleanupRequestedAt" IS NOT NULL))
  OR (NEW."erasedAt" IS NULL AND NEW.rights IS DISTINCT FROM OLD.rights)
  OR (OLD."erasedAt" IS NOT NULL AND NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt")
  OR (NEW."createdById" IS NOT NULL AND NEW."createdById" IS DISTINCT FROM OLD."createdById")
  OR (OLD."cleanupRequestedAt" IS NOT NULL AND NEW."cleanupRequestedAt" IS DISTINCT FROM OLD."cleanupRequestedAt")
  OR (OLD.state IN ('cleanup_pending','removed') AND NEW.state IN ('staged','verified'))
 THEN RAISE EXCEPTION 'diagnostic_identity_provenance_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_identity_provenance_guard BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_identity_provenance
 FOR EACH ROW EXECUTE FUNCTION diagnostic_identity_provenance_guard();

-- INSERT binds the record to its order's resulting version, an unerased raw
-- observation of the same order, a same-order earlier parent and exact verified
-- same-order provenance copies. Committed content is never rewritten.
CREATE FUNCTION diagnostic_identity_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item JSONB;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_identity_evidence_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."erasedAt" IS NOT NULL OR NEW."recordedById" IS NULL OR jsonb_typeof(NEW.provenance)<>'array' OR jsonb_array_length(NEW.provenance)=0
   OR jsonb_typeof(NEW.identifiers)<>'array' OR jsonb_array_length(NEW.identifiers)=0 OR (NEW."supersedesId" IS NULL) <> (NEW.explanation IS NULL)
   OR NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o.version=NEW."orderVersion" AND o."erasedAt" IS NULL AND o.synthetic)
   OR NOT EXISTS (SELECT 1 FROM diagnostic_identity_records i WHERE i.id=NEW."identityRecordId" AND i."orderId"=NEW."orderId"
    AND i."erasedAt" IS NULL AND i."observationHash"=NEW."observationHash")
   OR (NEW."supersedesId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_identity_evidence p WHERE p.id=NEW."supersedesId"
    AND p."orderId"=NEW."orderId" AND p."erasedAt" IS NULL AND p."orderVersion"<NEW."orderVersion"))
  THEN RAISE EXCEPTION 'diagnostic_identity_evidence_binding'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.provenance) LOOP
   IF NOT EXISTS (SELECT 1 FROM diagnostic_identity_provenance p WHERE p.id=item->>'id' AND p."orderId"=NEW."orderId" AND p.state='verified'
    AND p."cleanupRequestedAt" IS NULL AND p."erasedAt" IS NULL AND p.sha256=item->>'sha256' AND p.mime=item->>'mime' AND p."sizeBytes"=(item->>'sizeBytes')::int)
   THEN RAISE EXCEPTION 'diagnostic_identity_evidence_binding'; END IF;
  END LOOP;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW."orderId",NEW."orderVersion",NEW."identityRecordId",NEW."supersedesId",NEW."rightsUntil",NEW."recordedAt")
   IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."orderVersion",OLD."identityRecordId",OLD."supersedesId",OLD."rightsUntil",OLD."recordedAt")
  OR (NEW."recordedById" IS NOT NULL AND NEW."recordedById" IS DISTINCT FROM OLD."recordedById")
  OR (OLD."erasedAt" IS NOT NULL AND NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt")
  OR (NEW."erasedAt" IS NULL AND ROW(NEW."observationHash",NEW.identifiers,NEW.provenance,NEW.rights,NEW.explanation,NEW."recordHash")
   IS DISTINCT FROM ROW(OLD."observationHash",OLD.identifiers,OLD.provenance,OLD.rights,OLD.explanation,OLD."recordHash"))
 THEN RAISE EXCEPTION 'diagnostic_identity_evidence_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_identity_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_identity_evidence
 FOR EACH ROW EXECUTE FUNCTION diagnostic_identity_evidence_guard();

-- First drafts and reinspections pin the order's current structured leaf, or
-- none; same-visit corrections inherit. Pins clear only with report erasure.
CREATE FUNCTION diagnostic_report_evidence_pin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_id TEXT; selected_hash TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."identityEvidenceId",NEW."identityEvidenceHash") IS DISTINCT FROM ROW(OLD."identityEvidenceId",OLD."identityEvidenceHash")
   AND NOT (OLD."erasedAt" IS NULL AND NEW."erasedAt" IS NOT NULL AND NEW."identityEvidenceId" IS NULL AND NEW."identityEvidenceHash" IS NULL)
  THEN RAISE EXCEPTION 'diagnostic_report_evidence_pin_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."erasedAt" IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_report_evidence_pin_binding'; END IF;
 IF NEW."predecessorId" IS NOT NULL AND NOT NEW.reinspection THEN
  SELECT p."identityEvidenceId",p."identityEvidenceHash" INTO selected_id,selected_hash
   FROM diagnostic_reports p WHERE p.id=NEW."predecessorId" AND p."orderId"=NEW."orderId";
 ELSE
  SELECT e.id,e."recordHash" INTO selected_id,selected_hash FROM diagnostic_identity_evidence e
   WHERE e."orderId"=NEW."orderId" AND e."erasedAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM diagnostic_identity_evidence s WHERE s."supersedesId"=e.id)
   ORDER BY e."orderVersion" DESC LIMIT 1;
 END IF;
 IF ROW(NEW."identityEvidenceId",NEW."identityEvidenceHash") IS DISTINCT FROM ROW(selected_id,selected_hash)
 THEN RAISE EXCEPTION 'diagnostic_report_evidence_pin_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_report_evidence_pin BEFORE INSERT OR UPDATE ON diagnostic_reports
 FOR EACH ROW EXECUTE FUNCTION diagnostic_report_evidence_pin();

CREATE FUNCTION inspection_order_identity_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."identityEvidenceGeneration" < OLD."identityEvidenceGeneration" THEN RAISE EXCEPTION 'inspection_order_identity_generation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inspection_order_identity_generation BEFORE UPDATE OF "identityEvidenceGeneration" ON inspection_orders
 FOR EACH ROW EXECUTE FUNCTION inspection_order_identity_generation();
