import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";

import { RecomputeImprovement } from "../measurement/RecomputeImprovement";
import { MeasurementOutboxDelivery } from "../jobs/measurementOutbox";
export const MEASUREMENT_OUTBOX_QUEUE = "measurement-outbox";
@Processor(MEASUREMENT_OUTBOX_QUEUE)
export class MeasurementOutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(MeasurementOutboxProcessor.name);
  constructor(@Inject(MeasurementOutboxDelivery) private readonly delivery: MeasurementOutboxDelivery,@Inject(RecomputeImprovement) private readonly improvement:RecomputeImprovement) { super(); }
  async process(): Promise<void> {
    try { const result = await this.delivery.deliver(); await this.improvement.execute(); this.logger.log(`Measurement outbox delivery ${JSON.stringify(result)}`); }
    catch { this.logger.error("Measurement outbox delivery unavailable"); throw new Error("Measurement outbox delivery unavailable"); }
  }
}
