-- Expand-only. Roll back by reverting callers; retain outstanding cleanup work.
ALTER TABLE "video_upload_cleanups"
  ADD COLUMN "objectPrefix" TEXT,
  ADD COLUMN "bucket" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "completionPending" BOOLEAN NOT NULL DEFAULT false;
-- The deletion ledger must survive cascades, including direct User deletion.
-- Row deletion waits for a worker's generation reservation lock before commit.
CREATE FUNCTION record_deleted_video_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO video_upload_cleanups
    ("sourceId", "objectKey", "multipartUploadId", "objectPrefix", bucket, "sizeBytes", "completionPending")
  VALUES (OLD.id, OLD."objectKey", OLD."multipartUploadId",
    regexp_replace(OLD."objectKey", '/source\.mp4$', '/'), OLD.bucket, OLD."sizeBytes", OLD.state = 'COMPLETING')
  ON CONFLICT ("sourceId") DO UPDATE SET
    "objectPrefix" = EXCLUDED."objectPrefix", bucket = EXCLUDED.bucket,
    "sizeBytes" = EXCLUDED."sizeBytes", "completionPending" = video_upload_cleanups."completionPending" OR EXCLUDED."completionPending",
    status = 'PENDING', "nextAttemptAt" = CURRENT_TIMESTAMP, "completedAt" = NULL;
  RETURN OLD;
END;
$$;
CREATE TRIGGER record_deleted_video_source BEFORE DELETE ON video_sources
FOR EACH ROW EXECUTE FUNCTION record_deleted_video_source();

CREATE TABLE "video_output_reservations" (
  "key" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "started" BOOLEAN NOT NULL DEFAULT false,
  "settled" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "video_output_reservations_sourceId_idx" ON "video_output_reservations"("sourceId");
