CREATE TABLE "history_replacement_events" (
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL CHECK ("version" > 0),
    "attemptKey" UUID NOT NULL,
    "input" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "assignmentVersion" INTEGER NOT NULL CHECK ("assignmentVersion" > 0),
    "acceptedRevision" INTEGER NOT NULL CHECK ("acceptedRevision" >= 0),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "bookingDay" TEXT,
    "bookingFrom" TIMESTAMPTZ(3),
    "bookingBy" TIMESTAMPTZ(3),
    "bookingProvider" TEXT,

    CONSTRAINT "history_replacement_events_pkey" PRIMARY KEY ("requestId", "version"),
    CONSTRAINT "history_replacement_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "vehicle_history_orders"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (("state"->>'version')::integer = "version"),
    CHECK (("state"->>'status' = 'accepted' AND "bookingDay" IS NOT NULL AND "bookingFrom" IS NOT NULL
         AND "bookingBy" > "bookingFrom" AND "bookingBy" IS NOT NULL AND "bookingProvider" IS NOT NULL)
      OR ("state"->>'status' IN ('proposed', 'refund_decision_pending') AND "bookingDay" IS NULL
         AND "bookingFrom" IS NULL AND "bookingBy" IS NULL AND "bookingProvider" IS NULL))
);

CREATE UNIQUE INDEX "history_replacement_events_requestId_attemptKey_key" ON "history_replacement_events"("requestId", "attemptKey");
CREATE UNIQUE INDEX "history_replacement_events_one_booking" ON "history_replacement_events"("requestId") WHERE "bookingDay" IS NOT NULL;
CREATE RULE history_replacement_event_immutable AS ON UPDATE TO history_replacement_events DO INSTEAD NOTHING;
