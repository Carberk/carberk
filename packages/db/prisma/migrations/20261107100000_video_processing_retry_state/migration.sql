-- Durable, bounded processing retry state (ADR-0112, #1056).
ALTER TABLE "video_generations"
  ADD COLUMN "processingRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "failureType" TEXT;
