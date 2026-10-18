CREATE TABLE "video_upload_sessions" (
  "id" TEXT NOT NULL, "uploadId" TEXT NOT NULL, "userId" TEXT NOT NULL, "listingId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'UPLOADING', "sourceKey" TEXT NOT NULL, "sizeBytes" INTEGER,
  "sha256" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "video_upload_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "video_upload_sessions_uploadId_key" ON "video_upload_sessions"("uploadId");
CREATE INDEX "video_upload_sessions_state_expiresAt_idx" ON "video_upload_sessions"("state", "expiresAt");
CREATE TABLE "video_generations" (
  "id" TEXT NOT NULL, "listingId" TEXT NOT NULL, "uploadId" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'PROCESSING',
  "manifest" JSONB, "durationMs" INTEGER, "posterKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3), "retiredAt" TIMESTAMP(3), CONSTRAINT "video_generations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "video_generations_listingId_state_idx" ON "video_generations"("listingId", "state");
CREATE TABLE "video_grants" (
  "id" TEXT NOT NULL, "secretHash" TEXT NOT NULL, "listingId" TEXT NOT NULL, "generationId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "video_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "video_grants_secretHash_key" ON "video_grants"("secretHash");
CREATE INDEX "video_grants_listingId_generationId_expiresAt_idx" ON "video_grants"("listingId", "generationId", "expiresAt");
