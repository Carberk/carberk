-- Additive: preserve existing lifetime counters; do not invent historical daily counts.
CREATE TABLE "listing_view_days" (
  "listingId" TEXT NOT NULL,
  "day" INTEGER NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0 CHECK ("count" >= 0),
  CONSTRAINT "listing_view_days_pkey" PRIMARY KEY ("listingId", "day"),
  CONSTRAINT "listing_view_days_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "listing_view_fingerprints" (
  "listingId" TEXT NOT NULL,
  "day" INTEGER NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "listing_view_fingerprints_pkey" PRIMARY KEY ("listingId", "day", "fingerprint"),
  CONSTRAINT "listing_view_fingerprints_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "listing_view_fingerprints_expiresAt_idx" ON "listing_view_fingerprints"("expiresAt");
