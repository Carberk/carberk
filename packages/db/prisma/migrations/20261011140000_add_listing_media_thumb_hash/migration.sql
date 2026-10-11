-- Add optional preview storage without changing or backfilling legacy media.
ALTER TABLE "listing_media" ADD COLUMN "thumbHash" TEXT;
