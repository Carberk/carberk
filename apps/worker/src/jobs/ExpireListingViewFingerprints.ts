import type { ListingViewRetentionHealth, ListingViewRetentionLedger } from "./listingViewRetention";

export class ExpireListingViewFingerprints {
  constructor(private readonly ledger: ListingViewRetentionLedger) {}
  async execute(_now: Date, _options?: { batchSize?: number; maxBatches?: number; budgetMs?: number }): Promise<{ deleted: number; health: ListingViewRetentionHealth }> {
    return { deleted: 0, health: { lastSuccessAt: null, oldestOverdueAt: null, overdueMs: 0, healthy: true } };
  }
}
