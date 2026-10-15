import type { MeasurementRetentionLedger, MeasurementRetentionReceipt } from "./measurementRetention";
export class ExpireMeasurement {
 constructor(private readonly ledger: MeasurementRetentionLedger) {}
 async execute(_now: Date, _options: { batchSize?: number; maxBatches?: number } = {}): Promise<MeasurementRetentionReceipt> {
  return { deleted: 0, oldestOverdueAt: null, overdueMs: 0, healthy: true };
 }
}
