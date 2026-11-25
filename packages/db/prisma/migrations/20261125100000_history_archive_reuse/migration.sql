ALTER TABLE history_report_artifacts ADD COLUMN "archiveSourceId" UUID;
ALTER TABLE vehicle_history_requests ADD COLUMN "selectedArchiveId" UUID;

ALTER TABLE history_report_artifacts ADD CONSTRAINT "history_report_artifacts_archiveSourceId_fkey"
    FOREIGN KEY ("archiveSourceId") REFERENCES history_report_artifacts(id) ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE INDEX history_report_archive_vin_lookup ON history_report_artifacts ((artifact->'report'->>'vin'))
    WHERE "deliveredAt" IS NOT NULL AND "validatedAt" IS NOT NULL AND "archiveSourceId" IS NULL
        AND artifact->'report'->'permittedUse' = 'true'::jsonb;
