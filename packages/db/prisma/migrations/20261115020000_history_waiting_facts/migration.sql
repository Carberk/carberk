-- Additive dormant facts. No legacy clock is inferred and no message is rewritten.
-- Forward-only: rollback the application while retaining these facts; never erase
-- suppression or an original outcome to roll back a deployment.
ALTER TABLE vehicle_history_requests
  ADD COLUMN "waitingReason" TEXT,
  ADD COLUMN "waitingSince" TIMESTAMPTZ(3),
  ADD COLUMN "waitingVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publicMessageId" TEXT,
  ADD COLUMN "publicMessageOrder" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "reminderUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminderMessageId" TEXT,
  ADD COLUMN "reminderSenderId" TEXT,
  ADD COLUMN "reminderClientMessageId" TEXT,
  ADD COLUMN "reminderText" TEXT,
  ADD COLUMN "reminderOrder" BIGINT,
  ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3),
  ADD COLUMN "declined" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remindersStopped" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lifecycleSourceId" TEXT,
  ADD COLUMN "lifecycleSourceVersion" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT history_waiting_version CHECK ("waitingVersion" >= 0),
  ADD CONSTRAINT history_waiting_clock CHECK (
    ("waitingReason" IS NULL AND "waitingSince" IS NULL) OR
    ("waitingReason" IS NOT NULL AND "waitingReason" IN ('customer_answer', 'quote_choice')
      AND "waitingSince" IS NOT NULL AND isfinite("waitingSince") AND "waitingVersion" > 0)
  ),
  ADD CONSTRAINT history_waiting_checkpoint CHECK (
    ("publicMessageId" IS NULL AND "publicMessageOrder" = 0) OR
    ("publicMessageId" IS NOT NULL AND length("publicMessageId") > 0 AND "publicMessageOrder" > 0)
  ),
  ADD CONSTRAINT history_waiting_source CHECK (
    ("lifecycleSourceId" IS NULL AND "lifecycleSourceVersion" = 0) OR
    ("lifecycleSourceId" IS NOT NULL AND length("lifecycleSourceId") > 0 AND "lifecycleSourceVersion" > 0)
  ),
  ADD CONSTRAINT history_waiting_outcome CHECK (
    (NOT "reminderUsed" AND num_nonnulls("reminderMessageId", "reminderSenderId", "reminderClientMessageId",
      "reminderText", "reminderOrder", "reminderSentAt") = 0) OR
    ("reminderUsed" AND num_nonnulls("reminderMessageId", "reminderSenderId", "reminderClientMessageId",
      "reminderText", "reminderOrder", "reminderSentAt") = 6 AND "reminderOrder" > 0 AND isfinite("reminderSentAt"))
  ),
  ADD CONSTRAINT history_waiting_initial CHECK (
    "waitingVersion" > 0 OR ("publicMessageOrder" = 0 AND NOT "reminderUsed"
      AND NOT declined AND NOT "remindersStopped" AND "lifecycleSourceVersion" = 0)
  );
