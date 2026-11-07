-- Expand-only provenance; this is deliberately not a foreign key to the Draft.
ALTER TABLE video_sources ADD COLUMN "openingDraftId" TEXT;
