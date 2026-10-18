-- Optional public business information. Unknown values stay null.
ALTER TABLE "dealerships"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "hours" TEXT,
  ADD COLUMN "services" TEXT;
