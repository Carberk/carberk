-- CreateTable
CREATE TABLE "service_push_subscriptions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lifecycleEpoch" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_push_subscriptions_sessionId_deviceId_conversationId_key" ON "service_push_subscriptions"("sessionId", "deviceId", "conversationId");
CREATE INDEX "service_push_subscriptions_conversationId_lifecycleEpoch_idx" ON "service_push_subscriptions"("conversationId", "lifecycleEpoch");
CREATE INDEX "service_push_subscriptions_sessionId_deviceId_idx" ON "service_push_subscriptions"("sessionId", "deviceId");

ALTER TABLE "service_push_subscriptions" ADD CONSTRAINT "service_push_subscriptions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_push_subscriptions" ADD CONSTRAINT "service_push_subscriptions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "fcm_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_push_subscriptions" ADD CONSTRAINT "service_push_subscriptions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "service_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
