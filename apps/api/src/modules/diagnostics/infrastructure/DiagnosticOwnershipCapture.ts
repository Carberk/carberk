import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { diagnosticListingDigest } from "./diagnosticListingDigest";

type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
/** Called only under the intake's complete User -> Business -> Listing -> order prefix.
 * The caller parses the declaration before any source tuple is copied. This component
 * grants no publisher authority and never repairs a visit's missing original anchor. */
export const DiagnosticOwnershipCapture = {
  classification(value: unknown, now: Date): DiagnosticSchemas.DiagnosticOwnershipClassification | undefined {
    if (value === undefined) return undefined;
    const parsed = DiagnosticSchemas.DiagnosticOwnershipClassificationSchema.safeParse(value);
    if (!parsed.success || new Date(parsed.data.rights.schedule.until) <= now) throw new DiagnosticRuleError("DIAGNOSTIC_INVALID_INPUT");
    return parsed.data;
  },
  async append(tx: Tx, row: Order, rawId: string, version: number, actorId: string, now: Date,
    classification: DiagnosticSchemas.DiagnosticOwnershipClassification | undefined): Promise<void> {
    if (classification && new Date(classification.rights.schedule.until) <= now) throw new DiagnosticRuleError("DIAGNOSTIC_INVALID_INPUT");
    const unavailable = { identityRecordId: rawId, orderId: row.id, orderVersion: version, state: "unavailable" };
    if (!classification || row.audience !== "listing_public" || !row.listingId || !row.commissionerId) {
      await tx.diagnosticOwnershipComponent.create({ data: unavailable }); return;
    }
    const earlier = await tx.diagnosticIdentityRecord.findMany({ where: { orderId: row.id, orderVersion: { lt: version } }, include: { ownership: true } });
    // No repin, backfill or resurrection, including a legacy raw that has no component row.
    if (earlier.some(raw => raw.ownership?.state !== "available" || !raw.ownership.rightsUntil || raw.ownership.rightsUntil <= now)) {
      await tx.diagnosticOwnershipComponent.create({ data: unavailable }); return;
    }
    const listing = await tx.listing.findUnique({ where: { id: row.listingId } });
    if (!listing || listing.deletedAt) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    const subjects = await tx.user.findMany({ where: { id: { in: [listing.sellerId, row.commissionerId] } } });
    if ([listing.sellerId, row.commissionerId].some(id => {
      const user = subjects.find(candidate => candidate.id === id);
      return !user || user.deletionScheduledAt || (!user.phoneVerifiedAt && !user.emailVerifiedAt);
    })) {
      await tx.diagnosticOwnershipComponent.create({ data: unavailable }); return;
    }
    const member = listing.businessId ? await tx.dealershipMember.findUnique({ where: { userId: row.commissionerId } }) : null;
    if (listing.businessId && (!member || member.dealershipId !== listing.businessId || member.status !== "active")) {
      await tx.diagnosticOwnershipComponent.create({ data: unavailable }); return;
    }
    await tx.diagnosticOwnershipComponent.create({ data: {
      ...unavailable, state: "available", scope: "diagnostic_ownership_continuity", sourceListingId: listing.id,
      identityDigest: diagnosticListingDigest(listing), sellerId: listing.sellerId, commissionerId: row.commissionerId,
      businessId: listing.businessId, membershipId: listing.businessId ? member?.id ?? null : null,
      rights: classification.rights, rightsUntil: new Date(classification.rights.schedule.until), declaredById: actorId, declaredAt: now,
    } });
  }
};
