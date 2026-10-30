import { createHash } from "node:crypto";
export function diagnosticListingDigest(listing: { id: string; sellerId: string; businessId: string | null; vin: string | null; brandId: string; modelId: string; year: number | null }): string {
  return createHash("sha256").update(JSON.stringify([listing.id, listing.sellerId, listing.businessId, listing.vin?.trim().toUpperCase() ?? null, listing.brandId, listing.modelId, listing.year])).digest("hex");
}
