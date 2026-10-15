import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { ListingViewRetentionLedger } from "./listingViewRetention";

@Injectable()
export class PrismaListingViewRetentionLedger implements ListingViewRetentionLedger {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async deleteExpired(now: Date, limit: number): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
      return tx.$executeRaw`
        WITH due AS (
          SELECT "listingId", "day", "fingerprint" FROM listing_view_fingerprints
          WHERE "expiresAt" <= ${now}
          ORDER BY "expiresAt", "listingId", "day", "fingerprint"
          LIMIT ${limit} FOR UPDATE SKIP LOCKED
        )
        DELETE FROM listing_view_fingerprints AS ledger USING due
        WHERE ledger."listingId" = due."listingId" AND ledger."day" = due."day"
          AND ledger."fingerprint" = due."fingerprint" AND ledger."expiresAt" <= ${now}
      `;
    }, { timeout: 3000, maxWait: 1000 });
  }

  async oldestExpired(now: Date): Promise<Date | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
      const rows = await tx.$queryRaw<{ oldest: Date | null }[]>`
        SELECT MIN("expiresAt") AS oldest FROM listing_view_fingerprints WHERE "expiresAt" <= ${now}
      `;
      return rows[0]?.oldest ?? null;
    }, { timeout: 3000, maxWait: 1000 });
  }
}
