-- #536 / ADR-0079: server-recorded upload provenance.
-- Presign records a media_uploads row for the calling User. A listing_media row
-- adopts it at most once (listing_media.uploadId is unique), and storage cleanup
-- authority follows that link instead of the object key.
--
-- The schema statements come from `prisma migrate diff` (schema to schema). The
-- backfill after them is hand-written.

-- AlterTable
ALTER TABLE "listing_media" ADD COLUMN     "uploadId" TEXT;

-- CreateTable
CREATE TABLE "media_uploads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_uploads_key_key" ON "media_uploads"("key");

-- CreateIndex
CREATE INDEX "media_uploads_userId_createdAt_idx" ON "media_uploads"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "listing_media_uploadId_key" ON "listing_media"("uploadId");

-- AddForeignKey
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "media_uploads"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: media that already exists has no upload row, so give it one.
--   * The first listing_media row per key (oldest createdAt, then id) owns that
--     key. Its upload belongs to the Listing's seller and reuses the media row's
--     id as the upload id, so the link is deterministic.
--   * Any later row with the same key is a duplicate and is deliberately left
--     with a NULL uploadId. Removing it never deletes storage objects, so a
--     duplicate created before this fix cannot delete the original owner's object.
--   * The content type is derived from the key extension. The size is unknown.
INSERT INTO "media_uploads" ("id", "userId", "key", "kind", "contentType", "sizeBytes", "createdAt")
SELECT DISTINCT ON (lm."key")
  lm."id",
  l."sellerId",
  lm."key",
  lm."kind",
  CASE
    WHEN lm."key" ILIKE '%.webp' THEN 'image/webp'
    WHEN lm."key" ILIKE '%.mp4' OR lm."kind" = 'video' THEN 'video/mp4'
    ELSE 'image/jpeg'
  END,
  NULL,
  lm."createdAt"
FROM "listing_media" lm
JOIN "listings" l ON l."id" = lm."listingId"
ORDER BY lm."key", lm."createdAt", lm."id";

UPDATE "listing_media" lm
SET "uploadId" = lm."id"
WHERE EXISTS (SELECT 1 FROM "media_uploads" mu WHERE mu."id" = lm."id");
