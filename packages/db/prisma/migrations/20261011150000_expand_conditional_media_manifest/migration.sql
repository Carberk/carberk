-- Expand compatibility for WebP-only uploads while retaining existing manifests.
-- Exact manifest/prefix ownership and deletion authority stay in application/worker code.
-- Replace the check atomically; no upload, adopter or cleanup rows are rewritten.
ALTER TABLE "media_uploads"
  DROP CONSTRAINT "media_uploads_conditional_manifest_check",
  ADD CONSTRAINT "media_uploads_conditional_manifest_check"
    CHECK ("writeProtocol" = 'legacy' OR
      ("kind" = 'image' AND cardinality("objectKeys") IN (5, 9) AND "key" = ANY("objectKeys")));
