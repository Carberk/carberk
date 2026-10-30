-- Keep the closed image inventory unchanged. V1 video owns one immutable
-- prepared source; processing outputs have a separate generation inventory.
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_conditional_manifest_v2_check"
  CHECK ("writeProtocol" = 'legacy' OR
    ("kind" = 'image' AND cardinality("objectKeys") IN (5, 9) AND "key" = ANY("objectKeys")) OR
    ("writeProtocol" = 'video-v1' AND "kind" = 'video'
      AND "contentType" = 'video/mp4' AND "sizeBytes" IS NOT NULL AND "sizeBytes" BETWEEN 1 AND 15728640
      AND "objectKeys" = ARRAY["key"]
      AND "key" ~ '^video/v1/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/source[.]mp4$'
      AND split_part("key", '/', 3) = "id")
  ) NOT VALID;
ALTER TABLE "media_uploads" VALIDATE CONSTRAINT "media_uploads_conditional_manifest_v2_check";
ALTER TABLE "media_uploads" DROP CONSTRAINT "media_uploads_conditional_manifest_check";
ALTER TABLE "media_uploads" RENAME CONSTRAINT "media_uploads_conditional_manifest_v2_check" TO "media_uploads_conditional_manifest_check";
