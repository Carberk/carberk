-- No default collector epoch: explicit preparation is required before collection.
CREATE TABLE "measurement_state" ("key" TEXT PRIMARY KEY, "epoch" TEXT NOT NULL);
CREATE TABLE "measurement_principals" (
 "id" TEXT PRIMARY KEY, "pseudonym" TEXT NOT NULL UNIQUE, "generation" TEXT NOT NULL UNIQUE,
 "epoch" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK ("kind" IN ('account', 'guest')),
 "userId" TEXT UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
 "capabilityHash" TEXT UNIQUE, "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "measurement_principal_shape" CHECK (
  ("kind" = 'account' AND "userId" IS NOT NULL AND "capabilityHash" IS NULL AND "expiresAt" IS NULL) OR
  ("kind" = 'guest' AND "userId" IS NULL AND "capabilityHash" IS NOT NULL AND "expiresAt" IS NOT NULL))
);
CREATE INDEX "measurement_principals_expiresAt_idx" ON "measurement_principals"("expiresAt");
CREATE TABLE "measurement_visits" (
 "id" TEXT PRIMARY KEY, "principalId" TEXT NOT NULL REFERENCES "measurement_principals"("id") ON DELETE CASCADE,
 "linkedAccountId" TEXT REFERENCES "measurement_principals"("id") ON DELETE CASCADE,
 "startedAt" TIMESTAMP(3) NOT NULL, "foregroundAt" TIMESTAMP(3) NOT NULL, "endedAt" TIMESTAMP(3),
 CONSTRAINT "measurement_visit_time" CHECK ("foregroundAt" >= "startedAt" AND ("endedAt" IS NULL OR "endedAt" >= "startedAt"))
);
CREATE INDEX "measurement_visits_principalId_idx" ON "measurement_visits"("principalId");
CREATE INDEX "measurement_visits_linkedAccountId_idx" ON "measurement_visits"("linkedAccountId");
CREATE TABLE "measurement_records" (
 "id" TEXT PRIMARY KEY, "principalId" TEXT NOT NULL REFERENCES "measurement_principals"("id") ON DELETE CASCADE,
 "visitId" TEXT REFERENCES "measurement_visits"("id") ON DELETE CASCADE,
 "event" JSONB NOT NULL, "origin" TEXT NOT NULL, "environment" TEXT NOT NULL, "population" TEXT NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "measurement_records_expiresAt_idx" ON "measurement_records"("expiresAt");
CREATE INDEX "measurement_records_principalId_occurredAt_idx" ON "measurement_records"("principalId", "occurredAt");
CREATE TABLE "measurement_outbox" (
 "id" TEXT PRIMARY KEY, "principalId" TEXT NOT NULL REFERENCES "measurement_principals"("id") ON DELETE CASCADE,
 "generation" TEXT NOT NULL, "epoch" TEXT NOT NULL, "environment" TEXT NOT NULL, "population" TEXT NOT NULL, "event" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "measurement_outbox_expiresAt_idx" ON "measurement_outbox"("expiresAt");
