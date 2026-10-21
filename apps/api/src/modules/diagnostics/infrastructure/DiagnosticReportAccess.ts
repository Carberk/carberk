import { Inject, Injectable } from "@nestjs/common";
import type { DiagnosticSchemas } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { diagnosticListingDigest } from "./PrismaDiagnosticIntake";

type Report = Prisma.DiagnosticReportRecordGetPayload<{ include: { order: true } }>;
@Injectable()
export class DiagnosticReportAccess {
  constructor(@Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}
  async load(tx: Prisma.TransactionClient, subject: DiagnosticSubject, id: string, capability?: DiagnosticSchemas.DiagnosticCapability) {
    const found = await tx.diagnosticReportRecord.findUnique({ where: { id } });
    if (!found) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    const scope = await this.authority.order(tx, subject, found.orderId, capability);
    await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${id} FOR UPDATE`;
    const row = await tx.diagnosticReportRecord.findUnique({ where: { id } });
    if (!row || row.erasedAt || (!scope.staff && !row.snapshot)) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    return { row, order: scope.row, staff: scope.staff };
  }
  /** Public release has its own gate and never derives access from a commissioner. */
  async loadPublic(tx: Prisma.TransactionClient, id: string) {
    const denied = () => new DiagnosticRuleError("DIAGNOSTIC_PUBLIC_UNAVAILABLE");
    if (!this.runtime.publicSyntheticAllowed?.()) throw denied();
    const found = await tx.diagnosticReportRecord.findFirst({ where: { id, audience: "listing_public" }, include: { order: true } });
    if (!found || !found.order.listingId) throw denied();
    await tx.$queryRaw`SELECT id FROM listings WHERE id=${found.order.listingId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${found.orderId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${id} FOR SHARE`;
    const row = await tx.diagnosticReportRecord.findUniqueOrThrow({ where: { id }, include: { order: true } });
    const order = row.order;
    if (order.listingId !== found.order.listingId || !await this.publiclyAvailable(tx, row)) throw denied();
    return { row, order, staff: false };
  }
  /** The current public gate without locks. Callers either hold Listing -> order -> report
   * locks (loadPublic) or only decide whether to disclose a linked report id. */
  private async publiclyAvailable(tx: Prisma.TransactionClient, row: Report): Promise<boolean> {
    const order = row.order;
    if (!this.runtime.publicSyntheticAllowed?.()) return false;
    if (row.erasedAt || row.withdrawnAt || row.status !== "finalized" || !row.snapshotHash || !row.snapshot || order.erasedAt || !order.synthetic ||
      order.audience !== "listing_public" || !order.listingId || !order.publicationAuthorization || !order.associationValidatedAt || !order.listingIdentityDigest) return false;
    const listing = await tx.listing.findUnique({ where: { id: order.listingId }, include: { business: true, seller: { select: { deletionScheduledAt: true, suspendedAt: true } } } });
    return !(!listing || listing.deletedAt || listing.status !== "active" || (!listing.businessId && (listing.seller.deletionScheduledAt || listing.seller.suspendedAt)) ||
      (listing.businessId && listing.business?.status !== "active") || diagnosticListingDigest(listing) !== order.listingIdentityDigest);
  }
  /** Released successor id for a reader of `predecessor`. A same-order correction follows the
   * predecessor's audience. A reinspection lives on another order, so its id is disclosed only to
   * that order's own commissioner or while it is independently publicly available; predecessor
   * staff gain nothing. Drafts are never disclosed. Unlocked: this never grants a read. */
  async successorId(tx: Prisma.TransactionClient, predecessor: { id: string; orderId: string }, viewerId: string | null): Promise<string | null> {
    const successor = await tx.diagnosticReportRecord.findFirst({ where: { predecessorId: predecessor.id, snapshotHash: { not: null }, erasedAt: null }, include: { order: true } });
    if (!successor) return null;
    if (!successor.reinspection && successor.orderId === predecessor.orderId) return successor.id;
    if (viewerId && !successor.order.erasedAt && successor.order.synthetic && successor.order.commissionerId === viewerId) return successor.id;
    return await this.publiclyAvailable(tx, successor) ? successor.id : null;
  }

}
