-- AlterTable
ALTER TABLE "history_payments" ADD COLUMN     "verifiedFunds" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "history_purchase_intents" ADD COLUMN     "sourceArtifactId" TEXT;

-- CreateTable
CREATE TABLE "history_bookings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientBookingId" TEXT NOT NULL,
    "vin" TEXT,
    "providers" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "refundRule" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "history_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_artifacts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "vin" TEXT,
    "originalDate" TIMESTAMP(3) NOT NULL,
    "mileageObservedAt" TIMESTAMP(3),
    "sourceListingId" TEXT,
    "acquiredForOrderId" TEXT,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expectedPages" INTEGER NOT NULL,
    "verifiedPages" INTEGER,
    "rights" JSONB NOT NULL,
    "provenance" TEXT,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restrictedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "history_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_deliveries" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "purchaseIntentId" TEXT NOT NULL,
    "sharedLink" TEXT,
    "linkApprovedAt" TIMESTAMP(3),
    "deliveredById" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "history_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_artifact_cleanup" (
    "artifactId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "history_artifact_cleanup_pkey" PRIMARY KEY ("artifactId")
);

-- CreateIndex
CREATE UNIQUE INDEX "history_bookings_orderId_clientBookingId_key" ON "history_bookings"("orderId", "clientBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "history_artifacts_objectKey_key" ON "history_artifacts"("objectKey");

-- CreateIndex
CREATE INDEX "history_artifacts_vin_provider_state_idx" ON "history_artifacts"("vin", "provider", "state");

-- CreateIndex
CREATE UNIQUE INDEX "history_deliveries_orderId_artifactId_key" ON "history_deliveries"("orderId", "artifactId");

-- AddForeignKey
ALTER TABLE "history_bookings" ADD CONSTRAINT "history_bookings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "history_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_deliveries" ADD CONSTRAINT "history_deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "history_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_deliveries" ADD CONSTRAINT "history_deliveries_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "history_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_deliveries" ADD CONSTRAINT "history_deliveries_purchaseIntentId_fkey" FOREIGN KEY ("purchaseIntentId") REFERENCES "history_purchase_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE history_artifacts ADD CONSTRAINT history_artifact_valid CHECK (
 provider IN ('carfax','autocheck') AND "sizeBytes" > 0 AND "sizeBytes" <= 20971520 AND "expectedPages" > 0 AND sha256 ~ '^[a-f0-9]{64}$' AND
 state IN ('staged','verified','restricted','removed') AND
 (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$') AND
 (state <> 'verified' OR (vin IS NOT NULL AND "verifiedPages"="expectedPages" AND "verifiedAt" IS NOT NULL)) AND
 "objectKey" = 'history-artifacts/' || id || '/' || sha256
);
ALTER TABLE history_bookings ADD CONSTRAINT history_booking_valid CHECK (
 amount=100 AND "windowEnd">"windowStart" AND
 (("erasedAt" IS NULL AND vin IS NOT NULL AND vin ~ '^[A-HJ-NPR-Z0-9]{17}$') OR ("erasedAt" IS NOT NULL AND vin IS NULL)) AND
 jsonb_typeof(providers)='array' AND jsonb_array_length(providers) BETWEEN 1 AND 2 AND providers <@ '["carfax","autocheck"]'::jsonb
);
CREATE FUNCTION history_artifact_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.provider,NEW."originalDate",NEW."objectKey",NEW.sha256,NEW."sizeBytes",NEW."expectedPages") IS DISTINCT FROM ROW(OLD.provider,OLD."originalDate",OLD."objectKey",OLD.sha256,OLD."sizeBytes",OLD."expectedPages") THEN RAISE EXCEPTION 'history_artifact_original_immutable'; END IF;
 IF NEW.vin IS DISTINCT FROM OLD.vin AND NOT (NEW.vin IS NULL AND NEW.state IN ('restricted','removed')) THEN RAISE EXCEPTION 'history_artifact_original_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_artifact_original_immutable BEFORE UPDATE ON history_artifacts FOR EACH ROW EXECUTE FUNCTION history_artifact_original_immutable();
CREATE FUNCTION history_delivery_exact_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM history_purchase_intents p JOIN history_orders o ON o.id=p."orderId" JOIN history_quotes q ON q.id=o."quoteId" JOIN history_artifacts a ON a.id=NEW."artifactId"
  WHERE p.id=NEW."purchaseIntentId" AND p."orderId"=NEW."orderId" AND p.state='completed' AND a.state='verified' AND a.vin=p.vin AND a.vin=q.vin AND q.providers ? a.provider AND a."removedAt" IS NULL AND a."restrictedAt" IS NULL) THEN RAISE EXCEPTION 'history_delivery_exact_order'; END IF;
 IF NEW."erasedAt" IS NULL AND (NEW."sharedLink" IS NULL OR NEW."linkApprovedAt" IS NULL) THEN RAISE EXCEPTION 'history_delivery_exact_order'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_delivery_exact_order BEFORE INSERT ON history_deliveries FOR EACH ROW EXECUTE FUNCTION history_delivery_exact_order();
