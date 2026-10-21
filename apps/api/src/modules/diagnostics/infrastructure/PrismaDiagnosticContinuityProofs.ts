import { createHash } from "node:crypto";
import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { STAFF_BINDING_PORT, StaffAuthorityDenied, type StaffBindingPort } from "../../identity/identity.public";
import type { DiagnosticContinuityProofsPort } from "../application/ports/DiagnosticContinuityProofsPort";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { privateContinuityAttestation } from "../domain/PrivateContinuityAttestation";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { canonical, PrismaDiagnosticIdentityEvidence } from "./PrismaDiagnosticIdentityEvidence";
import { PrismaDiagnosticReports } from "./PrismaDiagnosticReports";

const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const hash = (value: unknown) => createHash("sha256").update(canonical(JSON.parse(JSON.stringify(value)))).digest("hex");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** One private issuance transaction. Neither issuance nor a read creates a report or successor. */
@Injectable()
export class PrismaDiagnosticContinuityProofs implements DiagnosticContinuityProofsPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(STAFF_BINDING_PORT) private readonly staff: StaffBindingPort,
    @Inject(PrismaDiagnosticReports) private readonly reports: PrismaDiagnosticReports,
    @Inject(PrismaDiagnosticIdentityEvidence) private readonly evidence: PrismaDiagnosticIdentityEvidence,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  async issue(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance) {
    return this.db.$transaction(async tx => {
      // Identity owns sorted participant User/Session locks and the grant binding. Feature
      // locks follow those locks, matching assignment, revocation and account erasure.
      let staffBindings;
      try {
        staffBindings = await this.staff.bind([
          { ...subject, capability: "diagnostics.reviewer" },
          { userId: input.linkingTechnicianId, capability: "diagnostics.technician" },
        ], tx);
      } catch (error) { if (error instanceof StaffAuthorityDenied) throw denied(); throw error; }
      const pair = await this.reports.compared(tx, subject, orderId, input.predecessorId);
      const { order: b, prior: a, priorOrder: ao, comparison } = pair;
      // Full reviewer authority on both visits precedes every semantic conflict.
      await this.authority.order(tx, subject, ao.id, "diagnostics.reviewer");
      await this.authority.order(tx, subject, b.id, "diagnostics.reviewer");
      if (subject.userId === input.linkingTechnicianId || !this.runtime.syntheticAllowed({ userId: input.linkingTechnicianId, sessionId: "" })) throw denied();
      // Lock target assignments and qualifications in a stable order, then reread them.
      const assignments = await tx.$queryRaw<{ id: string; orderId: string; userId: string; capability: string; assignedAt: Date; revokedAt: Date | null }[]>`
        SELECT id,"orderId","userId",capability,"assignedAt","revokedAt" FROM diagnostic_order_assignments
        WHERE "orderId" IN (${ao.id},${b.id}) AND "userId" IN (${subject.userId},${input.linkingTechnicianId}) ORDER BY id FOR SHARE`;
      const qualifications = await tx.$queryRaw<{ id: string; centerId: string; userId: string; capability: string; qualifiedUntil: Date | null; revokedAt: Date | null; assignedAt: Date }[]>`
        SELECT id,"centerId","userId",capability,"qualifiedUntil","revokedAt","assignedAt" FROM diagnostic_center_assignments
        WHERE "centerId" IN (${ao.centerId},${b.centerId}) AND "userId" IN (${subject.userId},${input.linkingTechnicianId}) ORDER BY id FOR SHARE`;
      const t = input.linkingTechnicianId;
      if (!assignments.some(row => row.orderId === b.id && row.userId === t && row.capability === "diagnostics.technician" && !row.revokedAt) ||
        !qualifications.some(row => row.centerId === b.centerId && row.userId === t && row.capability === "diagnostics.technician" && !row.revokedAt && row.qualifiedUntil && row.qualifiedUntil > this.runtime.now())) throw denied();
      if (ao.audience !== "buyer_private" || a.audience !== "buyer_private" || b.audience !== "buyer_private" || !ao.commissionerId || ao.commissionerId !== b.commissionerId ||
        !ao.physicalAuthorization || !b.physicalAuthorization || b.status !== "arrived" ||
        await tx.diagnosticReportRecord.count({ where: { predecessorId: a.id } }) || await tx.diagnosticReportRecord.count({ where: { orderId: b.id } })) throw denied();
      if (a.version !== input.expectedPredecessorVersion || b.version !== input.expectedOrderVersion ||
        comparison.predecessor.identityRecordId !== input.predecessorIdentityRecordId || comparison.candidate.identityRecordId !== input.candidateIdentityRecordId) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const sides = [comparison.predecessor, comparison.candidate];
      const records = sides.flatMap(side => {
        const evidence = side.identity.evidence;
        if (!evidence || evidence.identityRecordId !== side.identityRecordId || evidence.observationHash !== side.identityRecordHash) throw denied();
        return [evidence, ...side.identity.corrections];
      });
      if (pair.provenance.size !== input.provenanceRecordIds.length || input.provenanceRecordIds.some(id => !pair.provenance.has(id))) throw denied();
      const provenance = await tx.diagnosticIdentityProvenance.findMany({ where: { id: { in: input.provenanceRecordIds } }, orderBy: { id: "asc" } });
      if (provenance.length !== input.provenanceRecordIds.length) throw denied();
      const side = (identity: D.DiagnosticComparisonIdentity) => {
        if (!identity.evidence) throw denied();
        const chain = [identity.evidence, ...identity.corrections];
        return { method: identity.observation.method, identifiers: chain.flatMap(record => record.identifiers), rightsUntil: chain.map(record => record.rights.schedule.until) };
      };
      const now = this.runtime.now();
      const rightsUntil = privateContinuityAttestation(side(comparison.predecessor.identity), side(comparison.candidate.identity), provenance.map(row => row.rightsUntil.toISOString()), now);
      const proofId = this.runtime.id();
      const content = D.DiagnosticContinuityProofSchema.parse({ proofId, policyVersion: "ADR-0108",
        predecessor: { reportId: a.id, reportVersion: a.version, snapshotHash: a.snapshotHash, identityRecordId: comparison.predecessor.identityRecordId, identityRecordHash: comparison.predecessor.identityRecordHash },
        candidate: { orderId: b.id, orderVersion: b.version, identityRecordId: comparison.candidate.identityRecordId, identityRecordHash: comparison.candidate.identityRecordHash },
        linkingTechnicianId: t, method: input.method, result: "same_vehicle", rationale: input.rationale,
        provenanceRecordIds: input.provenanceRecordIds, issuedBy: subject.userId, issuedAt: now.toISOString() });
      const visit = (order: typeof b) => ({ id: order.id, centerId: order.centerId, audience: order.audience, commissionerId: order.commissionerId,
        // Private proof has no public Listing authority, even if intake happens to name one.
        listingBinding: null, version: order.version, epoch: order.epoch, evidenceGeneration: order.identityEvidenceGeneration,
        physicalAuthorizationHash: hash(order.physicalAuthorization), observationHash: hash(order.observedVehicle) });
      await tx.diagnosticContinuityProof.create({ data: { id: proofId, predecessorReportId: a.id, predecessorOrderId: ao.id, candidateOrderId: b.id,
        issuerId: subject.userId, issuerSessionId: subject.sessionId, linkingTechnicianId: t, issuedAt: now, rightsUntil, content: json(content),
        bindings: json({ predecessor: visit(ao), candidate: visit(b), authority: staffBindings,
          evidencePins: sides.map(item => ({ orderId: item.identity.evidence?.orderId, id: item.identity.evidence?.id, hash: item.identity.evidence?.recordHash })),
          assignmentsHash: hash(assignments), qualificationsHash: hash(qualifications),
          evidence: records.map(record => ({ id: record.id, recordHash: record.recordHash, rightsHash: hash(record.rights) })),
          provenance: provenance.map(row => ({ id: row.id, sha256: row.sha256, epoch: row.epoch, rightsHash: hash(row.rights) })) }) } });
      // Audit holds no rationale, provenance, personal linkage or identity hashes.
      await tx.diagnosticAudit.create({ data: { id: this.runtime.id(), centerId: b.centerId, orderId: b.id, actorId: subject.userId,
        action: "CONTINUITY_PROOF_ISSUED", details: {}, createdAt: now } });
      return { proofId };
    });
  }

  async read(subject: DiagnosticSubject, orderId: string, proofId: string): Promise<D.DiagnosticContinuityProof> {
    return this.db.$transaction(async tx => {
      await this.authority.current(tx, subject);
      const initial = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
      if (!initial || initial.candidateOrderId !== orderId || !initial.predecessorOrderId) throw denied();
      for (const id of [orderId, initial.predecessorOrderId].sort()) await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
      const staffed = async (id: string) => {
        for (const capability of ["diagnostics.technician", "diagnostics.reviewer"] as const) {
          try { return (await this.authority.order(tx, subject, id, capability)).row; }
          catch (error) { if (!(error instanceof DiagnosticRuleError) || error.code !== "DIAGNOSTIC_NO_ACCESS") throw error; }
        }
        throw denied();
      };
      const b = await staffed(orderId); const a = await staffed(initial.predecessorOrderId);
      const proof = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
      if (!proof || proof.erasedAt || !proof.content || proof.rightsUntil <= this.runtime.now()) throw denied();
      const content = D.DiagnosticContinuityProofSchema.parse(proof.content);
      const bindings = z.object({ evidencePins: z.array(z.object({ orderId: z.string().uuid(), id: z.string().uuid(), hash: z.string() })).length(2) }).safeParse(proof.bindings);
      if (!bindings.success) throw denied();
      // A proof may remain readable as a historical restricted record after invalidation;
      // invalidatedAt permanently bars its future consumption, not current staff reads.
      for (const [order, pin] of [[a, content.predecessor], [b, content.candidate]] as const) {
        const raw = await tx.diagnosticIdentityRecord.findUnique({ where: { id: pin.identityRecordId } });
        if (!raw || raw.orderId !== order.id || raw.erasedAt || raw.observationHash !== pin.identityRecordHash) throw denied();
        const observation = D.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).safeParse(raw.observation);
        if (!observation.success) throw denied();
        // The selected evidence id/hash remains bound even when the visit's latest leaf changes.
        const evidence = bindings.data.evidencePins.find(item => item.orderId === order.id);
        if (!evidence) throw denied();
        await this.evidence.identity(tx, order, observation.data, evidence);
      }
      return content;
    });
  }
}
