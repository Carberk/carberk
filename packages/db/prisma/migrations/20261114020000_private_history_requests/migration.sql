-- Additive local-synthetic foundation. Rollback: disable entry, then a forward
-- migration may drop this table only after its private-data lifecycle is settled.
CREATE TABLE "vehicle_history_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "attemptKey" UUID NOT NULL,
    "creatorSessionId" TEXT NOT NULL,
    "sourceListingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_history_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_history_requests_requesterId_attemptKey_key"
    ON "vehicle_history_requests"("requesterId", "attemptKey");
CREATE INDEX "vehicle_history_requests_requesterId_createdAt_id_idx"
    ON "vehicle_history_requests"("requesterId", "createdAt", "id");
ALTER TABLE "vehicle_history_requests" ADD CONSTRAINT "vehicle_history_requests_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
