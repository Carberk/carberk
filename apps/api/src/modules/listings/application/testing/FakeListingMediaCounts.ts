import type { ListingMediaCounts } from "../ports/ListingMediaCounts";

export class FakeListingMediaCounts implements ListingMediaCounts {
  photoCount = 3;
  mediaCount = 0;

  async count(_listingId: string, kind?: "image"): Promise<number> {
    return kind === "image" ? this.photoCount : this.mediaCount;
  }
}
