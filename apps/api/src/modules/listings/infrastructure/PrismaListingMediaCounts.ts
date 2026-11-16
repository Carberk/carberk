import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { ListingMediaCounts } from "../application/ports/ListingMediaCounts";

@Injectable()
export class PrismaListingMediaCounts implements ListingMediaCounts {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  count(listingId: string, kind?: "image"): Promise<number> {
    return this.prisma.listingMedia.count({ where: { listingId, ...(kind ? { kind } : {}) } });
  }
}
