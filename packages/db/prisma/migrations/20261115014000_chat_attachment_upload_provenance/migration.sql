-- Additive, empty issuance ledger. No historical key can acquire an inferred issuer.
CREATE TABLE "chat_attachment_uploads" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_attachment_uploads_metadata_check"
      CHECK ("contentType" = 'image/webp' AND "sizeBytes" BETWEEN 1 AND 5242880),
    CONSTRAINT "chat_attachment_uploads_senderId_fkey"
      FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_attachment_uploads_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_attachment_uploads_senderId_idx" ON "chat_attachment_uploads"("senderId");
CREATE INDEX "chat_attachment_uploads_conversationId_idx" ON "chat_attachment_uploads"("conversationId");
