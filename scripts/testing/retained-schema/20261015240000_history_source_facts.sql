-- Original provider observations remain distinct from current-request staff notes.
ALTER TABLE history_artifacts ADD COLUMN "mileageValue" INTEGER,
 ADD COLUMN "mileageUnit" TEXT,
 ADD COLUMN "vehicleIdentity" TEXT,
 ADD COLUMN "sourceObservations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE history_artifacts ADD CONSTRAINT history_artifact_source_facts_bounded CHECK (
 ("vehicleIdentity" IS NULL OR length("vehicleIdentity") BETWEEN 1 AND 300) AND
 jsonb_typeof("sourceObservations")='array' AND jsonb_array_length("sourceObservations") <= 20 AND
 (("mileageValue" IS NULL AND "mileageUnit" IS NULL) OR
  ("mileageValue" IS NOT NULL AND "mileageValue" >= 0 AND "mileageUnit" IN ('km','mi') AND "mileageObservedAt" IS NOT NULL))
);
CREATE FUNCTION history_artifact_source_facts_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."vehicleIdentity",NEW."mileageValue",NEW."mileageUnit",NEW."mileageObservedAt",NEW."sourceObservations") IS DISTINCT FROM
    ROW(OLD."vehicleIdentity",OLD."mileageValue",OLD."mileageUnit",OLD."mileageObservedAt",OLD."sourceObservations") AND NOT
    (NEW.state IN ('restricted','removed') AND NEW."vehicleIdentity" IS NULL AND NEW."mileageValue" IS NULL AND NEW."mileageUnit" IS NULL AND NEW."mileageObservedAt" IS NULL AND NEW."sourceObservations"='[]'::jsonb)
 THEN RAISE EXCEPTION 'history_artifact_source_facts_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_artifact_source_facts_immutable BEFORE UPDATE ON history_artifacts FOR EACH ROW EXECUTE FUNCTION history_artifact_source_facts_immutable();
