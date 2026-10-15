import { describe, expect, it } from "vitest";
import { listingViewDay, LISTING_VIEW_CLEANUP_BUDGET_MS } from "./listingViewDay";

describe("Listing views use the Ashgabat calendar and bounded retention", () => {
  it("changes day at 19:00 UTC, not UTC midnight", () => {
    expect(listingViewDay(new Date("2026-10-14T18:59:59.999Z")).day).toBe(20740);
    expect(listingViewDay(new Date("2026-10-14T19:00:00Z")).day).toBe(20741);
    expect(listingViewDay(new Date("2026-10-15T00:00:00Z")).day).toBe(20741);
  });
  it("reserves five minutes of healthy cleanup budget without deleting today's dedupe", () => {
    const start = new Date("2026-10-14T19:00:00Z");
    const last = new Date("2026-10-15T18:59:59.999Z");
    const { expiresAt } = listingViewDay(start);
    expect(expiresAt.toISOString()).toBe("2026-10-16T18:55:00.000Z");
    expect(listingViewDay(last).expiresAt).toEqual(expiresAt);
    expect(expiresAt.getTime() + LISTING_VIEW_CLEANUP_BUDGET_MS - start.getTime()).toBe(172800000);
    expect(expiresAt.getTime()).toBeGreaterThan(last.getTime());
  });
  it("crosses the Ashgabat year boundary consistently", () => {
    expect(listingViewDay(new Date("2026-12-31T19:00:00Z")).expiresAt.toISOString()).toBe("2027-01-02T18:55:00.000Z");
  });
});
