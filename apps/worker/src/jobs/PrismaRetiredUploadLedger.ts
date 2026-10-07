import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { CleanupWork, RetiredUploadLedger } from "./retiredUploadCleanup";

/** Scaffold for #721: the cleanup ledger is not implemented yet. */
@Injectable()
export class PrismaRetiredUploadLedger implements RetiredUploadLedger {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async retireExpiredPreparations(_now: Date, _limit: number): Promise<number> {
    return 0;
  }

  async lease(_now: Date, _limit: number): Promise<CleanupWork[]> {
    return [];
  }

  async blockingReference(_work: CleanupWork, _directory: string): Promise<string | null> {
    return null;
  }

  async complete(_uploadId: string, _now: Date): Promise<void> {}

  async recordFailure(_uploadId: string, _reason: string): Promise<void> {}
}
