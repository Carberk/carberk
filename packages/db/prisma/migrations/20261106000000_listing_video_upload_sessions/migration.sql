-- Listing video multipart upload sessions (ADR-0112, #1041).
-- Expand-only: new tables, no changes to existing rows or columns.

CREATE TABLE "listing_videos" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "draftId" TEXT,
    "listingId" TEXT,
    "activeGenerationId" TEXT,
    "pendingGenerationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_videos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listing_videos_one_target_check" CHECK (
        ("draftId" IS NULL) <> ("listingId" IS NULL)
    )
);

CREATE TABLE "video_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingVideoId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "multipartUploadId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "partSizeBytes" INTEGER NOT NULL,
    "partCount" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "openIdempotencyKey" TEXT,
    "coverOffsetMs" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completionStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "video_sources_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 15728640),
    CONSTRAINT "video_sources_part_count_check" CHECK ("partCount" > 0)
);

CREATE TABLE "video_generations" (
    "id" TEXT NOT NULL,
    "listingVideoId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Uploading',
    "coverOffsetMs" INTEGER NOT NULL,
    "processingAttempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_generations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_upload_cleanups" (
    "sourceId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "multipartUploadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "video_upload_cleanups_pkey" PRIMARY KEY ("sourceId")
);

CREATE UNIQUE INDEX "listing_videos_draftId_key" ON "listing_videos"("draftId");
CREATE UNIQUE INDEX "listing_videos_listingId_key" ON "listing_videos"("listingId");
CREATE UNIQUE INDEX "listing_videos_activeGenerationId_key" ON "listing_videos"("activeGenerationId");
CREATE UNIQUE INDEX "listing_videos_pendingGenerationId_key" ON "listing_videos"("pendingGenerationId");
CREATE INDEX "listing_videos_ownerId_idx" ON "listing_videos"("ownerId");

CREATE UNIQUE INDEX "video_sources_objectKey_key" ON "video_sources"("objectKey");
CREATE UNIQUE INDEX "video_sources_userId_openIdempotencyKey_key" ON "video_sources"("userId", "openIdempotencyKey");
CREATE INDEX "video_sources_state_expiresAt_idx" ON "video_sources"("state", "expiresAt");
CREATE INDEX "video_sources_listingVideoId_idx" ON "video_sources"("listingVideoId");

CREATE UNIQUE INDEX "video_generations_sourceId_key" ON "video_generations"("sourceId");
CREATE INDEX "video_generations_listingVideoId_status_idx" ON "video_generations"("listingVideoId", "status");

CREATE INDEX "video_upload_cleanups_status_nextAttemptAt_idx" ON "video_upload_cleanups"("status", "nextAttemptAt");

ALTER TABLE "listing_videos" ADD CONSTRAINT "listing_videos_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_videos" ADD CONSTRAINT "listing_videos_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "listing_drafts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "listing_videos" ADD CONSTRAINT "listing_videos_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_listingVideoId_fkey" FOREIGN KEY ("listingVideoId") REFERENCES "listing_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_generations" ADD CONSTRAINT "video_generations_listingVideoId_fkey" FOREIGN KEY ("listingVideoId") REFERENCES "listing_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_generations" ADD CONSTRAINT "video_generations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "video_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A cancelled/expired video must not prevent the existing photo-only Draft
-- discard/publication path. Pending/active video transfer remains #1042.
CREATE FUNCTION release_retired_draft_video() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM listing_videos
  WHERE "draftId" = OLD.id AND "activeGenerationId" IS NULL AND "pendingGenerationId" IS NULL;
  RETURN OLD;
END;
$$;
CREATE TRIGGER release_retired_draft_video_before_delete
BEFORE DELETE ON listing_drafts
FOR EACH ROW EXECUTE FUNCTION release_retired_draft_video();
