import { Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

export const LISTING_VIEW_RETENTION_QUEUE = "listing-view-retention";

@Injectable()
export class ListingViewRetentionScheduler implements OnModuleInit {
  constructor(@InjectQueue(LISTING_VIEW_RETENTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const opts = { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 10, removeOnFail: 100 };
    await this.queue.upsertJobScheduler("listing-view-retention-minute", { every: 60_000 }, { name: "sweep", data: {}, opts });
    // Same startup ID coalesces simultaneous replicas. Minute triggers survive a failed catch-up.
    await this.queue.add("sweep", {}, { ...opts, jobId: "listing-view-retention-catch-up", removeOnComplete: true, removeOnFail: true });
  }
}
