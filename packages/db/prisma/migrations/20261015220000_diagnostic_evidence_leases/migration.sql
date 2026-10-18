-- AlterTable
ALTER TABLE "diagnostic_evidence" ADD COLUMN     "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cleanupFailureCode" TEXT,
ADD COLUMN     "cleanupLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "writeLeaseUntil" TIMESTAMP(3);

-- Forward-only compatibility: older readers ignore these nullable lease fields.
ALTER TABLE diagnostic_evidence ADD CONSTRAINT diagnostic_evidence_cleanup_attempts CHECK ("cleanupAttempts">=0);
