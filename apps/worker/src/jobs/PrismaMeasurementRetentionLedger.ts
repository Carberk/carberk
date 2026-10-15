import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { MeasurementRetentionLedger } from "./measurementRetention";

/** Personal measurement tables only. Qualified anonymous market datasets are separately owned. */
@Injectable()
export class PrismaMeasurementRetentionLedger implements MeasurementRetentionLedger {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 async deleteExpired(now: Date, limit: number): Promise<number> {
  return this.prisma.$transaction(async (tx) => {
   await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
   const raw = await tx.$executeRaw`WITH due AS (SELECT "id" FROM "measurement_records" WHERE "expiresAt" <= ${now} ORDER BY "expiresAt", "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    DELETE FROM "measurement_records" AS item USING due WHERE item."id" = due."id"`;
   const outbox = await tx.$executeRaw`WITH due AS (SELECT "id" FROM "measurement_outbox" WHERE "expiresAt" <= ${now} ORDER BY "expiresAt", "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    DELETE FROM "measurement_outbox" AS item USING due WHERE item."id" = due."id"`;
   // Guest erasure cascades any remaining guest-linked facts. Visit association retention is bounded too.
   const guests = await tx.$executeRaw`WITH due AS (SELECT "id" FROM "measurement_principals" WHERE "expiresAt" <= ${now} ORDER BY "expiresAt", "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    DELETE FROM "measurement_principals" AS item USING due WHERE item."id" = due."id"`;
   const visitCutoff = new Date(now.getTime() - 90 * 86400000);
   const visits = await tx.$executeRaw`WITH due AS (SELECT "id" FROM "measurement_visits" WHERE "foregroundAt" <= ${visitCutoff} ORDER BY "foregroundAt", "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    DELETE FROM "measurement_visits" AS item USING due WHERE item."id" = due."id"`;
   return raw + outbox + guests + visits;
  }, { timeout: 10000, maxWait: 1000 });
 }
 async oldestExpired(now: Date): Promise<Date | null> {
  return this.prisma.$transaction(async (tx) => {
   await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
   const rows = await tx.$queryRaw<{ oldest: Date | null }[]>`SELECT MIN(expiry) AS oldest FROM (
    SELECT "expiresAt" AS expiry FROM "measurement_records" WHERE "expiresAt" <= ${now}
    UNION ALL SELECT "expiresAt" FROM "measurement_outbox" WHERE "expiresAt" <= ${now}
    UNION ALL SELECT "expiresAt" FROM "measurement_principals" WHERE "expiresAt" <= ${now}
    UNION ALL SELECT "foregroundAt" + INTERVAL '90 days' FROM "measurement_visits" WHERE "foregroundAt" + INTERVAL '90 days' <= ${now}
   ) due`;
   return rows[0]?.oldest ?? null;
  }, { timeout: 3000, maxWait: 1000 });
 }
}
