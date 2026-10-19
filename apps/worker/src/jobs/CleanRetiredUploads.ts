import { Inject, Injectable } from "@nestjs/common";

import {
  RETIRED_OBJECT_STORE,
  RETIRED_UPLOAD_LEDGER,
  deletionDirectory,
  type CleanupWork,
  type RetiredObjectStore,
  type RetiredUploadLedger,
} from "./retiredUploadCleanup";

export interface CleanRetiredUploadsInput {
  now: Date;
  /** Upper bound on preparations cancelled and on pieces of work taken in this run. */
  limit: number;
}

export interface CleanRetiredUploadsResult {
  cancelledPreparations: number;
  deleted: number;
  waiting: number;
}

/**
 * One bounded sweep of retired upload storage (ADR-0088). It first retires
 * preparations stranded past their deadline, then takes due work and, for each
 * piece, deletes the recorded objects and marks it done only once storage has
 * proven every one of them absent. Anything else leaves the work waiting for
 * its next attempt with the reason recorded.
 */
@Injectable()
export class CleanRetiredUploads {
  constructor(
    @Inject(RETIRED_UPLOAD_LEDGER) private readonly ledger: RetiredUploadLedger,
    @Inject(RETIRED_OBJECT_STORE) private readonly store: RetiredObjectStore,
  ) {}

  async execute(input: CleanRetiredUploadsInput): Promise<CleanRetiredUploadsResult> {
    const cancelledPreparations = await this.ledger.retireExpiredPreparations(input.now, input.limit);
    let deleted = 0;
    let waiting = 0;
    for (const work of await this.ledger.lease(input.now, input.limit)) {
      try {
        await this.clean(work);
        await this.ledger.complete(work.uploadId, input.now);
        deleted += 1;
      } catch (error) {
        waiting += 1;
        const reason = error instanceof Error ? error.message : String(error);
        await this.ledger.recordFailure(work.uploadId, reason.slice(0, 500));
      }
    }
    return { cancelledPreparations, deleted, waiting };
  }

  private async clean(work: CleanupWork): Promise<void> {
    const directory = deletionDirectory(work);
    if (directory === null) {
      throw new Error("No deletion authority: not a fenced upload in an owned pending directory");
    }
    const blocked = await this.ledger.blockingReference(work, directory);
    if (blocked !== null) throw new Error(blocked);
    await this.store.deleteAndVerify(work.objectKeys);
  }
}
