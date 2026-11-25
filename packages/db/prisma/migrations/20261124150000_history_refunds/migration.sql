ALTER TYPE "StaffPurpose" ADD VALUE 'vehicle-history-refund-decision';
ALTER TYPE "StaffPurpose" ADD VALUE 'vehicle-history-refund-execution';

CREATE TABLE "history_refund_events" (
  "requestId" TEXT NOT NULL,
  "paymentVersion" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "attemptKey" UUID NOT NULL,
  "actorId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "input" JSONB NOT NULL,
  "externalReference" TEXT,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "history_refund_events_pkey" PRIMARY KEY ("requestId", "kind"),
  CONSTRAINT "history_refund_events_requestId_paymentVersion_fkey" FOREIGN KEY ("requestId", "paymentVersion")
    REFERENCES "history_payment_checks"("requestId", "version") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "history_refund_event_kind_check" CHECK (
    ("kind" = 'approve' AND "externalReference" IS NULL) OR
    ("kind" = 'execute' AND "externalReference" IS NOT NULL)
  ),
  CONSTRAINT "history_refund_event_amount_check" CHECK ("amountMinor" > 0)
);

CREATE UNIQUE INDEX "history_refund_events_requestId_attemptKey_key" ON "history_refund_events"("requestId", "attemptKey");
CREATE UNIQUE INDEX "history_refund_events_externalReference_key" ON "history_refund_events"("externalReference");

CREATE RULE history_refund_event_immutable AS ON UPDATE TO history_refund_events DO INSTEAD NOTHING;
