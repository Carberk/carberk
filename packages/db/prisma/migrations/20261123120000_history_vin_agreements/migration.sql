CREATE TABLE "history_vin_agreements" (
  "requestId" TEXT NOT NULL REFERENCES "vehicle_history_orders"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "attemptKey" UUID,
  "input" JSONB NOT NULL,
  "state" JSONB NOT NULL,
  "reservedProvider" TEXT NOT NULL CHECK ("reservedProvider" IN ('Carfax', 'AutoCheck')),
  "actorId" TEXT NOT NULL,
  "assignmentVersion" INTEGER NOT NULL CHECK ("assignmentVersion" >= 0),
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("requestId", "version"),
  UNIQUE ("requestId", "attemptKey"),
  CHECK (("state"->>'version')::integer = "version"),
  CHECK ("input"->>'kind' IN ('request', 'review', 'accept', 'handoff'))
);
CREATE RULE history_vin_agreement_immutable AS ON UPDATE TO history_vin_agreements DO INSTEAD NOTHING;
