ALTER TABLE "dealerships"
 ADD COLUMN "status" TEXT NOT NULL DEFAULT 'recovery',
 ADD COLUMN "admissionMode" TEXT NOT NULL DEFAULT 'synthetic',
 ADD COLUMN "admittedAt" TIMESTAMP(3),
 ADD COLUMN "checkedEvidence" TEXT,
 ADD CONSTRAINT "dealership_status_check" CHECK ("status" IN ('active','suspended','recovery')),
 ADD CONSTRAINT "dealership_admission_check" CHECK ("admissionMode" IN ('synthetic','checked'));
ALTER TABLE "dealership_members" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
 ADD CONSTRAINT "dealership_member_status_check" CHECK ("status" IN ('active','suspended'));
-- Existing scaffolding stays protected until explicitly admitted. Multiple owners
-- must be reconciled by the operator rather than silently dropping ownership.
CREATE UNIQUE INDEX "dealership_one_owner" ON "dealership_members" ("dealershipId") WHERE "role" = 'owner';
CREATE TABLE "dealership_invitations" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "dealershipId" TEXT NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
 "recipientUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "role" "DealershipMemberRole" NOT NULL DEFAULT 'sales',
 "tokenHash" TEXT NOT NULL UNIQUE,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3),
 "redeemedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "dealership_invitations_dealershipId_idx" ON "dealership_invitations"("dealershipId");
