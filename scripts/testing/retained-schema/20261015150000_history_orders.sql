-- CreateTable
CREATE TABLE "history_quotes" (
    "erasedAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vin" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 100,
    "providers" JSONB NOT NULL,
    "preflightOutcome" TEXT NOT NULL,
    "preflightEvidence" TEXT,
    "refundRule" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "feasible" BOOLEAN NOT NULL,
    "offeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "history_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_capacity_days" (
    "day" TEXT NOT NULL,
    "slotLimit" INTEGER NOT NULL,
    "morningLimit" INTEGER NOT NULL,
    "evidence" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'synthetic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_capacity_days_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "history_provider_allowances" (
    "provider" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "allowance" INTEGER NOT NULL,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "evidence" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'synthetic',

    CONSTRAINT "history_provider_allowances_pkey" PRIMARY KEY ("provider","day")
);

-- CreateTable
CREATE TABLE "history_orders" (
    "version" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "morning" BOOLEAN NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'held',
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "promiseAt" TIMESTAMP(3) NOT NULL,
    "recoveryUsed" BOOLEAN NOT NULL DEFAULT false,
    "recoveryAgreedAt" TIMESTAMP(3),
    "recoveryDeadline" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "rights" JSONB NOT NULL,
    "erasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "history_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientPaymentId" TEXT NOT NULL,
    "attachmentId" TEXT,
    "claim" TEXT,
    "amount" INTEGER,
    "receivedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "evidence" TEXT,
    "state" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_purchase_intents" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vin" TEXT,
    "providers" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'prepared',
    "externalReference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "history_purchase_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "history_quotes_requestId_createdAt_idx" ON "history_quotes"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "history_orders_requestId_key" ON "history_orders"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "history_orders_quoteId_key" ON "history_orders"("quoteId");

-- CreateIndex
CREATE INDEX "history_orders_day_state_holdExpiresAt_idx" ON "history_orders"("day", "state", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "history_orders_state_paidAt_idx" ON "history_orders"("state", "paidAt");

-- CreateIndex
CREATE INDEX "history_payments_orderId_state_idx" ON "history_payments"("orderId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "history_payments_orderId_clientPaymentId_key" ON "history_payments"("orderId", "clientPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "history_purchase_intents_orderId_key" ON "history_purchase_intents"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "history_refunds_orderId_key" ON "history_refunds"("orderId");

-- AddForeignKey
ALTER TABLE "history_quotes" ADD CONSTRAINT "history_quotes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "vehicle_history_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_orders" ADD CONSTRAINT "history_orders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "vehicle_history_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_orders" ADD CONSTRAINT "history_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "history_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_orders" ADD CONSTRAINT "history_orders_day_fkey" FOREIGN KEY ("day") REFERENCES "history_capacity_days"("day") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_payments" ADD CONSTRAINT "history_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "history_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_purchase_intents" ADD CONSTRAINT "history_purchase_intents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "history_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_refunds" ADD CONSTRAINT "history_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "history_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Synthetic operational rows cannot activate a real payment or provider adapter.
ALTER TABLE history_quotes ADD CONSTRAINT history_quotes_valid_offer CHECK (
  amount = 100 AND "windowEnd" > "windowStart" AND
  "preflightOutcome" IN ('available','malformed','unsupported','no_history','mismatch','temporary_failure') AND
  jsonb_typeof(providers) = 'array' AND jsonb_array_length(providers) BETWEEN 1 AND 2 AND
  providers <@ '["carfax","autocheck"]'::jsonb AND
  (("erasedAt" IS NULL AND vin IS NOT NULL AND vin ~ '^[A-HJ-NPR-Z0-9]{17}$' AND "preflightEvidence" IS NOT NULL) OR
   ("erasedAt" IS NOT NULL AND vin IS NULL AND "preflightEvidence" IS NULL AND "offeredById" IS NULL)) AND
  ("acceptedAt" IS NULL OR ("preflightOutcome" = 'available' AND feasible))
);
ALTER TABLE history_capacity_days ADD CONSTRAINT history_capacity_limits CHECK (
  day ~ '^\d{4}-\d{2}-\d{2}$' AND "slotLimit" >= 0 AND "morningLimit" >= 0 AND "morningLimit" <= "slotLimit" AND mode = 'synthetic'
);
ALTER TABLE history_provider_allowances ADD CONSTRAINT history_provider_allowance_limits CHECK (
  provider IN ('carfax','autocheck') AND day ~ '^\d{4}-\d{2}-\d{2}$' AND allowance >= 0 AND consumed >= 0 AND consumed <= allowance AND mode = 'synthetic'
);
ALTER TABLE history_orders ADD CONSTRAINT history_orders_state CHECK (
  state IN ('held','expired','review','paid','purchasing','purchase_uncertain','fulfilling','delivered','recovery','refund_pending','refunded') AND version >= 0 AND
  ("paidAt" IS NULL OR "receivedAt" IS NOT NULL) AND
  (NOT "recoveryUsed" OR ("recoveryAgreedAt" IS NOT NULL AND "recoveryDeadline" IS NOT NULL))
);
ALTER TABLE history_payments ADD CONSTRAINT history_payments_state CHECK (
  state IN ('submitted','review','confirmed','duplicate') AND (amount IS NULL OR amount > 0) AND
  (state <> 'confirmed' OR (amount = 100 AND "receivedAt" IS NOT NULL AND "confirmedAt" IS NOT NULL))
);
ALTER TABLE history_purchase_intents ADD CONSTRAINT history_purchase_intents_state CHECK (
  state IN ('prepared','uncertain','completed','no_data','failed') AND jsonb_typeof(providers) = 'array'
);
ALTER TABLE history_refunds ADD CONSTRAINT history_refunds_state CHECK (
  state IN ('pending','approved','executed') AND
  (state <> 'executed' OR ("approvedAt" IS NOT NULL AND "executedAt" IS NOT NULL AND "executionReference" IS NOT NULL))
);

CREATE FUNCTION history_quote_facts_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."acceptedAt" IS NOT NULL AND ROW(NEW."requestId",NEW.vin,NEW.amount,NEW.providers,NEW."preflightOutcome",NEW."preflightEvidence",NEW."refundRule",NEW."windowStart",NEW."windowEnd",NEW.feasible,NEW."acceptedAt") IS DISTINCT FROM ROW(OLD."requestId",OLD.vin,OLD.amount,OLD.providers,OLD."preflightOutcome",OLD."preflightEvidence",OLD."refundRule",OLD."windowStart",OLD."windowEnd",OLD.feasible,OLD."acceptedAt") THEN
  -- Only the account lifecycle may remove personal linkage; it cannot rewrite the offer.
  IF NOT (OLD."erasedAt" IS NULL AND NEW."erasedAt" IS NOT NULL AND NEW.vin IS NULL AND NEW."preflightEvidence" IS NULL AND NEW."offeredById" IS NULL AND
   EXISTS (SELECT 1 FROM vehicle_history_requests WHERE id=OLD."requestId" AND "customerId" IS NULL) AND
   ROW(NEW."requestId",NEW.amount,NEW.providers,NEW."preflightOutcome",NEW."refundRule",NEW."windowStart",NEW."windowEnd",NEW.feasible,NEW."acceptedAt") IS NOT DISTINCT FROM ROW(OLD."requestId",OLD.amount,OLD.providers,OLD."preflightOutcome",OLD."refundRule",OLD."windowStart",OLD."windowEnd",OLD.feasible,OLD."acceptedAt")) THEN
   RAISE EXCEPTION 'history_quote_facts_immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_quote_facts_immutable BEFORE UPDATE ON history_quotes FOR EACH ROW EXECUTE FUNCTION history_quote_facts_immutable();
CREATE FUNCTION history_order_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."requestId",NEW."quoteId") IS DISTINCT FROM ROW(OLD."requestId",OLD."quoteId") THEN RAISE EXCEPTION 'history_order_identity_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_order_identity_immutable BEFORE UPDATE ON history_orders FOR EACH ROW EXECUTE FUNCTION history_order_identity_immutable();
