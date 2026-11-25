ALTER TABLE history_report_artifacts
    ADD COLUMN "archivePdfSha256" TEXT,
    ADD COLUMN "archiveLinkEvidenceSha256" TEXT;
