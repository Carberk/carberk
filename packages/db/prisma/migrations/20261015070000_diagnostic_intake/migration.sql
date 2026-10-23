-- CreateTable
CREATE TABLE "diagnostic_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'ashgabat',
    "planCode" TEXT NOT NULL DEFAULT 'standard',
    "names" JSONB NOT NULL,
    "operationalApproval" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_center_assignments" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "qualifiedUntil" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "diagnostic_center_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_template_versions" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_orders" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "commissionerId" TEXT,
    "requestKey" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "listingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 0,
    "epoch" TEXT NOT NULL,
    "physicalAuthorization" JSONB,
    "publicationAuthorization" JSONB,
    "observedVehicle" JSONB,
    "listingIdentityDigest" TEXT,
    "associationValidatedAt" TIMESTAMP(3),
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "inspection_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_order_assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "diagnostic_order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_audits" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_centers_code_key" ON "diagnostic_centers"("code");

-- CreateIndex
CREATE INDEX "diagnostic_center_assignments_userId_revokedAt_idx" ON "diagnostic_center_assignments"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_center_assignments_centerId_userId_capability_key" ON "diagnostic_center_assignments"("centerId", "userId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_template_versions_centerId_version_key" ON "diagnostic_template_versions"("centerId", "version");

-- CreateIndex
CREATE INDEX "inspection_orders_commissionerId_createdAt_idx" ON "inspection_orders"("commissionerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "inspection_orders_centerId_status_createdAt_idx" ON "inspection_orders"("centerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "inspection_orders_listingId_audience_idx" ON "inspection_orders"("listingId", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_orders_commissionerId_requestKey_key" ON "inspection_orders"("commissionerId", "requestKey");

-- CreateIndex
CREATE INDEX "diagnostic_order_assignments_userId_revokedAt_idx" ON "diagnostic_order_assignments"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_order_assignments_orderId_userId_capability_key" ON "diagnostic_order_assignments"("orderId", "userId", "capability");

-- CreateIndex
CREATE INDEX "diagnostic_audits_orderId_createdAt_idx" ON "diagnostic_audits"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "diagnostic_center_assignments" ADD CONSTRAINT "diagnostic_center_assignments_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "diagnostic_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_center_assignments" ADD CONSTRAINT "diagnostic_center_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_template_versions" ADD CONSTRAINT "diagnostic_template_versions_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "diagnostic_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_template_versions" ADD CONSTRAINT "diagnostic_template_versions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "diagnostic_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "diagnostic_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_order_assignments" ADD CONSTRAINT "diagnostic_order_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inspection_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_order_assignments" ADD CONSTRAINT "diagnostic_order_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_audits" ADD CONSTRAINT "diagnostic_audits_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "diagnostic_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_audits" ADD CONSTRAINT "diagnostic_audits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inspection_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_audits" ADD CONSTRAINT "diagnostic_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

