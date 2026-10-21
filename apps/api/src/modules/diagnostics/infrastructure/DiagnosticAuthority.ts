import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { BUSINESS_AUTHORITY_PORT, STAFF_AUTHORITY_PORT, StaffAuthorityDenied, type BusinessAuthorityPort, type StaffAuthorityPort } from "../../identity/identity.public";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { CampaignDiagnosticAdmission, type CampaignDiagnosticGraph, type CampaignDiagnosticScope } from "./campaignDiagnosticAdmission";

type Tx = Prisma.TransactionClient;
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
/** Current identity, qualification and assignment are checked inside the owning transaction. */
@Injectable()
export class DiagnosticAuthority {
  constructor(@Inject(STAFF_AUTHORITY_PORT) private readonly staff: StaffAuthorityPort,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly business: BusinessAuthorityPort,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime,
    @Inject(CampaignDiagnosticAdmission) private readonly campaign: CampaignDiagnosticAdmission) {}
  async current(tx: Tx, subject: DiagnosticSubject): Promise<void> {
    if (!this.runtime.syntheticAllowed(subject)) throw denied();
    try { await this.business.resolve(subject, tx); } catch { throw denied(); }
  }
  /** Template publication and private intake only: the ordinary runtime gate, otherwise the full-v3
   * reservation authority for this exact principal, Session and requested graph. The current Session
   * check always follows; grants, qualifications and assignments remain separate checks. */
  async admitted(tx: Tx, subject: DiagnosticSubject, graph: CampaignDiagnosticGraph = {}, refusal = "DIAGNOSTIC_NO_ACCESS"): Promise<CampaignDiagnosticScope | null> {
    if (this.runtime.syntheticAllowed(subject)) { await this.current(tx, subject); return null; }
    const scope = await this.campaign.begin(tx, subject);
    if (!scope || !await this.campaign.admit(tx, scope, subject, graph)) throw new DiagnosticRuleError(refusal);
    try { await this.business.resolve(subject, tx); } catch { throw denied(); }
    return scope;
  }
  /** Proves more of the same reservation's graph inside an already admitted transaction. */
  async owned(tx: Tx, scope: CampaignDiagnosticScope, subject: DiagnosticSubject, graph: CampaignDiagnosticGraph): Promise<boolean> {
    return this.campaign.admit(tx, scope, subject, graph);
  }
  async center(tx: Tx, subject: DiagnosticSubject, centerId: string, capability: DiagnosticSchemas.DiagnosticCapability): Promise<void> {
    try { await this.staff.authorize({ ...subject, capability }, tx); }
    catch (error) { if (error instanceof StaffAuthorityDenied) throw denied(); throw error; }
    await tx.$queryRaw`SELECT id FROM diagnostic_center_assignments WHERE "centerId"=${centerId} AND "userId"=${subject.userId} AND capability=${capability} FOR SHARE`;
    const assignment = await tx.diagnosticCenterAssignment.findUnique({ where: { centerId_userId_capability: { centerId, userId: subject.userId, capability } } });
    if (!assignment || assignment.revokedAt || !assignment.qualifiedUntil || assignment.qualifiedUntil <= this.runtime.now()) throw denied();
  }
  async order(tx: Tx, subject: DiagnosticSubject, id: string, capability?: DiagnosticSchemas.DiagnosticCapability): Promise<{ row: Prisma.InspectionOrderGetPayload<object>; staff: boolean }> {
    await this.current(tx, subject);
    const initial = await tx.inspectionOrder.findUnique({ where: { id } });
    if (!initial) throw denied();
    // Listing identity edits invalidate associations while holding Listing first.
    if (initial.audience === "listing_public" && initial.listingId) {
      await tx.$queryRaw`SELECT id FROM listings WHERE id=${initial.listingId} FOR SHARE`;
    }
    await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
    const row = await tx.inspectionOrder.findUnique({ where: { id } });
    if (!row || row.erasedAt || !row.synthetic || row.listingId !== initial.listingId) throw denied();
    if (!capability && row.commissionerId === subject.userId) return { row, staff: false };
    await tx.$queryRaw`SELECT id FROM diagnostic_order_assignments WHERE "orderId"=${id} AND "userId"=${subject.userId} ORDER BY id FOR SHARE`;
    const assignments = await tx.diagnosticOrderAssignment.findMany({ where: { orderId: id, userId: subject.userId, revokedAt: null, ...(capability ? { capability } : {}) } });
    for (const assignment of assignments) {
      const parsed = DiagnosticSchemas.DiagnosticCapabilitySchema.safeParse(assignment.capability);
      if (!parsed.success) continue;
      try { await this.center(tx, subject, row.centerId, parsed.data); return { row, staff: true }; }
      catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
    }
    throw denied();
  }
}
