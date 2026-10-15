-- Business responsibility is independent of the creating seller User.
ALTER TABLE "conversations" ADD COLUMN "businessId" TEXT,
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "enquiryState" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_enquiry_state"
  CHECK ("enquiryState" IN ('open', 'closed') AND "version" >= 0);
-- A pre-cutover thread on shared stock keeps its buyer/history, with no inherited assignee.
UPDATE "conversations" AS c SET "businessId" = l."businessId"
  FROM "listings" AS l WHERE c."listingId" = l."id" AND l."businessId" IS NOT NULL;
CREATE INDEX "conversations_business_inbox" ON "conversations"
  ("businessId", "enquiryState", "assigneeId", "updatedAt" DESC);
CREATE TABLE "business_enquiry_audits" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "previousAssigneeId" TEXT,
  "assigneeId" TEXT,
  "enquiryState" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_enquiry_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_enquiry_audits_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_enquiry_audits_state" CHECK ("enquiryState" IN ('open', 'closed') AND "version" > 0)
);
CREATE UNIQUE INDEX "business_enquiry_audits_conversationId_version_key"
  ON "business_enquiry_audits"("conversationId", "version");
