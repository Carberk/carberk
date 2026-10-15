import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";

import { ExpireListingViewFingerprints } from "../jobs/ExpireListingViewFingerprints";

import { LISTING_VIEW_RETENTION_QUEUE } from "./listing-view-retention.scheduler";

@Processor(LISTING_VIEW_RETENTION_QUEUE)
export class ListingViewRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(ListingViewRetentionProcessor.name);
  private lastSuccessAt: string | null = null;

  constructor(@Inject(ExpireListingViewFingerprints) private readonly sweep: ExpireListingViewFingerprints) { super(); }

  async process(): Promise<void> {
    try {
      const result = await this.sweep.execute(new Date());
      this.lastSuccessAt = result.health.lastSuccessAt?.toISOString() ?? null;
      const summary = JSON.stringify({ deleted: result.deleted, lastSuccessAt: this.lastSuccessAt,
        oldestOverdueAt: result.health.oldestOverdueAt?.toISOString() ?? null,
        overdueMs: result.health.overdueMs, healthy: result.health.healthy });
      if (result.health.healthy) this.logger.log(`Listing view retention ${summary}`);
      else this.logger.error(`Listing view retention breach ${summary}`);
    } catch {
      this.logger.error(`Listing view retention unavailable ${JSON.stringify({ lastSuccessAt: this.lastSuccessAt, healthy: false })}`);
      throw new Error("Listing view retention unavailable");
    }
  }
}
