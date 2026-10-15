import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type {
  OwnerListingCounts,
  OwnerListingCountsPort,
} from "../domain/ports/OwnerListingCountsPort";

@Injectable()
export class PrismaOwnerListingCountsRepository implements OwnerListingCountsPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async countForOwner(ownerId: string): Promise<OwnerListingCounts> {
    const [listingGroups, drafts] = await Promise.all([
      this.prisma.listing.groupBy({
        by: ["status"],
        where: { sellerId: ownerId, businessId: null, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.listingDraft.count({ where: { userId: ownerId, businessId: null } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const group of listingGroups) {
      byStatus[group.status] = group._count._all;
    }

    return { byStatus, drafts };
  }
}
