import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";

import { ExpireMeasurement } from "../jobs/ExpireMeasurement";

import { MEASUREMENT_RETENTION_QUEUE } from "./measurement-retention.scheduler";

@Processor(MEASUREMENT_RETENTION_QUEUE)
export class MeasurementRetentionProcessor extends WorkerHost {
 private readonly logger = new Logger(MeasurementRetentionProcessor.name);
 private lastSuccessAt: string | null = null;
 constructor(@Inject(ExpireMeasurement) private readonly sweep: ExpireMeasurement) { super(); }
 async process(): Promise<void> {
  try {
   const now = new Date(), result = await this.sweep.execute(now); this.lastSuccessAt = now.toISOString();
   const summary = JSON.stringify({ ...result, lastSuccessAt: this.lastSuccessAt });
   if (result.healthy) this.logger.log(`Measurement retention ${summary}`); else this.logger.error(`Measurement retention overdue ${summary}`);
  } catch {
   this.logger.error(`Measurement retention unavailable ${JSON.stringify({ lastSuccessAt: this.lastSuccessAt, healthy: false })}`);
   throw new Error("Measurement retention unavailable");
  }
 }
}
