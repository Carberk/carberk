import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { MEASUREMENT_OUTBOX_QUEUE } from "./measurement-outbox.processor";
@Injectable()
export class MeasurementOutboxScheduler implements OnModuleInit {
  constructor(@InjectQueue(MEASUREMENT_OUTBOX_QUEUE) private readonly queue: Queue) {}
  async onModuleInit(): Promise<void> {
    const opts = { attempts: 5, backoff: { type: "exponential" as const, delay: 1000 }, removeOnComplete: 10, removeOnFail: 100 };
    await this.queue.upsertJobScheduler("measurement-outbox-minute", { every: 60_000 }, { name: "deliver", data: {}, opts });
    await this.queue.add("deliver", {}, { ...opts, jobId: "measurement-outbox-catch-up", removeOnComplete: true, removeOnFail: true });
  }
}
