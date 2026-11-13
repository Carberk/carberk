-- Additive only; no existing marketplace role receives a grant.
CREATE TYPE "StaffPurpose" AS ENUM ('vehicle-history');
CREATE TABLE "staff_grants" (
    "userId" TEXT NOT NULL,
    "purpose" "StaffPurpose" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "staff_grants_pkey" PRIMARY KEY ("userId", "purpose"),
    CONSTRAINT "staff_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
