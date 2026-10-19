import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";

import { CleanRetiredUploads } from "../jobs/CleanRetiredUploads";

export const RETIRED_UPLOAD_CLEANUP_QUEUE = "retired-upload-cleanup";

/** Pieces of work, and stranded preparations, handled by one scheduled sweep. */
const SWEEP_LIMIT = 25;

/**
 * Runs one bounded sweep per scheduled job. Retries and backoff live in
 * Postgres with the work itself, not in BullMQ: a sweep that finds failing
 * work still completes, and the next sweep takes whatever is due again.
 */
@Processor(RETIRED_UPLOAD_CLEANUP_QUEUE)
export class RetiredUploadCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(RetiredUploadCleanupProcessor.name);

  constructor(@Inject(CleanRetiredUploads) private readonly sweep: CleanRetiredUploads) {
    super();
  }

  async process(): Promise<void> {
    const result = await this.sweep.execute({ now: new Date(), limit: SWEEP_LIMIT });
    if (result.cancelledPreparations + result.deleted + result.waiting > 0) {
      this.logger.log(
        `Retired upload cleanup: ${result.deleted} deleted, ${result.waiting} waiting for retry, ` +
          `${result.cancelledPreparations} stranded preparations retired`,
      );
    }
  }
}
