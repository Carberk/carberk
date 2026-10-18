-- AlterTable
ALTER TABLE "measurement_records" ADD COLUMN     "conversionEligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "measurement_outbox" ADD COLUMN     "conversionEligible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "measurement_rollups" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "epoch" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "population" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "completeThrough" TIMESTAMP(3) NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "lateRecords" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "measurement_rollups_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "measurement_investigation_exports" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "epoch" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "measurement_investigation_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_knowledge_sources" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "epoch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'quarantined',
    "provenance" JSONB NOT NULL,
    "purposes" JSONB NOT NULL,
    "reuseRights" JSONB NOT NULL,
    "redistributionRights" JSONB NOT NULL,
    "restrictions" JSONB NOT NULL,
    "identifiabilityReview" JSONB NOT NULL,
    "destinations" JSONB NOT NULL,
    "accessPolicy" JSONB NOT NULL,
    "retentionBasis" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_knowledge_datasets" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "epoch" TEXT NOT NULL,
    "derivationVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'quarantined',
    "review" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "market_knowledge_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_knowledge_dataset_sources" (
    "datasetId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "sourceEpoch" TEXT NOT NULL,

    CONSTRAINT "market_knowledge_dataset_sources_pkey" PRIMARY KEY ("datasetId","sourceId")
);

-- CreateIndex
CREATE INDEX "measurement_rollups_expiresAt_idx" ON "measurement_rollups"("expiresAt");

-- CreateIndex
CREATE INDEX "measurement_rollups_environment_population_windowFrom_windo_idx" ON "measurement_rollups"("environment", "population", "windowFrom", "windowTo");

-- CreateIndex
CREATE INDEX "measurement_investigation_exports_expiresAt_idx" ON "measurement_investigation_exports"("expiresAt");

-- CreateIndex
CREATE INDEX "measurement_investigation_exports_actorId_sessionId_idx" ON "measurement_investigation_exports"("actorId", "sessionId");

-- CreateIndex
CREATE INDEX "market_knowledge_datasets_status_idx" ON "market_knowledge_datasets"("status");

-- CreateIndex
CREATE INDEX "market_knowledge_dataset_sources_sourceId_idx" ON "market_knowledge_dataset_sources"("sourceId");

-- AddForeignKey
ALTER TABLE "market_knowledge_dataset_sources" ADD CONSTRAINT "market_knowledge_dataset_sources_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "market_knowledge_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_knowledge_dataset_sources" ADD CONSTRAINT "market_knowledge_dataset_sources_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "market_knowledge_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

