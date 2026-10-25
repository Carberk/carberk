import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { STAFF_BINDING_PORT, type StaffBindingPort } from "../../identity/identity.public";
import type { DiagnosticDiscoveryPort } from "../application/ports/DiagnosticDiscoveryPort";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { diagnosticReadPrefix, diagnosticRoots } from "./DiagnosticPreparedIntake";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { DiagnosticPublicBindings } from "./DiagnosticPublicBindings";
import { PrismaDiagnosticContinuityProofs } from "./PrismaDiagnosticContinuityProofs";
import { DiagnosticDiscoveryCursor } from "./DiagnosticDiscoveryCursor";
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
@Injectable()
export class PrismaDiagnosticDiscovery implements DiagnosticDiscoveryPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(DiagnosticPublicBindings) private readonly publicBindings: DiagnosticPublicBindings,
    @Inject(PrismaDiagnosticContinuityProofs) private readonly proofs: PrismaDiagnosticContinuityProofs,
    @Inject(STAFF_BINDING_PORT) private readonly staff: StaffBindingPort,
    @Inject(DiagnosticDiscoveryCursor) private readonly cursors: DiagnosticDiscoveryCursor,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  async predecessors(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery): Promise<D.DiagnosticPredecessorPage> {
    // Authorize B before opening a continuation or selecting any predecessor lock targets.
    const scope = await this.db.$transaction(async tx => {
      const { row } = await this.authority.order(tx, subject, orderId, "diagnostics.reviewer");
      const centers = await tx.diagnosticCenterAssignment.findMany({ where: { userId: subject.userId, capability: "diagnostics.reviewer", revokedAt: null, qualifiedUntil: { gt: this.runtime.now() } } });
      return { row, centerIds: centers.map(center => center.centerId) };
    });
    const position = this.cursors.open(query.cursor, subject, orderId, this.runtime.now());
    // Only current assigned, qualified, same-audience candidates enter the bounded scan.
    // No global public report scan or count. Material/current authority are checked again below.
    const where: Prisma.DiagnosticReportRecordWhereInput = { erasedAt: null, status: { in: ["finalized", "withdrawn"] }, audience: scope.row.audience,
      orderId: { not: orderId }, snapshotHash: { not: null }, identityRecordId: { not: null }, identityEvidenceId: { not: null },
      createdAt: { lte: new Date(position.until) },
      order: { synthetic: true, erasedAt: null, centerId: { in: scope.centerIds }, audience: scope.row.audience,
        ...(scope.row.audience === "buyer_private" ? { commissionerId: scope.row.commissionerId ?? "" } : {}),
        assignments: { some: { userId: subject.userId, capability: "diagnostics.reviewer", revokedAt: null } } },
      ...(position.after ? { id: { gt: position.after.id } } : {}) };
    const rows = await this.db.diagnosticReportRecord.findMany({ where, orderBy: { id: "asc" }, take: 21, select: { id: true, orderId: true, createdAt: true } });
    const pageRows = rows.slice(0, 20);
    return this.db.$transaction(async tx => {
      // Complete User/Business/Listing/order union first, rather than extending locks per pair.
      await this.publicBindings.lock(tx, [orderId, ...new Set(pageRows.map(row => row.orderId))], [subject.userId]);
      const current = (await this.authority.order(tx, subject, orderId, "diagnostics.reviewer")).row;
      if (current.audience !== scope.row.audience || current.commissionerId !== scope.row.commissionerId) throw denied();
      const candidates: D.DiagnosticPredecessorPage["candidates"] = [];
      for (const row of pageRows) {
        try { candidates.push(await this.proofs.retainedCandidate(tx, subject, orderId, row.id)); }
        catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
      }
      const last = pageRows.at(-1);
      const nextCursor = rows.length > 20 && last ? this.cursors.seal({ ...position, after: { at: last.createdAt.toISOString(), id: last.id } }) : null;
      return D.DiagnosticPredecessorPageSchema.parse({ candidates, nextCursor, exhausted: nextCursor === null, scope: "currently_authorized_retained_predecessors" });
    });
  }
  async linkingTechnicians(subject: DiagnosticSubject, orderId: string): Promise<D.DiagnosticLinkingTechnicians> {
    await this.db.$transaction(tx => this.authority.order(tx, subject, orderId, "diagnostics.reviewer"));
    // Lock discovery only. Identity owns names, active User/grant facts and their locks.
    const discovered = await this.db.diagnosticOrderAssignment.findMany({ where: { orderId, capability: "diagnostics.technician", revokedAt: null }, orderBy: { userId: "asc" } });
    return this.db.$transaction(async tx => {
      await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), ...discovered.map(row => ({ table: "users" as const, key: { id: row.userId } }))]);
      const names = await this.staff.eligibleNames([
        { ...subject, capability: "diagnostics.reviewer" },
        ...discovered.map(row => ({ userId: row.userId, capability: "diagnostics.technician" })),
      ], tx);
      const { row: order } = await this.authority.order(tx, subject, orderId, "diagnostics.reviewer");
      await tx.$queryRaw`SELECT id FROM diagnostic_order_assignments WHERE "orderId"=${orderId} ORDER BY id FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM diagnostic_center_assignments WHERE "centerId"=${order.centerId} ORDER BY id FOR SHARE`;
      const technicians = [];
      for (const candidate of names) {
        if (candidate.userId === subject.userId || !this.runtime.syntheticAllowed({ userId: candidate.userId, sessionId: "" })) continue;
        const assignment = await tx.diagnosticOrderAssignment.findUnique({ where: { orderId_userId_capability: { orderId, userId: candidate.userId, capability: "diagnostics.technician" } } });
        const qualification = await tx.diagnosticCenterAssignment.findUnique({ where: { centerId_userId_capability: { centerId: order.centerId, userId: candidate.userId, capability: "diagnostics.technician" } } });
        if (!assignment || assignment.revokedAt || !qualification || qualification.revokedAt || !qualification.qualifiedUntil || qualification.qualifiedUntil <= this.runtime.now()) continue;
        technicians.push(candidate);
      }
      return D.DiagnosticLinkingTechniciansSchema.parse({ technicians });
    });
  }
}
