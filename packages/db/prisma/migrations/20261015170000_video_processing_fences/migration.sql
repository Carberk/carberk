-- Additive only. Legacy NULL protocol/fence fields never authorize new processing.
-- Roll back application registration first; retain these fields and cleanup tombstones.
ALTER TABLE "video_upload_sessions"
  ADD COLUMN "protocolVersion" INTEGER,
  ADD COLUMN "targetKind" TEXT,
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "targetRevision" INTEGER,
  ADD COLUMN "storageUploadId" TEXT,
  ADD COLUMN "posterMs" INTEGER,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyHash" TEXT,
  ADD COLUMN "completionFence" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "video_upload_sessions_userId_idempotencyKey_key" ON "video_upload_sessions"("userId", "idempotencyKey");
ALTER TABLE "video_generations"
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "completionFence" TEXT,
  ADD COLUMN "targetRevision" INTEGER,
  ADD COLUMN "processingVersion" TEXT,
  ADD COLUMN "sourceSha256" TEXT,
  ADD COLUMN "sourceWidth" INTEGER,
  ADD COLUMN "sourceHeight" INTEGER;
ALTER TABLE "listings" ADD COLUMN "pendingVideoGenerationId" TEXT;
ALTER TABLE "listings" ADD CONSTRAINT "listings_pendingVideoGenerationId_fkey" FOREIGN KEY ("pendingVideoGenerationId") REFERENCES "video_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- No foreign keys on durable work. It must survive deletion of identity/media rows.
CREATE TABLE "video_process_work" (
  "generationId" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "completionFence" TEXT NOT NULL,
  "targetRevision" INTEGER NOT NULL,
  "processingVersion" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "video_process_work_pkey" PRIMARY KEY ("generationId")
);
CREATE INDEX "video_process_work_state_nextAttemptAt_idx" ON "video_process_work"("state", "nextAttemptAt");
CREATE TABLE "video_cleanup_work" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "sessionId" TEXT,
  "generationId" TEXT,
  "writeProtocol" TEXT NOT NULL DEFAULT 'video-v1',
  "sourceKey" TEXT,
  "storageUploadId" TEXT,
  "objectKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "video_cleanup_work_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "video_cleanup_work_state_nextAttemptAt_idx" ON "video_cleanup_work"("state", "nextAttemptAt");
CREATE INDEX "video_cleanup_work_uploadId_idx" ON "video_cleanup_work"("uploadId");
