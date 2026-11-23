CREATE TABLE "history_payment_checks" (
  "requestId" TEXT NOT NULL,
  "orderId" UUID NOT NULL,
  "attemptKey" UUID NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "actorId" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "checkedAt" TIMESTAMPTZ(3) NOT NULL,
  "confirmedAt" TIMESTAMPTZ(3),
  "bookingCommitted" BOOLEAN NOT NULL,
  PRIMARY KEY ("requestId", "attemptKey"),
  UNIQUE ("requestId", "version"),
  FOREIGN KEY ("requestId", "orderId") REFERENCES "vehicle_history_orders"("requestId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CHECK ("input"->>'attemptKey' = "attemptKey"::text AND "input"->>'orderId' = "orderId"::text),
  CHECK (("input"->>'walletChecked')::boolean IS TRUE),
  CHECK ("input"->>'outcome' IN ('matched', 'partial', 'unmatched', 'uncertain')),
  CHECK (("input"->>'amountMinor')::integer BETWEEN 0 AND 100000000),
  CHECK (("confirmedAt" IS NOT NULL) = ("input"->>'outcome' = 'matched')),
  CHECK ("confirmedAt" IS NULL OR (("input"->>'amountMinor')::integer >= 10000 AND "input"->>'receivedAt' IS NOT NULL)),
  CHECK (NOT "bookingCommitted" OR "confirmedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "history_payment_checks_one_confirmation" ON "history_payment_checks"("requestId") WHERE "confirmedAt" IS NOT NULL;
CREATE RULE history_payment_check_immutable AS ON UPDATE TO history_payment_checks DO INSTEAD NOTHING;
