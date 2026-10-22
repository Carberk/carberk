import { createHash } from "node:crypto";
import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { STAFF_BINDING_PORT, StaffAuthorityDenied, type StaffBinding, type StaffBindingPort } from "../../identity/identity.public";
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
type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
type Pair = Awaited<ReturnType<PrismaDiagnosticReports["compared"]>>;

/** Private issuance and consumption transactions. Neither issuance nor a read creates a report or successor. */
@Injectable()
export class PrismaDiagnosticContinuityProofs implements DiagnosticContinuityProofsPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(STAFF_BINDING_PORT) private readonly staff: StaffBindingPort,
    @Inject(PrismaDiagnosticReports) private readonly reports: PrismaDiagnosticReports,
    @Inject(PrismaDiagnosticIdentityEvidence) private readonly evidence: PrismaDiagnosticIdentityEvidence,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  /** Under the order locks: the issuer/technician pair's current assignments and qualifications,
   * with the linking technician's current B assignment and qualification. */
  private async staffing(tx: Tx, issuerId: string, technicianId: string, { order: b, priorOrder: ao }: Pair) {
    // Lock target assignments and qualifications in a stable order, then reread them.
    const assignments = await tx.$queryRaw<{ id: string; orderId: string; userId: string; capability: string; assignedAt: Date; revokedAt: Date | null }[]>`
      SELECT id,"orderId","userId",capability,"assignedAt","revokedAt" FROM diagnostic_order_assignments
      WHERE "orderId" IN (${ao.id},${b.id}) AND "userId" IN (${issuerId},${technicianId}) ORDER BY id FOR SHARE`;
    const qualifications = await tx.$queryRaw<{ id: string; centerId: string; userId: string; capability: string; qualifiedUntil: Date | null; revokedAt: Date | null; assignedAt: Date }[]>`
      SELECT id,"centerId","userId",capability,"qualifiedUntil","revokedAt","assignedAt" FROM diagnostic_center_assignments
      WHERE "centerId" IN (${ao.centerId},${b.centerId}) AND "userId" IN (${issuerId},${technicianId}) ORDER BY id FOR SHARE`;
    const t = technicianId;
    if (!assignments.some(row => row.orderId === b.id && row.userId === t && row.capability === "diagnostics.technician" && !row.revokedAt) ||
      !qualifications.some(row => row.centerId === b.centerId && row.userId === t && row.capability === "diagnostics.technician" && !row.revokedAt && row.qualifiedUntil && row.qualifiedUntil > this.runtime.now())) throw denied();
    return { assignments, qualifications };
  }
  /** Bound evidence/provenance and the visit, authority and staffing digests. Issuance stores
   * these; consumption requires them unchanged. */
  private async facts(tx: Tx, pair: Pair, staffing: Awaited<ReturnType<PrismaDiagnosticContinuityProofs["staffing"]>>, provenanceRecordIds: string[], authority: StaffBinding[]) {
    const { order: b, priorOrder: ao, comparison } = pair;
    const sides = [comparison.predecessor, comparison.candidate];
    const records = sides.flatMap(side => {
      const evidence = side.identity.evidence;
      if (!evidence || evidence.identityRecordId !== side.identityRecordId || evidence.observationHash !== side.identityRecordHash) throw denied();
      return [evidence, ...side.identity.corrections];
    });
    if (pair.provenance.size !== provenanceRecordIds.length || provenanceRecordIds.some(id => !pair.provenance.has(id))) throw denied();
    const provenance = await tx.diagnosticIdentityProvenance.findMany({ where: { id: { in: provenanceRecordIds } }, orderBy: { id: "asc" } });
    if (provenance.length !== provenanceRecordIds.length) throw denied();
    const visit = (order: Order) => ({ id: order.id, centerId: order.centerId, audience: order.audience, commissionerId: order.commissionerId,
      // Private proof has no public Listing authority, even if intake happens to name one.
      listingBinding: null, version: order.version, epoch: order.epoch, evidenceGeneration: order.identityEvidenceGeneration,
      physicalAuthorizationHash: hash(order.physicalAuthorization), observationHash: hash(order.observedVehicle) });
    const bindings = { predecessor: visit(ao), candidate: visit(b), authority,
      evidencePins: sides.map(item => ({ orderId: item.identity.evidence?.orderId, id: item.identity.evidence?.id, hash: item.identity.evidence?.recordHash })),
      assignmentsHash: hash(staffing.assignments), qualificationsHash: hash(staffing.qualifications),
      evidence: records.map(record => ({ id: record.id, recordHash: record.recordHash, identityRecordId: record.identityRecordId,
        observationHash: record.observationHash, rightsHash: hash(record.rights) })),
      provenance: provenance.map(row => ({ id: row.id, sha256: row.sha256, epoch: row.epoch, rightsHash: hash(row.rights) })) };
    return { provenance, bindings };
  }
  /** Same-commissioner private visits: retained finalized/withdrawn A, arrived physically authorized B. */
  private privatePair({ order: b, prior: a, priorOrder: ao }: Pair) {
    return ao.audience === "buyer_private" && a.audience === "buyer_private" && b.audience === "buyer_private" && !!ao.commissionerId && ao.commissionerId === b.commissionerId &&
      !!ao.physicalAuthorization && !!b.physicalAuthorization && b.status === "arrived";
  }
  private async linked(tx: Tx, { order: b, prior: a }: Pair) {
    return !!(await tx.diagnosticReportRecord.count({ where: { predecessorId: a.id } }) || await tx.diagnosticReportRecord.count({ where: { orderId: b.id } }));
  }

  /** Raw history is inspected under the same order locks as comparison. A restored VIN
   * cannot hide a prior different vehicle; visit date/mileage changes do not change identity. */
  private async comparisonRights(tx: Tx, pair: Pair, method: D.DiagnosticContinuityProof["method"], provenance: { rightsUntil: Date }[], now: Date) {
    const identities = [pair.comparison.predecessor.identity, pair.comparison.candidate.identity];
    const vinPair = method === "comparative_attestation" && identities.every(identity => identity.observation.method === "vin");
    const manualCorrection = method === "comparative_attestation" && identities.every(identity => identity.observation.method === "manual") &&
      identities.some(identity => identity.evidence?.correction || identity.corrections.length || identity.correctionHeadHash);
    const side = async (order: Order, identity: D.DiagnosticComparisonIdentity) => {
      if (!identity.evidence) throw denied();
      const orderId = order.id;
      const chain = [identity.evidence, ...identity.corrections];
      const history = [];
      const rawRecords = [];
      let evidenceRecordCount = 0;
      if (method === "automatic_normalized_vin" || vinPair) {
        if (method === "automatic_normalized_vin") {
          // Automatic admission requires exactly one unchanged root.
          const roots = await tx.diagnosticIdentityEvidence.findMany({ where: { orderId }, select: { id: true } });
          evidenceRecordCount = roots.some(root => root.id === identity.evidence?.id) ? roots.length : 0;
        }
        const current = D.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).safeParse(order.observedVehicle);
        if (!current.success) throw denied();
        history.push(current.data);
        const records = await tx.diagnosticIdentityRecord.findMany({ where: { orderId }, orderBy: { orderVersion: "asc" } });
        for (const record of records) {
          const observation = D.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).safeParse(record.observation);
          if (record.erasedAt || !record.observationHash || !observation.success) throw denied();
          history.push(observation.data);
          rawRecords.push({ id: record.id, observationHash: record.observationHash, observation: observation.data });
        }
      }
      // identity() returns the pin's explicit component, not every root on the order.
      // A supported correction must not conceal simultaneous disconnected claims.
      const currentObservation = history[0];
      const graph = manualCorrection || vinPair ? {
        pin: { id: identity.evidence.id, recordHash: identity.evidence.recordHash,
          identityRecordId: identity.evidence.identityRecordId, observationHash: identity.evidence.observationHash },
        records: chain, ...(vinPair ? { rawRecords, currentObservation } : {}),
      } : undefined;
      if (manualCorrection || vinPair) evidenceRecordCount = await tx.diagnosticIdentityEvidence.count({ where: { orderId } });
      return { method: identity.observation.method, vin: identity.observation.vin, history, evidenceRecordCount, graph,
        corrected: !!identity.evidence.correction || !!identity.corrections.length || !!identity.correctionHeadHash,
        identifiers: chain.flatMap(record => record.identifiers), rightsUntil: chain.map(record => record.rights.schedule.until) };
    };
    return privateContinuityAttestation(await side(pair.priorOrder, pair.comparison.predecessor.identity),
      await side(pair.order, pair.comparison.candidate.identity), provenance.map(row => row.rightsUntil.toISOString()), now, method);
  }

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
      const t = input.linkingTechnicianId;
      const staffing = await this.staffing(tx, subject.userId, t, pair);
      if (!this.privatePair(pair) || await this.linked(tx, pair)) throw denied();
      if (a.version !== input.expectedPredecessorVersion || b.version !== input.expectedOrderVersion ||
        comparison.predecessor.identityRecordId !== input.predecessorIdentityRecordId || comparison.candidate.identityRecordId !== input.candidateIdentityRecordId) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const { provenance, bindings } = await this.facts(tx, pair, staffing, input.provenanceRecordIds, staffBindings);
      const now = this.runtime.now();
      const rightsUntil = await this.comparisonRights(tx, pair, input.method, provenance, now);
      const proofId = this.runtime.id();
      const content = D.DiagnosticContinuityProofSchema.parse({ proofId, policyVersion: "ADR-0108",
        predecessor: { reportId: a.id, reportVersion: a.version, snapshotHash: a.snapshotHash, identityRecordId: comparison.predecessor.identityRecordId, identityRecordHash: comparison.predecessor.identityRecordHash },
        candidate: { orderId: b.id, orderVersion: b.version, identityRecordId: comparison.candidate.identityRecordId, identityRecordHash: comparison.candidate.identityRecordHash },
        linkingTechnicianId: t, method: input.method, result: "same_vehicle", rationale: input.rationale,
        provenanceRecordIds: input.provenanceRecordIds, issuedBy: subject.userId, issuedAt: now.toISOString() });
      await tx.diagnosticContinuityProof.create({ data: { id: proofId, predecessorReportId: a.id, predecessorOrderId: ao.id, candidateOrderId: b.id,
        issuerId: subject.userId, issuerSessionId: subject.sessionId, linkingTechnicianId: t, issuedAt: now, rightsUntil, content: json(content), bindings: json(bindings) } });
      // Audit holds no rationale, provenance, personal linkage or identity hashes.
      await tx.diagnosticAudit.create({ data: { id: this.runtime.id(), centerId: b.centerId, orderId: b.id, actorId: subject.userId,
        action: "CONTINUITY_PROOF_ISSUED", details: {}, createdAt: now } });
      return { proofId };
    });
  }

  /** B's linking technician consumes one unused private continuity proof into B's own empty
   * linked draft, with the proof marked consumed and both audits in one transaction. Every bound
   * fact and the issuer's current Session, qualification and both assignments are rechecked under
   * the issuance lock order. An existing report id is an exact retry: it returns the authorized
   * result or conflicts and never reruns admission, so later A changes cannot block B. */
  async consume(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticReinspection & { proofId: string }) {
    return this.db.$transaction(async tx => {
      // Unlocked discovery selects the path and the issuer's identity lock targets only.
      if (await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId }, select: { id: true } })) {
        await this.reports.reinspectionLocks(tx, subject, orderId, input.predecessorId);
        const retried = await this.reports.reinspectionRetry(tx, subject, orderId, input);
        if (!retried) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        return retried;
      }
      const initial = await tx.diagnosticContinuityProof.findUnique({ where: { id: input.proofId } });
      if (!initial?.issuerId || !initial.issuerSessionId || initial.linkingTechnicianId !== subject.userId) throw denied();
      const issuer = { userId: initial.issuerId, sessionId: initial.issuerSessionId };
      // Exactly the issuance binding shape: identity locks precede every feature lock.
      let staffBindings;
      try {
        staffBindings = await this.staff.bind([
          { ...issuer, capability: "diagnostics.reviewer" },
          { userId: subject.userId, capability: "diagnostics.technician" },
        ], tx);
      } catch (error) { if (error instanceof StaffAuthorityDenied) throw denied(); throw error; }
      // The issuer's current comparative authority, rechecked as at issuance on both visits.
      const pair = await this.reports.compared(tx, issuer, orderId, input.predecessorId);
      const { prior: a, priorOrder: ao, comparison } = pair;
      await this.authority.order(tx, issuer, ao.id, "diagnostics.reviewer");
      await this.authority.order(tx, issuer, pair.order.id, "diagnostics.reviewer");
      // The acting linking technician's own current Session and B authority.
      const { row: b } = await this.authority.order(tx, subject, orderId, "diagnostics.technician");
      const current = { ...pair, order: b };
      await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${a.id} FOR UPDATE`;
      const staffing = await this.staffing(tx, issuer.userId, subject.userId, current);
      await tx.$queryRaw`SELECT id FROM diagnostic_continuity_proofs WHERE id=${input.proofId} FOR UPDATE`;
      const raced = await this.reports.reinspectionRetry(tx, subject, orderId, input);
      if (raced) return raced;
      const proof = await tx.diagnosticContinuityProof.findUnique({ where: { id: input.proofId } });
      const content = D.DiagnosticContinuityProofSchema.safeParse(proof?.content);
      if (!proof || !content.success || proof.erasedAt || proof.candidateOrderId !== b.id || proof.predecessorReportId !== a.id || proof.predecessorOrderId !== ao.id ||
        proof.issuerId !== issuer.userId || proof.issuerSessionId !== issuer.sessionId || proof.linkingTechnicianId !== subject.userId ||
        content.data.issuedBy !== issuer.userId || content.data.linkingTechnicianId !== subject.userId) throw denied();
      if (proof.consumedReportId) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
      const now = this.runtime.now();
      // Invalidation is permanent; reverting a source value never revives the proof.
      if (proof.invalidatedAt || proof.rightsUntil <= now) throw denied();
      if (!this.privatePair(current)) throw denied();
      // A successor elsewhere is a protected predecessor fact; B's own first report is not.
      if (await tx.diagnosticReportRecord.count({ where: { predecessorId: a.id } })) throw denied();
      if (await tx.diagnosticReportRecord.count({ where: { orderId: b.id } })) throw new DiagnosticRuleError("DIAGNOSTIC_REPORT_EXISTS");
      if (b.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const bound = content.data;
      if (hash(bound.predecessor) !== hash({ reportId: a.id, reportVersion: a.version, snapshotHash: a.snapshotHash, identityRecordId: comparison.predecessor.identityRecordId, identityRecordHash: comparison.predecessor.identityRecordHash }) ||
        hash(bound.candidate) !== hash({ orderId: b.id, orderVersion: b.version, identityRecordId: comparison.candidate.identityRecordId, identityRecordHash: comparison.candidate.identityRecordHash })) throw denied();
      const { bindings, provenance } = await this.facts(tx, current, staffing, bound.provenanceRecordIds, staffBindings);
      const rightsUntil = await this.comparisonRights(tx, current, bound.method, provenance, now);
      if (rightsUntil.valueOf() !== proof.rightsUntil.valueOf()) throw denied();
      if (hash(bindings) !== hash(proof.bindings)) throw denied();
      await tx.diagnosticContinuityProof.update({ where: { id: proof.id }, data: { consumedReportId: input.reportId, consumedAt: now } });
      const created = await this.reports.openReinspection(tx, subject, b, a, input, proof.id);
      // Like issuance, the audit holds no rationale, provenance, personal linkage or identity hashes.
      await tx.diagnosticAudit.create({ data: { id: this.runtime.id(), centerId: b.centerId, orderId: b.id, actorId: subject.userId,
        action: "CONTINUITY_PROOF_CONSUMED", details: { reportId: created.id }, createdAt: now } });
      return created;
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
