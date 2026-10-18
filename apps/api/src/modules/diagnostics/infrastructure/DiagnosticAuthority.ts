import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { BUSINESS_AUTHORITY_PORT, STAFF_AUTHORITY_PORT, StaffAuthorityDenied, type BusinessAuthorityPort, type StaffAuthorityPort } from "../../identity/identity.public";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";

type Tx = Prisma.TransactionClient;
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
/** Current identity, qualification and assignment are checked inside the owning transaction. */
@Injectable()
export class DiagnosticAuthority {
  constructor(@Inject(STAFF_AUTHORITY_PORT) private readonly staff: StaffAuthorityPort,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly business: BusinessAuthorityPort,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}
  async current(tx: Tx, subject: DiagnosticSubject): Promise<void> {
    if (!this.runtime.syntheticAllowed(subject)) throw denied();
    try { await this.business.resolve(subject, tx); } catch { throw denied(); }
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
    await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
    const row = await tx.inspectionOrder.findUnique({ where: { id } });
    if (!row || row.erasedAt || !row.synthetic) throw denied();
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
