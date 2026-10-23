-- Preserve the Listing/Profile adopter invariant. A private video session is
-- only a PREPARING claim, never a public or final adopter.
-- Install/validate the replacement before dropping the old guard. The existing
-- preparation check still requires a token and immutable claim deadline.
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_claim_target_v2_check"
  CHECK (
    "state" NOT IN ('PREPARING', 'ADOPTED') OR
    ("claimTargetType" IN ('listing', 'profile') AND "claimTargetId" IS NOT NULL) OR
    ("state" = 'PREPARING' AND "claimTargetType" = 'video_session'
      AND "kind" = 'video' AND "writeProtocol" = 'video-v1'
      AND "claimTargetId" IS NOT NULL AND "claimToken" IS NOT NULL
      AND "claimToken" = "claimTargetId")
  ) NOT VALID;
ALTER TABLE "media_uploads" VALIDATE CONSTRAINT "media_uploads_claim_target_v2_check";
ALTER TABLE "media_uploads" DROP CONSTRAINT "media_uploads_claim_target_check";
ALTER TABLE "media_uploads" RENAME CONSTRAINT "media_uploads_claim_target_v2_check" TO "media_uploads_claim_target_check";
