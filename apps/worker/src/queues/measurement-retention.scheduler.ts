import { Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

export const MEASUREMENT_RETENTION_QUEUE = "measurement-retention";
@Injectable()
export class MeasurementRetentionScheduler implements OnModuleInit {
 constructor(@InjectQueue(MEASUREMENT_RETENTION_QUEUE) private readonly queue: Queue) {}
 async onModuleInit(): Promise<void> {
  const opts = { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 10, removeOnFail: 100 };
  await this.queue.upsertJobScheduler("measurement-retention-daily", { every: 86400000 }, { name: "sweep", data: {}, opts });
  await this.queue.add("sweep", {}, { ...opts, jobId: "measurement-retention-catch-up", removeOnComplete: true, removeOnFail: true });
 }
}
