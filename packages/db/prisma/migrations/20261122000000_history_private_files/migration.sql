CREATE UNIQUE INDEX "vehicle_history_orders_requestId_id_key" ON "vehicle_history_orders"("requestId", "id");
CREATE TABLE "history_private_files" (
  "id" UUID PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "orderId" UUID NOT NULL,
  "attemptKey" UUID NOT NULL,
  "purpose" TEXT NOT NULL CHECK ("purpose" = 'payment_evidence'),
  "policy" TEXT NOT NULL CHECK ("policy" = 'synthetic_payment_evidence_only'),
  "contentType" TEXT NOT NULL CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp')),
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 8388608),
  "sha256" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'uploaded', 'submitted', 'deleted')),
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "submittedAt" TIMESTAMPTZ(3),
  CONSTRAINT "history_private_files_order_fkey" FOREIGN KEY ("requestId", "orderId") REFERENCES "vehicle_history_orders"("requestId", "id") ON DELETE RESTRICT,
  CONSTRAINT "history_private_files_submission_check" CHECK (("status" = 'submitted') = ("submittedAt" IS NOT NULL)),
  CONSTRAINT "history_private_files_hash_check" CHECK ("status" NOT IN ('uploaded', 'submitted') OR "sha256" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "history_private_files_requestId_attemptKey_key" ON "history_private_files"("requestId", "attemptKey");
CREATE INDEX "history_private_files_status_expiresAt_idx" ON "history_private_files"("status", "expiresAt");
