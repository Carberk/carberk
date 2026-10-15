import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

import { DeliverServicePush } from "../jobs/DeliverServicePush";
export const SERVICE_PUSH_QUEUE = "service-push";
@Injectable()
export class ServicePushScheduler implements OnModuleInit {
 constructor(@InjectQueue(SERVICE_PUSH_QUEUE) private readonly queue: Queue) {}
 async onModuleInit(): Promise<void> { await this.queue.upsertJobScheduler("service-push-minute", { every: 60000 }, { name: "deliver", data: {}, opts: { attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 10, removeOnFail: 50 } }); }
}
@Processor(SERVICE_PUSH_QUEUE)
export class ServicePushProcessor extends WorkerHost {
 constructor(@Inject(DeliverServicePush) private readonly delivery: DeliverServicePush) { super(); }
 async process(): Promise<void> { await this.delivery.execute(new Date()); }
}
