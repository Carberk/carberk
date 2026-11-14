-- CreateEnum
CREATE TYPE "ServiceMessagePurpose" AS ENUM ('vehicle_history');

-- CreateEnum
CREATE TYPE "ServiceMessageKind" AS ENUM ('TEXT');

-- CreateTable
CREATE TABLE "service_conversations" (
    "id" TEXT NOT NULL,
    "purpose" "ServiceMessagePurpose" NOT NULL,
    "objectId" TEXT NOT NULL,
    "lastOrder" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "kind" "ServiceMessageKind" NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL,
    "streamOrder" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_conversations_purpose_objectId_key" ON "service_conversations"("purpose", "objectId");

-- CreateIndex
CREATE INDEX "service_messages_senderId_idx" ON "service_messages"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "service_messages_conversationId_senderId_clientMessageId_key" ON "service_messages"("conversationId", "senderId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "service_messages_conversationId_streamOrder_key" ON "service_messages"("conversationId", "streamOrder");

-- AddForeignKey
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional storage invariants; Prisma cannot express CHECK constraints.
ALTER TABLE "service_conversations" ADD CONSTRAINT "service_conversations_order_check" CHECK ("lastOrder" >= 0);
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_order_check" CHECK ("streamOrder" > 0);
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_text_check"
    CHECK (char_length("text") BETWEEN 1 AND 4000 AND "text" !~ '^[[:space:]]*$');
