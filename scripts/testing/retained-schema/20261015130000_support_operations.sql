ALTER TABLE "support_cases" ADD COLUMN "unansweredSince" TIMESTAMP(3), ADD COLUMN "awaitingCustomerSince" TIMESTAMP(3), ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'ordinary', ADD COLUMN "investigationState" TEXT NOT NULL DEFAULT 'none', ADD COLUMN "escalatedAt" TIMESTAMP(3);
CREATE INDEX "support_cases_priority_unansweredSince_idx" ON "support_cases"("priority", "unansweredSince");
ALTER TABLE "service_audits" ADD COLUMN "reason" TEXT;
