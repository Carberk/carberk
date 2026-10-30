ALTER TABLE "dealerships" ADD COLUMN "contactPhone" TEXT, ADD COLUMN "contactConfirmedAt" TIMESTAMP(3);
ALTER TABLE "listings" ADD COLUMN "businessId" TEXT REFERENCES "dealerships"("id") ON DELETE RESTRICT,
 ADD COLUMN "availabilityConfirmedAt" TIMESTAMP(3), ADD COLUMN "lastEditedById" TEXT;
ALTER TABLE "listing_drafts" ADD COLUMN "businessId" TEXT REFERENCES "dealerships"("id") ON DELETE RESTRICT;
ALTER TABLE "media_uploads" ADD COLUMN "businessId" TEXT REFERENCES "dealerships"("id") ON DELETE RESTRICT;
ALTER TABLE "otp_requests" ADD COLUMN "businessId" TEXT;
CREATE INDEX "listings_business_inventory" ON "listings"("businessId", "status", "updatedAt" DESC);
CREATE INDEX "listing_drafts_business_inventory" ON "listing_drafts"("businessId", "updatedAt" DESC);
CREATE INDEX "media_uploads_business_owner" ON "media_uploads"("businessId", "createdAt");
