export interface MeasurementRetentionLedger {
 deleteExpired(now: Date, limit: number): Promise<number>;
 oldestExpired(now: Date): Promise<Date | null>;
}
export interface MeasurementRetentionReceipt { deleted: number; oldestOverdueAt: Date | null; overdueMs: number; healthy: boolean }
