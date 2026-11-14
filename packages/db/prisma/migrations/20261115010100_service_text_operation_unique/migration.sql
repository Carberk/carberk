-- Standalone statement: CONCURRENTLY must run outside a transaction wrapper.
-- Ordinary NULL keys remain independent. Correct deployed migrations forward.
CREATE UNIQUE INDEX CONCURRENTLY "service_messages_conversationId_operationKey_key"
    ON "service_messages"("conversationId", "operationKey");
