-- CreateTable
CREATE TABLE "support_cases" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "assigneeId" TEXT,
    "assignmentVersion" INTEGER NOT NULL DEFAULT 0,
    "sourceListingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "mode" TEXT NOT NULL DEFAULT 'synthetic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_history_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "assigneeId" TEXT,
    "assignmentVersion" INTEGER NOT NULL DEFAULT 0,
    "sourceListingId" TEXT,
    "proposedVin" TEXT,
    "confirmedVin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enquiry',
    "mode" TEXT NOT NULL DEFAULT 'synthetic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_history_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_conversations" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "supportCaseId" TEXT,
    "historyRequestId" TEXT,
    "lifecycleEpoch" INTEGER NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "erasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderKind" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'customer',
    "body" TEXT,
    "attachmentId" TEXT,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_attachments" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "lifecycleEpoch" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "stagingKey" TEXT NOT NULL,
    "objectKey" TEXT,
    "contentType" TEXT NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "filename" TEXT NOT NULL,
    "rights" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "adoptedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "service_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_read_states" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_read_states_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "service_audits" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "purpose" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetStaffId" TEXT,
    "assignmentVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_outbox" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "visibility" TEXT NOT NULL,
    "lifecycleEpoch" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_erasure_fences" (
    "conversationId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "objectKeys" JSONB NOT NULL,
    "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanupCompletedAt" TIMESTAMP(3),

    CONSTRAINT "service_erasure_fences_pkey" PRIMARY KEY ("conversationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_customerId_key" ON "support_cases"("customerId");

-- CreateIndex
CREATE INDEX "support_cases_assigneeId_status_createdAt_idx" ON "support_cases"("assigneeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_history_requests_customerId_createdAt_idx" ON "vehicle_history_requests"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_history_requests_assigneeId_status_createdAt_idx" ON "vehicle_history_requests"("assigneeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_conversations_supportCaseId_key" ON "service_conversations"("supportCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "service_conversations_historyRequestId_key" ON "service_conversations"("historyRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "service_messages_attachmentId_key" ON "service_messages"("attachmentId");

-- CreateIndex
CREATE INDEX "service_messages_conversationId_createdAt_idx" ON "service_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_messages_conversationId_senderId_clientMessageId_key" ON "service_messages"("conversationId", "senderId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "service_messages_conversationId_sequence_key" ON "service_messages"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "service_attachments_stagingKey_key" ON "service_attachments"("stagingKey");

-- CreateIndex
CREATE UNIQUE INDEX "service_attachments_objectKey_key" ON "service_attachments"("objectKey");

-- CreateIndex
CREATE INDEX "service_attachments_state_expiresAt_idx" ON "service_attachments"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "service_audits_purpose_resourceId_createdAt_idx" ON "service_audits"("purpose", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "service_outbox_deliveredAt_nextAttemptAt_idx" ON "service_outbox"("deliveredAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_outbox_conversationId_eventType_sequence_key" ON "service_outbox"("conversationId", "eventType", "sequence");

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_history_requests" ADD CONSTRAINT "vehicle_history_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_history_requests" ADD CONSTRAINT "vehicle_history_requests_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_history_requests" ADD CONSTRAINT "vehicle_history_requests_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_conversations" ADD CONSTRAINT "service_conversations_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "support_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_conversations" ADD CONSTRAINT "service_conversations_historyRequestId_fkey" FOREIGN KEY ("historyRequestId") REFERENCES "vehicle_history_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "service_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_read_states" ADD CONSTRAINT "service_read_states_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_read_states" ADD CONSTRAINT "service_read_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_audits" ADD CONSTRAINT "service_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_outbox" ADD CONSTRAINT "service_outbox_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_erasure_fences" ADD CONSTRAINT "service_erasure_fences_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Purpose identity is exact and cannot alias a Listing Conversation.
ALTER TABLE "service_conversations" ADD CONSTRAINT "service_owner_exactly_one" CHECK (
 ("purpose" = 'support' AND "supportCaseId" IS NOT NULL AND "historyRequestId" IS NULL) OR
 ("purpose" = 'history' AND "historyRequestId" IS NOT NULL AND "supportCaseId" IS NULL));
ALTER TABLE "support_cases" ADD CONSTRAINT "support_mode" CHECK ("mode" IN ('synthetic','live'));
ALTER TABLE "vehicle_history_requests" ADD CONSTRAINT "history_mode" CHECK ("mode" IN ('synthetic','live'));
ALTER TABLE "service_messages" ADD CONSTRAINT "service_message_shape" CHECK (
 "sequence" > 0 AND "senderKind" IN ('customer','staff') AND "visibility" IN ('customer','staff') AND
 ("body" IS NOT NULL OR "attachmentId" IS NOT NULL));
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachment_shape" CHECK (
 "state" IN ('staged','adopted','removed') AND "visibility" IN ('customer','staff') AND
 "expectedBytes" > 0 AND "expectedBytes" <= 20971520 AND
 ("state" <> 'adopted' OR ("objectKey" IS NOT NULL AND "sha256" IS NOT NULL AND "sizeBytes" > 0)));
ALTER TABLE "service_conversations" ADD CONSTRAINT "service_epoch_sequence" CHECK ("lifecycleEpoch" >= 0 AND "lastSequence" >= 0);
ALTER TABLE "support_cases" ADD CONSTRAINT "support_assignment_version" CHECK ("assignmentVersion" >= 0);
ALTER TABLE "vehicle_history_requests" ADD CONSTRAINT "history_assignment_version" CHECK ("assignmentVersion" >= 0);

-- Explicit confirmation belongs to History, never a later source Listing edit.
CREATE FUNCTION service_confirmed_vin_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."confirmedVin" IS NOT NULL AND NEW."confirmedVin" IS DISTINCT FROM OLD."confirmedVin" THEN
  RAISE EXCEPTION 'Confirmed VIN requires a new separately confirmed order';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_confirmed_vin_guard BEFORE UPDATE ON "vehicle_history_requests" FOR EACH ROW EXECUTE FUNCTION service_confirmed_vin_immutable();

-- A lifecycle fence persists after content removal and prevents stale retries.
CREATE FUNCTION service_erasure_epoch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."erasedAt" IS NOT NULL AND (NEW."erasedAt" IS NULL OR NEW."lifecycleEpoch" < OLD."lifecycleEpoch") THEN
  RAISE EXCEPTION 'Erased service content cannot be restored';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_erasure_guard BEFORE UPDATE ON "service_conversations" FOR EACH ROW EXECUTE FUNCTION service_erasure_epoch_guard();
