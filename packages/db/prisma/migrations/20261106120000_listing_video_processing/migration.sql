-- Durable processing output metadata and manifest (ADR-0112, #1056).
ALTER TABLE "video_generations"
  ADD COLUMN "manifest" JSONB,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "videoCodec" TEXT,
  ADD COLUMN "audioCodec" TEXT,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);
