import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { compatibleOwnershipGrant, ownershipGrantAuthority, type OwnershipGrantor, type OwnershipSource } from "../domain/OwnershipGrant";
import { diagnosticListingDigest } from "./diagnosticListingDigest";

type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
/** All callers hold the complete current/retained User -> Business -> Listing -> order prefix. */
export const DiagnosticOwnershipGrants = {
  refuse(error: unknown): never {
    if (error instanceof Error && /diagnostic_ownership_(grant_|disposal_targets_changed|source)/.test(error.message)) throw denied();
    throw error;
  },
  async source(tx: Tx, row: Order): Promise<OwnershipSource> {
    if (row.audience !== "listing_public" || !row.synthetic || row.erasedAt || !row.listingId || !row.commissionerId) throw denied();
    const listing = await tx.listing.findUnique({ where: { id: row.listingId } });
    if (!listing || listing.deletedAt) throw denied();
    const users = await tx.user.findMany({ where: { id: { in: [listing.sellerId, row.commissionerId] } } });
    if ([listing.sellerId, row.commissionerId].some(id => !users.some(u => u.id === id && !u.deletionScheduledAt && !u.suspendedAt && (u.phoneVerifiedAt || u.emailVerifiedAt)))) throw denied();
    const member = listing.businessId ? await tx.dealershipMember.findUnique({ where: { userId: row.commissionerId } }) : null;
    if (listing.businessId && (!member || member.dealershipId !== listing.businessId || member.status !== "active")) throw denied();
    return { listingId: listing.id, identityDigest: diagnosticListingDigest(listing), sellerId: listing.sellerId,
      commissionerId: row.commissionerId, businessId: listing.businessId, membershipId: member?.id ?? null };
  },
  async actor(tx: Tx, id: string): Promise<OwnershipGrantor> {
    const user = await tx.user.findUnique({ where: { id } });
    const member = await tx.dealershipMember.findUnique({ where: { userId: id }, include: { dealership: true } });
    return { id, active: !!user && !user.suspendedAt && !user.deletionScheduledAt && !!(user.phoneVerifiedAt || user.emailVerifiedAt),
      membership: member ? { id: member.id, businessId: member.dealershipId, role: member.role, active: member.status === "active", businessActive: member.dealership.status === "active" } : null };
  },
  async data(tx: Tx, row: Order, subject: { userId: string; sessionId: string }, input: D.DiagnosticOwnershipGrant, now: Date, id: string) {
    const source = await this.source(tx, row); const actor = await this.actor(tx, subject.userId);
    if (!ownershipGrantAuthority(actor, source) || new Date(input.rights.schedule.until) <= now ||
      await tx.diagnosticIdentityRecord.findFirst({ where: { orderId: row.id } }) || await tx.diagnosticOwnershipGrant.findUnique({ where: { orderId: row.id } })) throw denied();
    return { id, orderId: row.id, state: "available", ...source,
      grantorId: actor.id, grantorMembershipId: source.businessId ? actor.membership?.id ?? null : null, sessionId: subject.sessionId,
      rights: input.rights, rightsUntil: new Date(input.rights.schedule.until), declaredAt: now };
  },
  async create(tx: Tx, row: Order, subject: { userId: string; sessionId: string }, input: D.DiagnosticOwnershipGrant, now: Date, id: string): Promise<{ id: string }> {
    await tx.diagnosticOwnershipGrant.create({ data: await this.data(tx, row, subject, input, now, id) });
    return { id };
  },
  async compatible(tx: Tx, row: Order, id: string, now: Date): Promise<Prisma.DiagnosticOwnershipGrantGetPayload<object>> {
    const grant = await tx.diagnosticOwnershipGrant.findUnique({ where: { id } });
    if (!grant?.grantorId) throw denied();
    const source = await this.source(tx, row); const actor = await this.actor(tx, grant.grantorId);
    if (!compatibleOwnershipGrant(grant, row.id, source, actor, now) || !D.DiagnosticIdentityRightsSchema.safeParse(grant.rights).success) throw denied();
    return grant;
  },
};
