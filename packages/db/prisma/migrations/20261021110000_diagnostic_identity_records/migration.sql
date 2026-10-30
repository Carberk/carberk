-- Forward-only. Rollback disables the history route and leaves recorded rows
-- untouched. Legacy mutable observations are not backfilled: orders observed
-- before this migration keep no identity record and remain unlinkable.
CREATE TABLE "diagnostic_identity_records" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderVersion" INTEGER NOT NULL,
    "observation" JSONB,
    "observationHash" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "diagnostic_identity_records_pkey" PRIMARY KEY ("id"),
    -- Restricted identity content exists until the owning order is erased, then never again.
    CONSTRAINT "diagnostic_identity_record_content" CHECK (
     ("erasedAt" IS NULL AND "observation" IS NOT NULL AND "observationHash" IS NOT NULL AND "observationHash" ~ '^[a-f0-9]{64}$')
     OR ("erasedAt" IS NOT NULL AND "observation" IS NULL AND "observationHash" IS NULL))
);

CREATE UNIQUE INDEX "diagnostic_identity_records_orderId_orderVersion_key" ON "diagnostic_identity_records"("orderId", "orderVersion");
CREATE INDEX "diagnostic_identity_records_recordedById_idx" ON "diagnostic_identity_records"("recordedById");

ALTER TABLE "diagnostic_identity_records" ADD CONSTRAINT "diagnostic_identity_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inspection_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_identity_records" ADD CONSTRAINT "diagnostic_identity_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only per visit. INSERT binds the record to the order's resulting
-- version and current observation in the same transaction. UPDATE may only
-- erase content with the order's erasure or detach the recording account.
-- Rows leave only with their order (fixture cleanup cascade or table reset).
CREATE FUNCTION diagnostic_identity_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."erasedAt" IS NOT NULL OR NEW."recordedById" IS NULL OR NOT EXISTS (SELECT 1 FROM inspection_orders o
    WHERE o.id=NEW."orderId" AND o.version=NEW."orderVersion" AND o."erasedAt" IS NULL AND o."observedVehicle"=NEW.observation)
  THEN RAISE EXCEPTION 'diagnostic_identity_record_binding'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_identity_record_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF ROW(NEW.id,NEW."orderId",NEW."orderVersion",NEW."recordedAt") IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."orderVersion",OLD."recordedAt")
  OR (NEW."recordedById" IS NOT NULL AND NEW."recordedById" IS DISTINCT FROM OLD."recordedById")
  OR (OLD."erasedAt" IS NOT NULL AND NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt")
  OR (NEW."erasedAt" IS NULL AND ROW(NEW.observation,NEW."observationHash") IS DISTINCT FROM ROW(OLD.observation,OLD."observationHash"))
 THEN RAISE EXCEPTION 'diagnostic_identity_record_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_identity_record_immutable BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_identity_records
 FOR EACH ROW EXECUTE FUNCTION diagnostic_identity_record_immutable();
