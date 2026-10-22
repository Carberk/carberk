-- Forward-only method admission. No schema columns, proof backfill or data rewrite.
-- The automatic policy is checked by the proof owner under the existing locks;
-- all private pair, immutable binding, invalidation and consumption rules stay intact.
-- Rollback uses a later forward migration to close automatic issuance, never rewrites proofs.
CREATE OR REPLACE FUNCTION diagnostic_continuity_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD."consumedReportId" IS NULL AND NEW."consumedReportId" IS NOT NULL THEN
   IF (to_jsonb(NEW)-'consumedReportId'-'consumedAt') IS DISTINCT FROM (to_jsonb(OLD)-'consumedReportId'-'consumedAt')
    OR OLD."invalidatedAt" IS NOT NULL OR OLD."erasedAt" IS NOT NULL OR NEW."consumedAt" IS NULL OR NEW."rightsUntil"<=NEW."consumedAt"
    OR NOT diagnostic_continuity_proof_bound(NEW)
    OR NOT EXISTS (SELECT 1 FROM inspection_orders ao JOIN inspection_orders b ON b.id=NEW."candidateOrderId"
     WHERE ao.id=NEW."predecessorOrderId" AND ao.version=(NEW.bindings->'predecessor'->>'version')::int
      AND ao.epoch=NEW.bindings->'predecessor'->>'epoch' AND ao."identityEvidenceGeneration"=(NEW.bindings->'predecessor'->>'evidenceGeneration')::int
      AND b.epoch=NEW.bindings->'candidate'->>'epoch' AND b."identityEvidenceGeneration"=(NEW.bindings->'candidate'->>'evidenceGeneration')::int)
   THEN RAISE EXCEPTION 'diagnostic_continuity_proof_consumption'; END IF;
   RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-'invalidatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'invalidatedAt')
   OR (OLD."invalidatedAt" IS NOT NULL AND NEW."invalidatedAt" IS DISTINCT FROM OLD."invalidatedAt")
   OR NEW."invalidatedAt" IS NULL THEN RAISE EXCEPTION 'diagnostic_continuity_proof_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."erasedAt" IS NOT NULL OR NEW."invalidatedAt" IS NOT NULL OR NEW."consumedReportId" IS NOT NULL OR NEW.content IS NULL OR NEW.bindings IS NULL
  OR NEW.content->>'proofId' IS DISTINCT FROM NEW.id OR NEW.content->>'policyVersion'<>'ADR-0108'
  OR (NEW.content->>'method' IS NULL OR NEW.content->>'method' NOT IN ('comparative_attestation','automatic_normalized_vin')) OR NEW.content->>'result'<>'same_vehicle'
  OR NEW.content->>'issuedBy' IS DISTINCT FROM NEW."issuerId"
  OR NEW.content->>'linkingTechnicianId' IS DISTINCT FROM NEW."linkingTechnicianId"
  OR NEW."issuerId"=NEW."linkingTechnicianId" OR NEW."rightsUntil"<=NEW."issuedAt"
  OR NOT diagnostic_continuity_proof_bound(NEW)
 THEN RAISE EXCEPTION 'diagnostic_continuity_proof_binding'; END IF;
 RETURN NEW;
END $$;

