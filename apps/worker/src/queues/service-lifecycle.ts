import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job, Queue } from "bullmq";

import { AdvanceHistoryOrders } from "../jobs/AdvanceHistoryOrders";
import { ExpireServiceContent } from "../jobs/ExpireServiceContent";

export const SERVICE_LIFECYCLE_QUEUE = "service-lifecycle";
@Injectable()
export class ServiceLifecycleScheduler implements OnModuleInit {
 constructor(@InjectQueue(SERVICE_LIFECYCLE_QUEUE) private readonly queue: Queue) {}
 async onModuleInit(): Promise<void> {
  await this.queue.upsertJobScheduler("minute-history-commitments", { every: 60000 }, { name: "advance-history", data: {}, opts: { attempts: 5, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: 10, removeOnFail: 50 } });
  await this.queue.upsertJobScheduler("hourly-service-lifecycle", { every: 3600000 }, { name: "expire-private-content", data: {}, opts: { attempts: 5, backoff: { type: "exponential", delay: 60000 }, removeOnComplete: 24, removeOnFail: 50 } });
 }
}
@Processor(SERVICE_LIFECYCLE_QUEUE)
export class ServiceLifecycleProcessor extends WorkerHost {
 constructor(@Inject(ExpireServiceContent) private readonly expiry: ExpireServiceContent, @Inject(AdvanceHistoryOrders) private readonly history: AdvanceHistoryOrders) { super(); }
 async process(job: Job): Promise<void> { if (job.name === "advance-history") await this.history.execute(new Date()); else await this.expiry.execute(new Date()); }
}
