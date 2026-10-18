-- V1 already has dedicated singleton source and preparation-target guards.
-- Preserve the closed protocol list while admitting that reviewed protocol.
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_write_protocol_v2_check"
  CHECK ("writeProtocol" IN ('legacy', 'conditional-v1', 'video-v1')) NOT VALID;
ALTER TABLE "media_uploads" VALIDATE CONSTRAINT "media_uploads_write_protocol_v2_check";
ALTER TABLE "media_uploads" DROP CONSTRAINT "media_uploads_write_protocol_check";
ALTER TABLE "media_uploads" RENAME CONSTRAINT "media_uploads_write_protocol_v2_check" TO "media_uploads_write_protocol_check";
