CREATE TABLE "history_recovery_events" (
  "requestId" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0 AND ("state"->>'version')::integer = "version"),
  "attemptKey" UUID,
  "input" JSONB,
  "state" JSONB NOT NULL,
  "actorId" TEXT,
  "assignmentVersion" INTEGER,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "history_recovery_events_pkey" PRIMARY KEY ("requestId", "version"),
  CONSTRAINT "history_recovery_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "vehicle_history_orders"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "history_recovery_events_requestId_attemptKey_key" ON "history_recovery_events"("requestId", "attemptKey");

CREATE RULE history_recovery_event_immutable AS ON UPDATE TO history_recovery_events DO INSTEAD NOTHING;
