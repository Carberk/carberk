import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@auto-tm/db";
import { BusinessAuthorityDenied, PUBLISHER_BINDING_PORT, type PublisherBindingPort, type PublisherParticipants } from "../../identity/identity.public";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { diagnosticListingDigest } from "./diagnosticListingDigest";

type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
const listingBinding = z.object({ id: z.string(), sellerId: z.string(), businessId: z.string().nullable(), identityDigest: z.string().regex(/^[a-f0-9]{64}$/),
  identity: z.object({ vin: z.string().nullable(), brandId: z.string(), modelId: z.string(), year: z.number().nullable() }).strict(),
  status: z.string(), deletedAt: z.string().datetime().nullable() }).strict();
const publisherBinding = z.object({ userId: z.string(), sellerId: z.string(), businessId: z.string().nullable(), membershipId: z.string().nullable(), generation: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
@Injectable()
export class DiagnosticPublicBindings {
  constructor(@Inject(PUBLISHER_BINDING_PORT) private readonly publishers: PublisherBindingPort) {}
  private async targets(tx: Tx, orderIds: string[]) {
    const orders = await tx.inspectionOrder.findMany({ where: { id: { in: orderIds } }, orderBy: { id: "asc" } });
    if (orders.length !== orderIds.length) throw denied();
    return Promise.all(orders.map(async order => {
      const listing = order.audience === "listing_public" && order.listingId ? await tx.listing.findUnique({ where: { id: order.listingId } }) : null;
      return { id: order.id, audience: order.audience, commissionerId: order.commissionerId, listingId: order.listingId,
        sellerId: listing?.sellerId ?? null, businessId: listing?.businessId ?? null };
    }));
  }
  /** Discovery selects locks only. Acquire the complete User union once, including all actors,
   * both public commissioners and current sellers, before Business -> Listing -> order locks.
   * Changed targets refuse without extending locks or retrying. No authority is inferred here. */
  async lock(tx: Tx, ids: string[], actorIds: string[]): Promise<PublisherParticipants> {
    const orderIds = [...new Set(ids)].sort();
    const discovered = await this.targets(tx, orderIds);
    let locked: PublisherParticipants;
    try {
      locked = await this.publishers.lock({ userIds: [...actorIds, ...discovered.flatMap(row => row.audience === "listing_public" ? [row.commissionerId, row.sellerId].filter((id): id is string => !!id) : [])],
        businessIds: discovered.flatMap(row => row.businessId ? [row.businessId] : []) }, tx);
    } catch (error) { if (error instanceof BusinessAuthorityDenied) throw denied(); throw error; }
    for (const id of [...new Set(discovered.filter(row => row.audience === "listing_public").flatMap(row => row.listingId ? [row.listingId] : []))].sort()) {
      await tx.$queryRaw`SELECT id FROM listings WHERE id=${id} FOR SHARE`;
    }
    for (const id of orderIds) await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
    if (JSON.stringify(discovered) !== JSON.stringify(await this.targets(tx, orderIds))) throw denied();
    return locked;
  }
  async pairLocks(tx: Tx, orderId: string, predecessorId: string, actorIds: string[]) {
    const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: predecessorId }, select: { orderId: true } });
    if (!prior || prior.orderId === orderId) throw denied();
    return this.lock(tx, [orderId, prior.orderId], actorIds);
  }
  /** A's Listing is a current proof binding, not a new publication or eligibility test.
   * A's snapshot/raw identity and historical commissioner remain in their original owners. */
  async listing(tx: Tx, order: Order) {
    if (order.audience !== "listing_public") return null;
    if (!order.listingId) throw denied();
    const listing = await tx.listing.findUnique({ where: { id: order.listingId } });
    if (!listing) throw denied();
    return listingBinding.parse({ id: listing.id, sellerId: listing.sellerId, businessId: listing.businessId, identityDigest: diagnosticListingDigest(listing),
      identity: { vin: listing.vin?.trim().toUpperCase() ?? null, brandId: listing.brandId, modelId: listing.modelId, year: listing.year },
      status: String(listing.status), deletedAt: listing.deletedAt?.toISOString() ?? null });
  }
  /** Only B's intake commissioner is the publisher participant. Reception's separately recorded
   * consent and the visit's validated association must still hold. No A publisher check. */
  async candidate(tx: Tx, order: Order, locked: PublisherParticipants) {
    if (order.audience === "listing_public" && !order.listingId) throw new DiagnosticRuleError("PUBLICATION_AUTHORIZATION_REQUIRED");
    const listing = await this.listing(tx, order);
    if (!listing) return null;
    if (!order.physicalAuthorization || !order.publicationAuthorization || !order.associationValidatedAt || !order.listingIdentityDigest) throw new DiagnosticRuleError("PUBLICATION_AUTHORIZATION_REQUIRED");
    if (listing.status !== "active" || listing.deletedAt || listing.identityDigest !== order.listingIdentityDigest) throw new DiagnosticRuleError("DIAGNOSTIC_VEHICLE_MISMATCH");
    if (!order.commissionerId) throw denied();
    try {
      return { listing, publisher: publisherBinding.parse(await this.publishers.bind({ userId: order.commissionerId, sellerId: listing.sellerId, businessId: listing.businessId }, locked, tx)),
        publicationAuthorization: order.publicationAuthorization, associationValidatedAt: order.associationValidatedAt.toISOString(), listingIdentityDigest: order.listingIdentityDigest };
    } catch (error) { if (error instanceof BusinessAuthorityDenied) throw denied(); throw error; }
  }
}
