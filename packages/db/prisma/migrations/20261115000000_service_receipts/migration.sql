-- Additive synthetic foundation. Rollback: disable receipt routes; retain facts
-- until a separately reviewed forward migration settles their private lifecycle.
CREATE TABLE "service_receipts" (
    "conversationId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "assignmentVersion" INTEGER NOT NULL,
    "receivedOrder" BIGINT NOT NULL DEFAULT 0,
    "readOrder" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "service_receipts_pkey" PRIMARY KEY ("conversationId", "participantId", "assignmentVersion"),
    CONSTRAINT "service_receipts_progress_check" CHECK ("assignmentVersion" >= 0 AND "readOrder" >= 0 AND "receivedOrder" >= "readOrder"),
    CONSTRAINT "service_receipts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_receipts_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "service_receipts_participantId_idx" ON "service_receipts"("participantId");

CREATE TABLE "service_message_offers" (
    "conversationId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assignmentVersion" INTEGER NOT NULL,
    "offeredOrder" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "service_message_offers_pkey" PRIMARY KEY ("conversationId", "participantId", "sessionId", "assignmentVersion"),
    CONSTRAINT "service_message_offers_progress_check" CHECK ("assignmentVersion" >= 0 AND "offeredOrder" >= 0),
    CONSTRAINT "service_message_offers_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_message_offers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "service_message_offers_sessionId_idx" ON "service_message_offers"("sessionId");
