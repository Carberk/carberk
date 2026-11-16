import type { ListingSummary } from "../../listings/domain/ports/ListingsReadPort";
import type { PostRefMessageMetadata } from "../domain/types";

export function buildPostRefSnapshot(
  listing: ListingSummary,
): PostRefMessageMetadata {
  const snapshot: PostRefMessageMetadata = {
    listingId: listing.id,
    brandId: listing.brandId,
    modelId: listing.modelId,
    displayPriceTmt: listing.displayPriceTmt,
    priceCurrency: listing.priceCurrency,
    status: listing.status,
  };

  if (listing.year !== undefined) {
    snapshot.year = listing.year;
  }

  if (listing.coverMediaKey) {
    snapshot.coverMediaKey = listing.coverMediaKey;
    if (listing.coverThumbHash) snapshot.coverThumbHash = listing.coverThumbHash;
  }

  return snapshot;
}

export function isListingReferenceActive(
  listing: ListingSummary | null | undefined,
): boolean {
  return listing?.status === "active";
}

export function availabilityMapForListingSummaries(
  listings: ListingSummary[],
): Map<string, boolean> {
  return new Map(
    listings.map((listing) => [
      listing.id,
      isListingReferenceActive(listing),
    ]),
  );
}

export function withAvailabilityFallback(
  metadata: PostRefMessageMetadata,
  availabilityMap: Map<string, boolean>,
): PostRefMessageMetadata & { available: boolean } {
  return {
    ...metadata,
    available: availabilityMap.get(metadata.listingId) ?? false,
  };
}
