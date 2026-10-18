-- PostgreSQL CHECK accepts UNKNOWN; every coupled mileage field must be explicit.
ALTER TABLE history_artifacts DROP CONSTRAINT history_artifact_source_facts_bounded;
ALTER TABLE history_artifacts ADD CONSTRAINT history_artifact_source_facts_bounded CHECK (
 ("vehicleIdentity" IS NULL OR length("vehicleIdentity") BETWEEN 1 AND 300) AND
 jsonb_typeof("sourceObservations")='array' AND jsonb_array_length("sourceObservations") <= 20 AND
 (("mileageValue" IS NULL AND "mileageUnit" IS NULL) OR
  ("mileageValue" IS NOT NULL AND "mileageValue" >= 0 AND "mileageUnit" IS NOT NULL AND "mileageUnit" IN ('km','mi') AND "mileageObservedAt" IS NOT NULL))
);
