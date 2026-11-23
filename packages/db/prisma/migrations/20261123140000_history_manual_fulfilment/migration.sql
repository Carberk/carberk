CREATE TABLE "history_fulfilment_events" (
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL CHECK ("version" > 0),
    "attemptKey" UUID NOT NULL,
    "input" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "assignmentVersion" INTEGER NOT NULL CHECK ("assignmentVersion" > 0),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "history_fulfilment_events_pkey" PRIMARY KEY ("requestId", "version"),
    CONSTRAINT "history_fulfilment_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "vehicle_history_orders"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (("state"->>'version')::integer = "version")
);

CREATE UNIQUE INDEX "history_fulfilment_events_requestId_attemptKey_key" ON "history_fulfilment_events"("requestId", "attemptKey");

CREATE RULE history_fulfilment_event_immutable AS ON UPDATE TO history_fulfilment_events DO INSTEAD NOTHING;
