import { Inject, Injectable } from "@nestjs/common";

import {
  RETIRED_OBJECT_STORE,
  RETIRED_UPLOAD_LEDGER,
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

/** Scaffold for #721: the cleanup sweep is not implemented yet. */
@Injectable()
export class CleanRetiredUploads {
  constructor(
    @Inject(RETIRED_UPLOAD_LEDGER) private readonly ledger: RetiredUploadLedger,
    @Inject(RETIRED_OBJECT_STORE) private readonly store: RetiredObjectStore,
  ) {}

  async execute(_input: CleanRetiredUploadsInput): Promise<CleanRetiredUploadsResult> {
    return { cancelledPreparations: 0, deleted: 0, waiting: 0 };
  }
}
