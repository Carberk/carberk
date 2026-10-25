import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DiagnosticOwnershipGrants } from "./DiagnosticOwnershipGrants";

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
  async data(tx: Tx, row: Order, rawId: string, version: number, actorId: string, now: Date,
    classification: DiagnosticSchemas.DiagnosticOwnershipClassification | undefined, grantId?: string): Promise<Prisma.DiagnosticOwnershipComponentUncheckedCreateInput> {
    if (classification && new Date(classification.rights.schedule.until) <= now) throw new DiagnosticRuleError("DIAGNOSTIC_INVALID_INPUT");
    const unavailable = { identityRecordId: rawId, orderId: row.id, orderVersion: version, state: "unavailable" as const };
    if (!grantId || row.audience !== "listing_public" || !row.listingId || !row.commissionerId) {
      return unavailable;
    }
    const grant = await DiagnosticOwnershipGrants.compatible(tx, row, grantId, now);
    const earlier = await tx.diagnosticIdentityRecord.findMany({ where: { orderId: row.id, orderVersion: { lt: version } }, include: { ownership: true } });
    // No repin, backfill or resurrection, including a legacy raw that has no component row.
    if (earlier.some(raw => raw.ownership?.state !== "available" || !raw.ownership.rightsUntil || raw.ownership.rightsUntil <= now)) {
      return unavailable;
    }
    const rights = DiagnosticSchemas.DiagnosticIdentityRightsSchema.parse(grant.rights);
    if (classification) {
      if (JSON.stringify({ ...rights, schedule: null }) !== JSON.stringify({ ...classification.rights, schedule: null }) || new Date(classification.rights.schedule.until) > new Date(rights.schedule.until)) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    }
    const retainedRights = classification?.rights ?? rights;
    return {
      ...unavailable, grantId: grant.id, state: "available", scope: "diagnostic_ownership_continuity", sourceListingId: grant.listingId,
      identityDigest: grant.identityDigest, sellerId: grant.sellerId, commissionerId: grant.commissionerId,
      businessId: grant.businessId, membershipId: grant.membershipId,
      rights: retainedRights, rightsUntil: new Date(retainedRights.schedule.until), declaredById: actorId, declaredAt: now,
    };
  },
  async append(tx: Tx, row: Order, rawId: string, version: number, actorId: string, now: Date,
    classification: DiagnosticSchemas.DiagnosticOwnershipClassification | undefined, grantId?: string): Promise<void> {
    await tx.diagnosticOwnershipComponent.create({ data: await this.data(tx, row, rawId, version, actorId, now, classification, grantId) });
  }
};
