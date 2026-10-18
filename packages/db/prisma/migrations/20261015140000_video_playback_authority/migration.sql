-- Legacy grants remain unbound and are refused by every playback authority read.
ALTER TABLE "video_grants" ADD COLUMN "ownerUserId" TEXT, ADD COLUMN "ownerSessionId" TEXT;
ALTER TABLE "listings" ADD COLUMN "activeVideoGenerationId" TEXT, ADD COLUMN "activeVideoRevision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "video_grants_ownerUserId_ownerSessionId_expiresAt_idx" ON "video_grants"("ownerUserId", "ownerSessionId", "expiresAt");
ALTER TABLE "video_grants" ADD CONSTRAINT "video_grants_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_grants" ADD CONSTRAINT "video_grants_ownerSessionId_fkey" FOREIGN KEY ("ownerSessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_activeVideoGenerationId_fkey" FOREIGN KEY ("activeVideoGenerationId") REFERENCES "video_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
