import { describe, expect, it } from "vitest";

import { ExpireListingViewFingerprints } from "./ExpireListingViewFingerprints";
import { FakeListingViewRetentionLedger } from "./application/testing/FakeListingViewRetentionLedger";

const NOW = new Date("2026-10-14T18:55:00.000Z");

describe("Listing view fingerprint retention", () => {
  it("removes only due fingerprints including the exact UTC boundary and preserves current-day dedupe", async () => {
    const ledger = new FakeListingViewRetentionLedger();
    ledger.expiresAt.push(new Date("2026-10-14T18:54:59.999Z"), NOW, new Date("2026-10-15T18:55:00.000Z"));
    const sweep = new ExpireListingViewFingerprints(ledger);
    expect((await sweep.execute(NOW, { batchSize: 1 })).deleted).toBe(2);
    expect(ledger.expiresAt).toEqual([new Date("2026-10-15T18:55:00.000Z")]);
    expect((await sweep.execute(NOW)).deleted).toBe(0);
  });

  it("bounds backlog work and reports remaining overdue age instead of a false success", async () => {
    const ledger = new FakeListingViewRetentionLedger();
    ledger.expiresAt.push(...Array.from({ length: 7 }, () => new Date("2026-10-14T18:49:59.000Z")));
    const result = await new ExpireListingViewFingerprints(ledger).execute(NOW, { batchSize: 2, maxBatches: 2 });
    expect(result.deleted).toBe(4);
    expect(ledger.expiresAt).toHaveLength(3);
    expect(result.health).toEqual({ lastSuccessAt: NOW, oldestOverdueAt: new Date("2026-10-14T18:49:59.000Z"), overdueMs: 301_000, healthy: false });
  });

  it("never reports a database outage as successful deletion or leaks its error", async () => {
    const ledger = new FakeListingViewRetentionLedger(); ledger.failing = true;
    await expect(new ExpireListingViewFingerprints(ledger).execute(NOW)).rejects.toThrow("Listing view retention unavailable");
  });
});
