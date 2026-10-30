-- CreateTable
CREATE TABLE "diagnostic_reports" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "predecessorId" TEXT,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "snapshot" JSONB,
    "snapshotHash" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "diagnostic_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_evidence" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "epoch" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "cleanupRequestedAt" TIMESTAMP(3),
    "cleanupCompletedAt" TIMESTAMP(3),

    CONSTRAINT "diagnostic_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_pdf_artifacts" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "epoch" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "cleanupRequestedAt" TIMESTAMP(3),
    "cleanupCompletedAt" TIMESTAMP(3),

    CONSTRAINT "diagnostic_pdf_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_reports_predecessorId_key" ON "diagnostic_reports"("predecessorId");

-- CreateIndex
CREATE INDEX "diagnostic_reports_orderId_createdAt_idx" ON "diagnostic_reports"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_evidence_objectKey_key" ON "diagnostic_evidence"("objectKey");

-- CreateIndex
CREATE INDEX "diagnostic_evidence_reportId_findingId_state_idx" ON "diagnostic_evidence"("reportId", "findingId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_pdf_artifacts_objectKey_key" ON "diagnostic_pdf_artifacts"("objectKey");

-- CreateIndex
CREATE INDEX "diagnostic_pdf_artifacts_state_retryAt_idx" ON "diagnostic_pdf_artifacts"("state", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_pdf_artifacts_reportId_locale_rendererVersion_ge_key" ON "diagnostic_pdf_artifacts"("reportId", "locale", "rendererVersion", "generation");

-- AddForeignKey
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inspection_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "diagnostic_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "diagnostic_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_evidence" ADD CONSTRAINT "diagnostic_evidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "diagnostic_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_pdf_artifacts" ADD CONSTRAINT "diagnostic_pdf_artifacts_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "diagnostic_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive, forward-only migration. Rollback keeps the tables and disables all writers.
ALTER TABLE diagnostic_reports ADD CONSTRAINT diagnostic_report_valid CHECK (
 audience IN ('buyer_private','listing_public') AND status IN ('draft','submitted','returned','finalized','withdrawn') AND version>=0 AND
 ((status IN ('finalized','withdrawn') AND snapshot IS NOT NULL AND "snapshotHash" IS NOT NULL AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND "finalizedAt" IS NOT NULL) OR (status NOT IN ('finalized','withdrawn') AND snapshot IS NULL AND "snapshotHash" IS NULL AND "finalizedAt" IS NULL)) AND
 (status<>'withdrawn' OR ("withdrawnAt" IS NOT NULL AND "withdrawalReason" IS NOT NULL AND length(trim("withdrawalReason"))>0)) AND
 jsonb_typeof(state)='object' AND (state->>'id') IS NOT DISTINCT FROM id AND (state->>'orderId') IS NOT DISTINCT FROM "orderId" AND (state->>'templateVersionId') IS NOT DISTINCT FROM "templateVersionId" AND (state->>'audience') IS NOT DISTINCT FROM audience AND (state->>'status') IS NOT DISTINCT FROM status
);
ALTER TABLE diagnostic_evidence ADD CONSTRAINT diagnostic_evidence_valid CHECK (
 state IN ('staged','verified','cleanup_pending','removed') AND mime IN ('image/jpeg','image/png','image/webp') AND
 "sizeBytes">0 AND "sizeBytes"<=10485760 AND sha256 ~ '^[a-f0-9]{64}$' AND
 "objectKey"='diagnostic-evidence/'||id||'/'||sha256 AND (state<>'verified' OR "verifiedAt" IS NOT NULL)
);
ALTER TABLE diagnostic_pdf_artifacts ADD CONSTRAINT diagnostic_pdf_valid CHECK (
 locale IN ('tk','ru','en') AND state IN ('pending','processing','ready','failed','cleanup_pending','removed') AND
 generation>0 AND attempts>=0 AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND
 "objectKey"='diagnostic-pdf/'||"reportId"||'/'||id||'.pdf' AND
 (state<>'ready' OR (sha256 IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$' AND "sizeBytes" IS NOT NULL AND "sizeBytes">0 AND "verifiedAt" IS NOT NULL))
);
CREATE FUNCTION diagnostic_report_pinned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o."templateVersionId"=NEW."templateVersionId" AND o.audience=NEW.audience AND o."erasedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_report_pinned'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."orderId",NEW."templateVersionId",NEW.audience,NEW."predecessorId") IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."templateVersionId",OLD.audience,OLD."predecessorId") THEN RAISE EXCEPTION 'diagnostic_report_identity_immutable'; END IF;
  IF OLD.snapshot IS NOT NULL AND ROW(NEW.snapshot,NEW."snapshotHash",NEW."finalizedAt",NEW.state->'findings',NEW.state->'observedAt',NEW.state->'mileageKm') IS DISTINCT FROM ROW(OLD.snapshot,OLD."snapshotHash",OLD."finalizedAt",OLD.state->'findings',OLD.state->'observedAt',OLD.state->'mileageKm') THEN RAISE EXCEPTION 'diagnostic_snapshot_immutable'; END IF;
  IF OLD.status IN ('finalized','withdrawn') AND NEW.status NOT IN ('finalized','withdrawn') THEN RAISE EXCEPTION 'diagnostic_snapshot_immutable'; END IF;
 END IF;
 IF NEW."predecessorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_reports p WHERE p.id=NEW."predecessorId" AND p."orderId"=NEW."orderId" AND p.audience=NEW.audience AND p.snapshot IS NOT NULL) THEN RAISE EXCEPTION 'diagnostic_correction_audience'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_report_pinned BEFORE INSERT OR UPDATE ON diagnostic_reports FOR EACH ROW EXECUTE FUNCTION diagnostic_report_pinned();
CREATE FUNCTION diagnostic_evidence_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW."reportId",NEW."findingId",NEW."objectKey",NEW.sha256,NEW."sizeBytes",NEW.mime) IS DISTINCT FROM ROW(OLD.id,OLD."reportId",OLD."findingId",OLD."objectKey",OLD.sha256,OLD."sizeBytes",OLD.mime) THEN RAISE EXCEPTION 'diagnostic_evidence_identity'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_evidence_identity BEFORE UPDATE ON diagnostic_evidence FOR EACH ROW EXECUTE FUNCTION diagnostic_evidence_identity();
CREATE FUNCTION diagnostic_pdf_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM diagnostic_reports r WHERE r.id=NEW."reportId" AND r."snapshotHash"=NEW."snapshotHash" AND r.snapshot IS NOT NULL) THEN RAISE EXCEPTION 'diagnostic_pdf_snapshot'; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW."reportId",NEW."snapshotHash",NEW.locale,NEW."rendererVersion",NEW.generation,NEW."objectKey") IS DISTINCT FROM ROW(OLD.id,OLD."reportId",OLD."snapshotHash",OLD.locale,OLD."rendererVersion",OLD.generation,OLD."objectKey") THEN RAISE EXCEPTION 'diagnostic_pdf_identity_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_pdf_snapshot BEFORE INSERT OR UPDATE ON diagnostic_pdf_artifacts FOR EACH ROW EXECUTE FUNCTION diagnostic_pdf_snapshot();

CREATE UNIQUE INDEX diagnostic_report_original_order ON diagnostic_reports("orderId") WHERE "predecessorId" IS NULL;
