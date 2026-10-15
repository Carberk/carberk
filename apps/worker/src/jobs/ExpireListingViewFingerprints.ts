import type { ListingViewRetentionHealth, ListingViewRetentionLedger } from "./listingViewRetention";

/** Scheduler and execution together must consume the API's five-minute margin. */
const RETENTION_BUDGET_MS = 300_000;

export class ExpireListingViewFingerprints {
  private lastSuccessAt: Date | null = null;
  constructor(private readonly ledger: ListingViewRetentionLedger) {}

  async execute(now: Date, options: { batchSize?: number; maxBatches?: number; budgetMs?: number } = {}): Promise<{ deleted: number; health: ListingViewRetentionHealth }> {
    const batchSize = options.batchSize ?? 1000;
    const maxBatches = options.maxBatches ?? 100;
    const budgetMs = options.budgetMs ?? 30_000;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 ||
      !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100 ||
      !Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 30_000 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Listing view retention bounds");
    }
    const started = performance.now();
    let deleted = 0;
    try {
      for (let batch = 0; batch < maxBatches && performance.now() - started < budgetMs; batch++) {
        const count = await this.ledger.deleteExpired(now, batchSize);
        deleted += count;
        if (count < batchSize) break;
      }
      const oldestOverdueAt = await this.ledger.oldestExpired(now);
      const overdueMs = oldestOverdueAt ? Math.max(0, now.getTime() - oldestOverdueAt.getTime()) : 0;
      this.lastSuccessAt = now;
      return { deleted, health: { lastSuccessAt: this.lastSuccessAt, oldestOverdueAt, overdueMs,
        healthy: oldestOverdueAt === null || overdueMs + (performance.now() - started) < RETENTION_BUDGET_MS } };
    } catch {
      // Database errors may contain SQL/parameters. They never enter job failures or logs.
      throw new Error("Listing view retention unavailable");
    }
  }
}
