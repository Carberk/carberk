import type { ListingViewRetentionLedger } from "../../listingViewRetention";

export class FakeListingViewRetentionLedger implements ListingViewRetentionLedger {
  readonly expiresAt: Date[] = [];
  failing = false;
  batchSizes: number[] = [];
  async deleteExpired(now: Date, limit: number): Promise<number> {
    if (this.failing) throw new Error("private-row-secret");
    this.batchSizes.push(limit);
    let deleted = 0;
    for (let i = this.expiresAt.length - 1; i >= 0 && deleted < limit; i--) {
      const expiry = this.expiresAt[i];
      if (expiry && expiry.getTime() <= now.getTime()) { this.expiresAt.splice(i, 1); deleted++; }
    }
    return deleted;
  }
  async oldestExpired(now: Date): Promise<Date | null> {
    return this.expiresAt.filter((date) => date <= now).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }
}
