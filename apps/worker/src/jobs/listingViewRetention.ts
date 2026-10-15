export const LISTING_VIEW_RETENTION_LEDGER = Symbol("ListingViewRetentionLedger");

/** No identifier or row data crosses this storage boundary. */
export interface ListingViewRetentionLedger {
  deleteExpired(now: Date, limit: number): Promise<number>;
  oldestExpired(now: Date): Promise<Date | null>;
}

export interface ListingViewRetentionHealth {
  lastSuccessAt: Date | null;
  oldestOverdueAt: Date | null;
  overdueMs: number;
  healthy: boolean;
}
