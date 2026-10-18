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

-- Requeue at the same commit as removal/suspension, including account purge.
-- These writers already hold the affected User; lock business before Conversation.
CREATE FUNCTION requeue_departed_business_enquiries() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  departed_id TEXT;
  owned_business TEXT;
  changed RECORD;
  reason TEXT;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW."suspendedAt" IS NULL AND NEW."deletionScheduledAt" IS NULL THEN RETURN NEW; END IF;
    departed_id := NEW."id";
    reason := 'user_inactive';
  ELSE
    IF TG_OP = 'UPDATE' AND NEW."status" = 'active' THEN RETURN NEW; END IF;
    departed_id := OLD."userId";
    reason := 'membership_revoked';
  END IF;
  FOR owned_business IN SELECT DISTINCT "businessId" FROM "conversations"
    WHERE "assigneeId" = departed_id AND "businessId" IS NOT NULL ORDER BY "businessId"
  LOOP
    PERFORM "id" FROM "dealerships" WHERE "id" = owned_business FOR UPDATE;
    FOR changed IN UPDATE "conversations" SET "assigneeId" = NULL, "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP WHERE "businessId" = owned_business AND "assigneeId" = departed_id
      RETURNING "id", "version", "enquiryState"
    LOOP
      INSERT INTO "business_enquiry_audits" ("id", "conversationId", "version", "action", "previousAssigneeId", "enquiryState")
        VALUES (gen_random_uuid()::text, changed."id", changed."version", reason, departed_id, changed."enquiryState");
    END LOOP;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_enquiry_membership_revocation
  AFTER DELETE OR UPDATE OF "status" ON "dealership_members"
  FOR EACH ROW EXECUTE FUNCTION requeue_departed_business_enquiries();
CREATE TRIGGER business_enquiry_user_revocation
  AFTER UPDATE OF "suspendedAt", "deletionScheduledAt" ON "users"
  FOR EACH ROW EXECUTE FUNCTION requeue_departed_business_enquiries();
