import { Inject, Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { IDENTITY_CLOCK_PORT, type ClockPort } from "../../identity/identity.public";
import type { BusinessInventoryRepository, BusinessInventorySnapshot } from "../domain/ports/BusinessInventoryRepository";
import type { InventoryActor } from "../domain/ports/ListingRepository";
import { ListingOwnership } from "../application/ListingOwnership";

const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
@Injectable()
export class PrismaBusinessInventoryRepository implements BusinessInventoryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ListingOwnership) private readonly ownership: ListingOwnership,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort) {}
  async publicBusiness(businessId: string) {
    return this.prisma.dealership.findUnique({ where: { id: businessId }, select: { id: true, name: true, status: true, createdAt: true } });
  }
  async read(actor: InventoryActor): Promise<BusinessInventorySnapshot> {
    if (!actor.businessId) throw new NotFoundException("Business not found");
    const businessId = actor.businessId;
    return this.prisma.$transaction(async (tx) => {
      await this.ownership.authorize(actor, { businessId: actor.businessId }, tx, true);
      const business = await tx.dealership.findUniqueOrThrow({ where: { id: businessId } });
      const stock = await tx.listing.findMany({ where: { businessId: business.id, deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
      const drafts = await tx.listingDraft.findMany({ where: { businessId: business.id }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
      const now = this.clock.now().getTime();
      const listings = stock.map((row) => ({ id: row.id, status: row.status, brandId: row.brandId, modelId: row.modelId, year: row.year,
        publishedAt: row.publishedAt?.toISOString() ?? null, availabilityConfirmedAt: row.availabilityConfirmedAt?.toISOString() ?? null,
        reviewDue: row.status === "active" && now - (row.availabilityConfirmedAt ?? row.publishedAt ?? row.createdAt).getTime() >= REVIEW_WINDOW_MS }));
      return { businessId: business.id, status: business.status as BusinessInventorySnapshot["status"], listings,
        drafts: drafts.map((row) => ({ id: row.id, userId: row.userId, businessId: business.id, payload: row.payload as Record<string, unknown>, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
        counts: { active: listings.filter((r) => r.status === "active").length, sold: listings.filter((r) => r.status === "sold").length,
          archived: listings.filter((r) => r.status === "archived").length, banned: listings.filter((r) => r.status === "banned").length,
          drafts: drafts.length, reviewDue: listings.filter((r) => r.reviewDue).length } };
    });
  }
  async confirmAvailability(actor: InventoryActor, listingId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.ownership.authorize(actor, { businessId: actor.businessId }, tx);
      const rows = await tx.$queryRaw<Array<{ businessId: string | null; status: string; deletedAt: Date | null }>>`SELECT "businessId", "status", "deletedAt" FROM "listings" WHERE "id" = ${listingId} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.businessId !== actor.businessId || row.deletedAt) throw new NotFoundException("Listing not found");
      if (row.status !== "active") throw new ConflictException({ code: "INVALID_STATUS_TRANSITION" });
      // Availability is a seller assertion, never a republish, rank boost or moderation transition.
      await tx.listing.update({ where: { id: listingId }, data: { availabilityConfirmedAt: this.clock.now() } });
    });
  }
}
