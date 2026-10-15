import type { MeasurementRetentionLedger, MeasurementRetentionReceipt } from "./measurementRetention";
export class ExpireMeasurement {
 constructor(private readonly ledger: MeasurementRetentionLedger) {}
 async execute(now: Date, options: { batchSize?: number; maxBatches?: number } = {}): Promise<MeasurementRetentionReceipt> {
  const size = options.batchSize ?? 500, batches = options.maxBatches ?? 20;
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(size) || size < 1 || size > 1000 || !Number.isInteger(batches) || batches < 1 || batches > 100) throw new Error("Invalid measurement retention bounds");
  const start = performance.now(); let deleted = 0;
  try {
   for (let batch = 0; batch < batches && performance.now() - start < 30000; batch++) {
    const count = await this.ledger.deleteExpired(now, size); deleted += count; if (count < size) break;
   }
   const oldestOverdueAt = await this.ledger.oldestExpired(now);
   const overdueMs = oldestOverdueAt ? Math.max(0, now.getTime() - oldestOverdueAt.getTime()) : 0;
   return { deleted, oldestOverdueAt, overdueMs, healthy: !oldestOverdueAt || overdueMs < 86400000 };
  } catch { throw new Error("Measurement retention unavailable"); }
 }
}
