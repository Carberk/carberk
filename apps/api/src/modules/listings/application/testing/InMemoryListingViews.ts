import type { ListingViewsPort } from "../../domain/ports/ListingViewsPort";

export class InMemoryListingViews implements ListingViewsPort {
  readonly records: Parameters<ListingViewsPort["record"]>[0][] = [];
  readonly totals = new Map<string, { viewCount: number; viewsToday: number }>();
  async record(input: Parameters<ListingViewsPort["record"]>[0]): Promise<boolean> {
    this.records.push(input);
    return true;
  }
  async counts(listingId: string): Promise<{ viewCount: number; viewsToday: number }> {
    return this.totals.get(listingId) ?? { viewCount: 0, viewsToday: 0 };
  }
}
