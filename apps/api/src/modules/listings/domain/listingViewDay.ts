const DAY_MS = 86_400_000;
const ASHGABAT_OFFSET_MS = 18_000_000;
/** #899 must remove eligible rows within this healthy scheduling + execution budget. */
export const LISTING_VIEW_CLEANUP_BUDGET_MS = 300_000;

export function listingViewDay(now: Date): { day: number; expiresAt: Date } {
  const day = Math.floor((now.getTime() + ASHGABAT_OFFSET_MS) / DAY_MS);
  return {
    day,
    // Earliest insert: 47h55m eligibility + <=5m healthy cleanup = <=48h.
    // Always after the current day, so cleanup cannot erase today's dedupe.
    expiresAt: new Date((day + 2) * DAY_MS - ASHGABAT_OFFSET_MS - LISTING_VIEW_CLEANUP_BUDGET_MS),
  };
}
