-- Additive only: preserve existing message bytes and ordinary null-key intents.
ALTER TABLE "service_messages" ADD COLUMN "operationKey" TEXT;
