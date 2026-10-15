import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import type { ListingViewsPort } from "../domain/ports/ListingViewsPort";
import { listingViewDay } from "../domain/listingViewDay";

@Injectable()
export class PrismaListingViews implements ListingViewsPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async record(input: Parameters<ListingViewsPort["record"]>[0]): Promise<boolean> {
    if (String(this.config.get("LISTING_VIEWS_ENABLED", false)) !== "true") return false;
    const secret = this.config.get<string>("LISTING_VIEW_SALT_SECRET");
    if (!secret || secret.length < 32) throw new Error("Listing view configuration unavailable");
    const { day, expiresAt } = listingViewDay(input.now);
    const salt = createHmac("sha256", secret).update(`listing-views:day:${day}`).digest();
    const fingerprint = createHmac("sha256", salt)
      .update(JSON.stringify([input.viewerKey, input.listingId, day])).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
      const rows = await tx.$queryRaw<{ sellerId: string; status: string; deletedAt: Date | null }[]>`
        SELECT "sellerId", "status", "deletedAt" FROM "listings"
        WHERE "id" = ${input.listingId} FOR UPDATE`;
      const listing = rows[0];
      if (!listing || listing.status !== "active" || listing.deletedAt || listing.sellerId === input.requestingUserId) return false;
      const inserted = await tx.$executeRaw`
        INSERT INTO "listing_view_fingerprints" ("listingId", "day", "fingerprint", "expiresAt")
        VALUES (${input.listingId}, ${day}, ${fingerprint}, ${expiresAt})
        ON CONFLICT ("listingId", "day", "fingerprint") DO NOTHING`;
      if (!inserted) return false;
      await tx.$executeRaw`
        INSERT INTO "listing_view_days" ("listingId", "day", "count") VALUES (${input.listingId}, ${day}, 1)
        ON CONFLICT ("listingId", "day") DO UPDATE SET "count" = "listing_view_days"."count" + 1`;
      await tx.$executeRaw`UPDATE "listings" SET "viewCount" = "viewCount" + 1 WHERE "id" = ${input.listingId}`;
      return true;
    }, { maxWait: 5_000, timeout: 5_000 });
  }

  async counts(listingId: string, now: Date): Promise<{ viewCount: number; viewsToday: number }> {
    const { day } = listingViewDay(now);
    const rows = await this.prisma.$queryRaw<{ viewCount: number; viewsToday: number }[]>`
      SELECT l."viewCount", COALESCE(d."count", 0)::integer AS "viewsToday"
      FROM "listings" l LEFT JOIN "listing_view_days" d ON d."listingId" = l."id" AND d."day" = ${day}
      WHERE l."id" = ${listingId}`;
    return rows[0] ?? { viewCount: 0, viewsToday: 0 };
  }
}
