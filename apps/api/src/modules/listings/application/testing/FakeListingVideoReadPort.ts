import type { ListingVideoProjection, ListingVideoReadPort } from "../../domain/ports/ListingVideoReadPort";

export class FakeListingVideoReadPort implements ListingVideoReadPort {
  async getForTarget(): Promise<ListingVideoProjection | null> { return {}; }
  async getForListings(): Promise<Map<string, ListingVideoProjection>> { return new Map(); }
}
