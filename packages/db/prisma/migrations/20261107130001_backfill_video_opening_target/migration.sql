-- Preserve replay identity for existing Draft uploads before publication.
UPDATE video_sources AS source SET "openingDraftId" = slot."draftId"
FROM listing_videos AS slot WHERE source."listingVideoId" = slot.id AND slot."draftId" IS NOT NULL;
