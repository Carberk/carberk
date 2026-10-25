import { DiagnosticDiscoveryCursor } from "./DiagnosticDiscoveryCursor";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, type PreparedDiagnosticSource, type DiagnosticSourceRoot, Prisma } from "@auto-tm/db";
import { STAFF_BINDING_PORT, StaffAuthorityDenied, type StaffBinding, type StaffBindingPort, type PublisherParticipants } from "../../identity/identity.public";
import type { DiagnosticContinuityProofsPort } from "../application/ports/DiagnosticContinuityProofsPort";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DiagnosticReport, type DiagnosticReportState } from "../domain/DiagnosticReport";
import { continuityPair } from "../domain/ContinuityPair";
import { DiagnosticPublicBindings } from "./DiagnosticPublicBindings";
import { privateContinuityAttestation } from "../domain/PrivateContinuityAttestation";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { canonical, PrismaDiagnosticIdentityEvidence } from "./PrismaDiagnosticIdentityEvidence";
import { PrismaDiagnosticReports } from "./PrismaDiagnosticReports";

import { diagnosticMutation, diagnosticPlannedRow, diagnosticReadPrefix, diagnosticRoots, diagnosticReceiptPrefix } from "./DiagnosticPreparedIntake";

const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const hash = (value: unknown) => createHash("sha256").update(canonical(JSON.parse(JSON.stringify(value)))).digest("hex");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
type ConsumptionPlan = { receipt: PreparedDiagnosticSource; report: Awaited<ReturnType<PrismaDiagnosticReports["reinspectionProposal"]>>; consumedAt: Date; audit: Prisma.DiagnosticAuditUncheckedCreateInput };
type Pair = Awaited<ReturnType<PrismaDiagnosticReports["compared"]>>;

/** Pair-bound private/public issuance and consumption transactions. Neither issuance nor a read creates a report or successor. */
@Injectable()
export class PrismaDiagnosticContinuityProofs implements DiagnosticContinuityProofsPort {
  constructor(@Inject(DiagnosticDiscoveryCursor) private readonly cursors: DiagnosticDiscoveryCursor,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(STAFF_BINDING_PORT) private readonly staff: StaffBindingPort,
    @Inject(PrismaDiagnosticReports) private readonly reports: PrismaDiagnosticReports,
    @Inject(PrismaDiagnosticIdentityEvidence) private readonly evidence: PrismaDiagnosticIdentityEvidence,
    @Inject(DiagnosticPublicBindings) private readonly publicBindings: DiagnosticPublicBindings,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  private proofRoot(id: string): DiagnosticSourceRoot { return { table: "diagnostic_continuity_proofs", key: { id } }; }
  private requestRoot(id: string): DiagnosticSourceRoot { return { table: "diagnostic_continuity_requests", key: { id } }; }
  private reportRoot(id: string): DiagnosticSourceRoot { return { table: "diagnostic_reports", key: { id } }; }
  /** All selectors, including absent destinations, are known before preparation.
   * The post-wait admission still checks every permission and retained binding. */
  private async consumption<T>(tx: Tx, subject: DiagnosticSubject, orderId: string, proofId: string, input: D.DiagnosticContinuityCommand,
    work: (plan?: ConsumptionPlan) => Promise<T>, requestId?: string) {
    const roots = [...diagnosticRoots(subject, [orderId]), this.reportRoot(input.reportId), ...(requestId ? [this.requestRoot(requestId)] : [])];
    const existing = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
    if (existing) { await diagnosticReadPrefix(tx, roots); return work(); }
    const proof = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
    const order = await tx.inspectionOrder.findUnique({ where: { id: orderId } });
    const prior = proof?.predecessorReportId ? await tx.diagnosticReportRecord.findUnique({ where: { id: proof.predecessorReportId } }) : null;
    if (!proof || !prior || !order || !proof.issuerId || !proof.issuerSessionId) {
      await diagnosticReadPrefix(tx, [...roots, this.proofRoot(proofId)]);
      await this.authority.order(tx, subject, orderId, "diagnostics.technician"); throw denied();
    }
    roots.push(this.proofRoot(proofId), this.reportRoot(prior.id), ...diagnosticRoots({ userId: proof.issuerId, sessionId: proof.issuerSessionId }, [prior.orderId]),
      ...(proof.linkingTechnicianId ? [{ table: "users" as const, key: { id: proof.linkingTechnicianId } }] : []));
    const bound = { ...input, proofId, predecessorId: prior.id };
    let report;
    try { report = await this.reports.reinspectionProposal(tx, subject, order, prior, bound, proofId, requestId); }
    catch (error) { await diagnosticReadPrefix(tx, roots); await this.authority.order(tx, subject, orderId, "diagnostics.technician"); throw error; }
    const consumedAt = this.runtime.now();
    const audit = { id: order.audience === "listing_public" ? input.reportId : this.runtime.id(), centerId: order.centerId, orderId,
      actorId: subject.userId, action: "CONTINUITY_PROOF_CONSUMED", details: { reportId: input.reportId }, createdAt: consumedAt };
    const rows = [await diagnosticPlannedRow(tx, this.proofRoot(proofId), { consumedReportId: input.reportId, consumedAt }),
      await diagnosticPlannedRow(tx, this.reportRoot(input.reportId), report.data, true),
      await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: report.audit.id } }, report.audit, true),
      await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: audit.id } }, audit, true)];
    return diagnosticMutation(tx, { operation: "proof_consume", roots, rows, actorUserId: subject.userId, sessionId: subject.sessionId, cutoff: null, campaign: null },
      receipt => work({ receipt, report, consumedAt, audit }));
  }
  /** Under the order locks: the issuer/technician pair's current assignments and qualifications,
   * with the linking technician's current B assignment and qualification. */
  private async staffing(tx: Tx, issuerId: string, technicianId: string, { order: b, priorOrder: ao }: Pair, locked = true) {
    // Lock target assignments and qualifications in a stable order, then reread them.
    const assignments = locked ? await tx.$queryRaw<{ id: string; orderId: string; userId: string; capability: string; assignedAt: Date; revokedAt: Date | null }[]>`
      SELECT id,"orderId","userId",capability,"assignedAt","revokedAt" FROM diagnostic_order_assignments
      WHERE "orderId" IN (${ao.id},${b.id}) AND "userId" IN (${issuerId},${technicianId}) ORDER BY id FOR SHARE` : await tx.diagnosticOrderAssignment.findMany({ where: { orderId: { in: [ao.id, b.id] }, userId: { in: [issuerId, technicianId] } },
        select: { id: true, orderId: true, userId: true, capability: true, assignedAt: true, revokedAt: true }, orderBy: { id: "asc" } });
    const qualifications = locked ? await tx.$queryRaw<{ id: string; centerId: string; userId: string; capability: string; qualifiedUntil: Date | null; revokedAt: Date | null; assignedAt: Date }[]>`
      SELECT id,"centerId","userId",capability,"qualifiedUntil","revokedAt","assignedAt" FROM diagnostic_center_assignments
      WHERE "centerId" IN (${ao.centerId},${b.centerId}) AND "userId" IN (${issuerId},${technicianId}) ORDER BY id FOR SHARE` : await tx.diagnosticCenterAssignment.findMany({ where: { centerId: { in: [ao.centerId, b.centerId] }, userId: { in: [issuerId, technicianId] } },
        select: { id: true, centerId: true, userId: true, capability: true, qualifiedUntil: true, revokedAt: true, assignedAt: true }, orderBy: { id: "asc" } });
    const t = technicianId;
    if (!assignments.some(row => row.orderId === b.id && row.userId === t && row.capability === "diagnostics.technician" && !row.revokedAt) ||
      !qualifications.some(row => row.centerId === b.centerId && row.userId === t && row.capability === "diagnostics.technician" && !row.revokedAt && row.qualifiedUntil && row.qualifiedUntil > this.runtime.now())) throw denied();
    return { assignments, qualifications };
  }
  /** Bound evidence/provenance and the visit, authority and staffing digests. Issuance stores
   * these; consumption requires them unchanged. */
  private async facts(tx: Tx, pair: Pair, staffing: Awaited<ReturnType<PrismaDiagnosticContinuityProofs["staffing"]>>, provenanceRecordIds: string[], authority: StaffBinding[], locked: PublisherParticipants, proposedPublic?: Awaited<ReturnType<DiagnosticPublicBindings["candidate"]>>) {
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
    const predecessorListing = await this.publicBindings.listing(tx, ao);
    const candidatePublic = proposedPublic === undefined ? await this.publicBindings.candidate(tx, b, locked) : proposedPublic;
    const visit = (order: Order, listingBinding: unknown) => ({ id: order.id, centerId: order.centerId, audience: order.audience, commissionerId: order.commissionerId,
      listingBinding, ...(order.audience === "listing_public" ? { publicationAuthorization: order.publicationAuthorization, publicationAuthorizationHash: hash(order.publicationAuthorization),
        associationValidatedAt: order.associationValidatedAt?.toISOString() ?? null, listingIdentityDigest: order.listingIdentityDigest } : {}), version: order.version, epoch: order.epoch, evidenceGeneration: order.identityEvidenceGeneration,
      physicalAuthorizationHash: hash(order.physicalAuthorization), observationHash: hash(order.observedVehicle) });
    const bindings = { predecessor: visit(ao, predecessorListing), candidate: visit(b, candidatePublic && { ...candidatePublic.listing, publisher: candidatePublic.publisher }), authority,
      evidencePins: sides.map(item => ({ orderId: item.identity.evidence?.orderId, id: item.identity.evidence?.id, hash: item.identity.evidence?.recordHash })),
      assignmentsHash: hash(staffing.assignments), qualificationsHash: hash(staffing.qualifications),
      evidence: records.map(record => ({ id: record.id, recordHash: record.recordHash, identityRecordId: record.identityRecordId,
        observationHash: record.observationHash, rightsHash: hash(record.rights) })),
      provenance: provenance.map(row => ({ id: row.id, sha256: row.sha256, epoch: row.epoch, rightsHash: hash(row.rights) })) };
    return { provenance, bindings };
  }
  private pair(pair: Pair, method: D.DiagnosticContinuityProof["method"]) {
    const visit = (order: Order) => ({ audience: order.audience, commissionerId: order.commissionerId, physicalAuthorized: !!order.physicalAuthorization });
    continuityPair(visit(pair.priorOrder), visit(pair.order), method);
    if (pair.prior.audience !== pair.priorOrder.audience || pair.order.status !== "arrived") throw denied();
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
    const correctedMixed = method === "comparative_attestation" && pair.comparison.predecessor.identity.observation.method !== pair.comparison.candidate.identity.observation.method &&
      identities.some(identity => identity.evidence?.correction || identity.corrections.length || identity.correctionHeadHash);
    const completeRaw = vinPair || correctedMixed;
    const side = async (order: Order, identity: D.DiagnosticComparisonIdentity) => {
      if (!identity.evidence) throw denied();
      const orderId = order.id;
      const chain = [identity.evidence, ...identity.corrections];
      const history = [];
      const rawRecords = [];
      let evidenceRecordCount = 0;
      if (method === "automatic_normalized_vin" || completeRaw) {
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
      const graph = manualCorrection || completeRaw ? {
        pin: { id: identity.evidence.id, recordHash: identity.evidence.recordHash,
          identityRecordId: identity.evidence.identityRecordId, observationHash: identity.evidence.observationHash },
        records: chain, ...(completeRaw ? { rawRecords, currentObservation } : {}),
      } : undefined;
      if (manualCorrection || completeRaw) evidenceRecordCount = await tx.diagnosticIdentityEvidence.count({ where: { orderId } });
      return { method: identity.observation.method, vin: identity.observation.vin, history, evidenceRecordCount, graph,
        corrected: !!identity.evidence.correction || !!identity.corrections.length || !!identity.correctionHeadHash,
        identifiers: chain.flatMap(record => record.identifiers), rightsUntil: chain.map(record => record.rights.schedule.until) };
    };
    return privateContinuityAttestation(await side(pair.priorOrder, pair.comparison.predecessor.identity),
      await side(pair.order, pair.comparison.candidate.identity), provenance.map(row => row.rightsUntil.toISOString()), now, method);
  }

  /** Read-only discovery uses the same complete retained graph/rights policy as comparative
   * admission. It neither grants issuance nor chooses a root or rewrites an original pin. */
  async retainedCandidate(tx: Tx, subject: DiagnosticSubject, orderId: string, predecessorId: string) {
    const pair = await this.reports.compared(tx, subject, orderId, predecessorId);
    await this.authority.order(tx, subject, pair.priorOrder.id, "diagnostics.reviewer");
    await this.authority.order(tx, subject, orderId, "diagnostics.reviewer");
    this.pair(pair, "comparative_attestation");
    const provenance = await tx.diagnosticIdentityProvenance.findMany({ where: { id: { in: [...pair.provenance] } } });
    if (provenance.length !== pair.provenance.size) throw denied();
    await this.comparisonRights(tx, pair, "comparative_attestation", provenance, this.runtime.now());
    const observation = pair.comparison.predecessor.identity.observation;
    return { reportId: predecessorId, observedAt: observation.observedAt, mileageKm: observation.mileageKm };
  }

  private async lockRequest(tx: Tx, subject: DiagnosticSubject, orderId: string, requestId: string, kind?: string) {
    await tx.$queryRaw`SELECT id FROM diagnostic_continuity_requests WHERE id=${requestId} FOR UPDATE`;
    const row = await tx.diagnosticContinuityRequest.findUnique({ where: { id: requestId } });
    if (!row || row.actorId !== subject.userId || row.sessionId !== subject.sessionId || row.orderId !== orderId || (kind && row.kind !== kind)) throw denied();
    return row;
  }
  private sameIssuance(proof: Prisma.DiagnosticContinuityProofGetPayload<object>, input: D.DiagnosticContinuityProofIssuance) {
    const stored = D.DiagnosticContinuityProofSchema.parse(proof.content);
    const original: D.DiagnosticContinuityProofIssuance = { predecessorId: stored.predecessor.reportId,
      expectedPredecessorVersion: stored.predecessor.reportVersion, expectedOrderVersion: stored.candidate.orderVersion,
      predecessorIdentityRecordId: stored.predecessor.identityRecordId, candidateIdentityRecordId: stored.candidate.identityRecordId,
      linkingTechnicianId: stored.linkingTechnicianId, method: stored.method, rationale: stored.rationale, provenanceRecordIds: stored.provenanceRecordIds };
    // Field order is irrelevant; provenance order, like the existing stored command, is exact.
    if (canonical(original) !== canonical(input)) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
  }
  private async requestAuthority(tx: Tx, subject: DiagnosticSubject, orderId: string, kind?: string) {
    if (kind) return this.authority.order(tx, subject, orderId, kind === "issue" ? "diagnostics.reviewer" : "diagnostics.technician");
    try { return await this.authority.order(tx, subject, orderId, "diagnostics.technician"); }
    catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
    return this.authority.order(tx, subject, orderId, "diagnostics.reviewer");
  }
  async prepareRequest(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityRequestPrepare): Promise<D.DiagnosticContinuityRequest> {
    return this.proofBoundary(async () => {
      return this.db.$transaction(async tx => {
        const requestId = this.runtime.id();
        const data = { id: requestId, actorId: subject.userId, sessionId: subject.sessionId, orderId, kind: input.kind, createdAt: this.runtime.now() };
        const row = await diagnosticPlannedRow(tx, this.requestRoot(requestId), data, true);
        return diagnosticMutation(tx, { operation: input.kind === "issue" ? "proof_issue" : "proof_consume", roots: [...diagnosticRoots(subject, [orderId]), this.requestRoot(requestId)], rows: [row],
          actorUserId: subject.userId, sessionId: subject.sessionId, cutoff: null, campaign: null }, async () => {
          await this.publicBindings.lock(tx, [orderId], [subject.userId]);
          await this.requestAuthority(tx, subject, orderId, input.kind);
          await tx.diagnosticContinuityRequest.create({ data });
          return D.DiagnosticContinuityRequestSchema.parse({ requestId, kind: input.kind, state: "pending_input" });
        });
      });
    });
  }
  /** All lock targets are discovered before the complete User/Business/Listing/order prefix.
   * Completed B requests deliberately discover no A/issuer target. */
  private async requestLocks(tx: Tx, subject: DiagnosticSubject, orderId: string, requestIds: string[]) {
    const proofs = await tx.diagnosticContinuityProof.findMany({ where: { requestId: { in: requestIds }, issuerId: subject.userId, issuerSessionId: subject.sessionId, candidateOrderId: orderId } });
    await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), ...requestIds.map(id => this.requestRoot(id)), ...proofs.map(proof => this.proofRoot(proof.id))]);
    await this.publicBindings.lock(tx, [orderId, ...new Set(proofs.flatMap(p => p.predecessorOrderId ? [p.predecessorOrderId] : []))],
      [subject.userId, ...proofs.flatMap(p => p.linkingTechnicianId ? [p.linkingTechnicianId] : [])]);
    const current = await tx.diagnosticContinuityProof.findMany({ where: { requestId: { in: requestIds }, issuerId: subject.userId, issuerSessionId: subject.sessionId, candidateOrderId: orderId } });
    const targets = (rows: typeof proofs) => rows.map(p => [p.id, p.predecessorOrderId, p.linkingTechnicianId]).sort();
    if (canonical(targets(proofs)) !== canonical(targets(current))) throw denied();
    return proofs;
  }
  private async requestOutcome(tx: Tx, subject: DiagnosticSubject, orderId: string, requestId: string): Promise<D.DiagnosticContinuityRequest> {
    // Kind is a selector only until locked and authenticated below.
    const initial = await tx.diagnosticContinuityRequest.findUnique({ where: { id: requestId } });
    if (!initial || initial.actorId !== subject.userId || initial.sessionId !== subject.sessionId || initial.orderId !== orderId) throw denied();
    await this.requestAuthority(tx, subject, orderId, initial.kind);
    const proof = initial.kind === "issue" ? await tx.diagnosticContinuityProof.findUnique({ where: { requestId } }) : null;
    const report = initial.kind === "consume" ? await tx.diagnosticReportRecord.findUnique({ where: { continuityRequestId: requestId } }) : null;
    if (proof) {
      if (!proof.predecessorOrderId || proof.issuerId !== subject.userId || proof.issuerSessionId !== subject.sessionId || proof.candidateOrderId !== orderId) throw denied();
      await this.authority.order(tx, subject, proof.predecessorOrderId, "diagnostics.reviewer");
      await tx.$queryRaw`SELECT id FROM diagnostic_continuity_proofs WHERE id=${proof.id} FOR UPDATE`;
    }
    if (report) await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${report.id} FOR UPDATE`;
    const row = await this.lockRequest(tx, subject, orderId, requestId, initial.kind);
    if (proof) {
      await this.readIn(tx, subject, orderId, proof.id);
      // Historical is deliberately not a usability certificate. B handoff discovery owns usability.
      return D.DiagnosticContinuityRequestSchema.parse({ requestId, kind: row.kind, state: "completed", proofId: proof.id, usability: "historical" });
    }
    if (report) {
      if (report.erasedAt || report.orderId !== orderId || report.continuityRequestSessionId !== subject.sessionId ||
        (report.state as unknown as DiagnosticReportState).authorId !== subject.userId || !report.continuityProofId) throw denied();
      return D.DiagnosticContinuityRequestSchema.parse({ requestId, kind: row.kind, state: "completed", result: { proofId: report.continuityProofId, reportId: report.id } });
    }
    return D.DiagnosticContinuityRequestSchema.parse({ requestId, kind: row.kind, state: "pending_input" });
  }
  async recoverRequest(subject: DiagnosticSubject, orderId: string, requestId: string): Promise<D.DiagnosticContinuityRequest> {
    return this.proofBoundary(async () => {
      return this.db.$transaction(async tx => {
        await this.requestLocks(tx, subject, orderId, [requestId]);
        return this.requestOutcome(tx, subject, orderId, requestId);
      });
    });
  }
  async discoverRequests(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery): Promise<D.DiagnosticContinuityRequests> {
    return this.proofBoundary(async () => {
      await this.db.$transaction(async tx => { await diagnosticReadPrefix(tx, diagnosticRoots(subject, [orderId])); return this.requestAuthority(tx, subject, orderId); });
      const position = this.cursors.open(query.cursor, subject, orderId, this.runtime.now(), "requests-v1");
      const rows = await this.db.diagnosticContinuityRequest.findMany({ where: { actorId: subject.userId, sessionId: subject.sessionId, orderId,
        createdAt: { lte: new Date(position.until) }, ...(position.after ? { id: { gt: position.after.id } } : {}) }, orderBy: { id: "asc" }, take: 21 });
      const page = rows.slice(0, 20);
      return this.db.$transaction(async tx => {
        await this.requestLocks(tx, subject, orderId, page.map(row => row.id));
        await this.requestAuthority(tx, subject, orderId);
        const requests: D.DiagnosticContinuityRequest[] = [];
        for (const row of page) {
          try { requests.push(await this.requestOutcome(tx, subject, orderId, row.id)); }
          catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
        }
        const last = page.at(-1);
        return D.DiagnosticContinuityRequestsSchema.parse({ requests,
          nextCursor: rows.length > 20 && last ? this.cursors.seal({ ...position, after: { at: last.createdAt.toISOString(), id: last.id } }) : null });
      });
    });
  }
  /** Translate only accepted stale-plan refusals, after exact request recovery.
   * Programming, finish, connection and transaction failures retain their identity. */
  private async proofBoundary<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) { if (this.requestRace(error)) throw denied(); throw error; }
  }
  /** A prepared loser may discover an already committed exact request result.
   * Only these SQL planning conflicts permit a fresh read, never another write. */
  private requestRace(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2010") return false;
    // Prisma adapter-pg retains the driver cause here, including after metadata JSON serialization.
    const adapter = error.meta?.["driverAdapterError"];
    if (typeof adapter !== "object" || adapter === null || !("cause" in adapter)) return false;
    const cause = adapter.cause;
    return typeof cause === "object" && cause !== null && "originalCode" in cause && cause.originalCode === "P0001" &&
      "originalMessage" in cause && (cause.originalMessage === "diagnostic_source_graph_changed" ||
        cause.originalMessage === "diagnostic_source_stale" || cause.originalMessage === "diagnostic_source_expected_absent");
  }
  async executeRequest(subject: DiagnosticSubject, orderId: string, requestId: string, input: D.DiagnosticContinuityRequestExecute): Promise<D.DiagnosticContinuityRequest> {
    return this.proofBoundary(async () => {
      if (input.kind === "issue") {
        const execute = () => this.db.$transaction(async tx => {
          const existing = await tx.diagnosticContinuityProof.findUnique({ where: { requestId } });
          if (existing) {
            await this.requestLocks(tx, subject, orderId, [requestId]);
            const result = await this.requestOutcome(tx, subject, orderId, requestId);
            this.sameIssuance(existing, input.command);
            return result;
          }
          await this.issueIn(tx, subject, orderId, input.command, requestId);
          // The full admission prefix is held already; avoid discovering new lock targets.
          return this.requestOutcome(tx, subject, orderId, requestId);
        });
        try { return await execute(); }
        catch (error) {
          if (!this.requestRace(error)) throw error;
          const winner = await this.db.diagnosticContinuityProof.findUnique({ where: { requestId } });
          if (!winner) throw error;
          return this.db.$transaction(async tx => {
            await this.requestLocks(tx, subject, orderId, [requestId]);
            const current = await tx.diagnosticContinuityProof.findUnique({ where: { requestId } });
            if (!current) throw error;
            const result = await this.requestOutcome(tx, subject, orderId, requestId);
            this.sameIssuance(current, input.command);
            return result;
          });
        }
      }
      const execute = () => this.db.$transaction(async tx => {
        const row = await tx.diagnosticContinuityRequest.findUnique({ where: { id: requestId } });
        if (!row || row.kind !== "consume" || row.actorId !== subject.userId || row.sessionId !== subject.sessionId || row.orderId !== orderId) throw denied();
        const completed = await tx.diagnosticReportRecord.findUnique({ where: { continuityRequestId: requestId } });
        if (completed && completed.id !== input.command.reportId) {
          await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), this.requestRoot(requestId), this.reportRoot(completed.id)]);
          await this.requestAuthority(tx, subject, orderId, "consume");
          throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        }
        await this.useHandoffIn(tx, subject, orderId, input.command.proofId, input.command, requestId);
        return this.requestOutcome(tx, subject, orderId, requestId);
      });
      try { return await execute(); }
      catch (error) {
        if (!(error instanceof DiagnosticRuleError) && !this.requestRace(error)) throw error;
        // A same-request winner may have committed while first admission waited and A was
        // subsequently erased. This is a read/exact-result path in a fresh transaction,
        // never a second attempt to mutate or a reason to repeat A admission.
        const completed = await this.db.diagnosticReportRecord.findUnique({ where: { continuityRequestId: requestId } });
        if (!completed) throw error;
        return this.db.$transaction(async tx => {
          await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), this.requestRoot(requestId), this.reportRoot(completed.id)]);
          await this.requestAuthority(tx, subject, orderId, "consume");
          if (completed.id !== input.command.reportId) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
          await this.useHandoffIn(tx, subject, orderId, input.command.proofId, input.command, requestId);
          return this.requestOutcome(tx, subject, orderId, requestId);
        });
      }
    });
  }

  async issue(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance) {
    return this.proofBoundary(async () => {
      return this.db.$transaction(tx => this.issueIn(tx, subject, orderId, input));
    });
  }
  /** Byte proposal for Identity-owned generation bindings. These unlocked
   * projections grant no authority. bind/candidate recompute and authorize the
   * exact generations after preparation; any format/fact change fails closed. */
  private async bindingProposal(tx: Tx, subject: DiagnosticSubject, technicianId: string) {
    const bindings: StaffBinding[] = [];
    for (const actor of [{ ...subject, capability: "diagnostics.reviewer" }, { userId: technicianId, sessionId: undefined, capability: "diagnostics.technician" }]) {
      const user = await tx.user.findUnique({ where: { id: actor.userId } });
      const grant = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: actor.userId, capability: actor.capability } } });
      const session = actor.sessionId ? await tx.session.findUnique({ where: { id: actor.sessionId } }) : null;
      if (!user || !grant || (actor.sessionId && !session)) throw denied();
      bindings.push({ userId: actor.userId, capability: actor.capability as StaffBinding["capability"], generation: createHash("sha256").update(JSON.stringify([
        user.id, user.suspendedAt, user.deletionScheduledAt, grant.userId, grant.capability, grant.grantedAt, grant.revokedAt,
        session && [session.id, session.userId, session.expiresAt, session.adminTotpExpiresAt],
      ])).digest("hex") });
    }
    return bindings;
  }
  private async publicationProposal(tx: Tx, order: Order): Promise<Awaited<ReturnType<DiagnosticPublicBindings["candidate"]>>> {
    const listing = await this.publicBindings.listing(tx, order);
    if (!listing) return null;
    if (!order.commissionerId || !order.publicationAuthorization || !order.associationValidatedAt || !order.listingIdentityDigest) throw denied();
    const user = await tx.user.findUnique({ where: { id: order.commissionerId } });
    const member = await tx.dealershipMember.findUnique({ where: { userId: order.commissionerId } });
    const business = listing.businessId ? await tx.dealership.findUnique({ where: { id: listing.businessId } }) : null;
    if (!user) throw denied();
    const publisher = { userId: user.id, sellerId: listing.sellerId, businessId: listing.businessId, membershipId: listing.businessId ? member?.id ?? null : null,
      generation: createHash("sha256").update(JSON.stringify([user.id, user.suspendedAt, user.deletionScheduledAt,
        listing.businessId && [business?.id, business?.status, member?.id, member?.userId, member?.dealershipId, member?.role, member?.status, member?.createdAt]])).digest("hex") };
    return { listing, publisher, publicationAuthorization: order.publicationAuthorization, associationValidatedAt: order.associationValidatedAt.toISOString(), listingIdentityDigest: order.listingIdentityDigest };
  }
  private async issueIn(tx: Tx, subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance, requestId?: string) {
    const roots = [...diagnosticRoots(subject, [orderId]), this.reportRoot(input.predecessorId), { table: "users" as const, key: { id: input.linkingTechnicianId } },
      ...input.provenanceRecordIds.map(id => ({ table: "diagnostic_identity_provenance" as const, key: { id } })), ...(requestId ? [this.requestRoot(requestId)] : [])];
    const existing = requestId ? await tx.diagnosticContinuityProof.findUnique({ where: { requestId } }) : null;
    if (existing) { await diagnosticReadPrefix(tx, [...roots, this.proofRoot(existing.id)]); return this.issuePrepared(tx, subject, orderId, input, undefined, requestId); }
    const proofId = this.runtime.id(), issuedAt = this.runtime.now();
    roots.push(this.proofRoot(proofId));
    let proposal;
    try {
      const pair = await this.reports.comparisonProposal(tx, orderId, input.predecessorId);
      const staffing = await this.staffing(tx, subject.userId, input.linkingTechnicianId, pair, false);
      const authority = await this.bindingProposal(tx, subject, input.linkingTechnicianId);
      const { provenance, bindings } = await this.facts(tx, pair, staffing, input.provenanceRecordIds, authority, { userIds: [], businessIds: [] }, await this.publicationProposal(tx, pair.order));
      const rightsUntil = await this.comparisonRights(tx, pair, input.method, provenance, issuedAt);
      const content = this.proofContent(subject, pair, input, proofId, issuedAt);
      const data = { id: proofId, requestId: requestId ?? null, predecessorReportId: pair.prior.id, predecessorOrderId: pair.priorOrder.id, candidateOrderId: orderId,
        issuerId: subject.userId, issuerSessionId: subject.sessionId, linkingTechnicianId: input.linkingTechnicianId, issuedAt, rightsUntil,
        content: json(content), bindings: json(bindings), invalidatedAt: null, consumedReportId: null, consumedAt: null, erasedAt: null };
      const audit = { id: pair.order.audience === "listing_public" ? proofId : this.runtime.id(), centerId: pair.order.centerId, orderId, actorId: subject.userId,
        action: "CONTINUITY_PROOF_ISSUED", details: {}, createdAt: issuedAt };
      proposal = { data, audit };
    } catch (error) {
      // No protected proposal or stale semantic detail is disclosed before the
      // same current dual-visit reviewer checks used by the locked issuer.
      await diagnosticReadPrefix(tx, roots);
      await this.reports.compared(tx, subject, orderId, input.predecessorId);
      const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: input.predecessorId } });
      if (!prior) throw denied();
      await this.authority.order(tx, subject, prior.orderId, "diagnostics.reviewer");
      await this.authority.order(tx, subject, orderId, "diagnostics.reviewer");
      throw error;
    }
    const rows = [await diagnosticPlannedRow(tx, this.proofRoot(proofId), proposal.data, true),
      await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: proposal.audit.id } }, proposal.audit, true)];
    return diagnosticMutation(tx, { operation: "proof_issue", roots, rows, actorUserId: subject.userId, sessionId: subject.sessionId, cutoff: null, campaign: null },
      receipt => this.issuePrepared(tx, subject, orderId, input, { ...proposal, receipt }, requestId));
  }
  private proofContent(subject: DiagnosticSubject, pair: Pair, input: D.DiagnosticContinuityProofIssuance, proofId: string, issuedAt: Date) {
    const { prior: a, order: b, comparison } = pair;
    return D.DiagnosticContinuityProofSchema.parse({ proofId, policyVersion: "ADR-0108",
      predecessor: { reportId: a.id, reportVersion: a.version, snapshotHash: a.snapshotHash, identityRecordId: comparison.predecessor.identityRecordId, identityRecordHash: comparison.predecessor.identityRecordHash },
      candidate: { orderId: b.id, orderVersion: b.version, identityRecordId: comparison.candidate.identityRecordId, identityRecordHash: comparison.candidate.identityRecordHash },
      linkingTechnicianId: input.linkingTechnicianId, method: input.method, result: "same_vehicle", rationale: input.rationale,
      provenanceRecordIds: input.provenanceRecordIds, issuedBy: subject.userId, issuedAt: issuedAt.toISOString() });
  }
  private async issuePrepared(tx: Tx, subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance,
    proposal: { receipt: PreparedDiagnosticSource; data: Prisma.DiagnosticContinuityProofUncheckedCreateInput; audit: Prisma.DiagnosticAuditUncheckedCreateInput } | undefined, requestId?: string) {
      if (proposal) await diagnosticReceiptPrefix(tx, proposal.receipt, "proof_issue");
      // Lock every actor/publisher User before Business and feature locks. The held Users
      // also serialize subsequent staff Session/grant checks with authority writers.
      const participants = await this.publicBindings.pairLocks(tx, orderId, input.predecessorId, [subject.userId, input.linkingTechnicianId]);
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
      if (requestId) {
        const existing = await tx.diagnosticContinuityProof.findUnique({ where: { requestId } });
        if (existing) await tx.$queryRaw`SELECT id FROM diagnostic_continuity_proofs WHERE id=${existing.id} FOR UPDATE`;
        await this.lockRequest(tx, subject, orderId, requestId, "issue");
        if (existing) {
          // A concurrent winner may have used different selectors. Never extend the
          // already held actor/order union to that winner behind feature/request locks.
          if (existing.predecessorOrderId !== ao.id || existing.linkingTechnicianId !== t) throw denied();
          this.sameIssuance(existing, input);
          await this.readIn(tx, subject, orderId, existing.id);
          return { proofId: existing.id };
        }
      }
      this.pair(pair, input.method);
      if (await this.linked(tx, pair)) throw denied();
      if (a.version !== input.expectedPredecessorVersion || b.version !== input.expectedOrderVersion ||
        comparison.predecessor.identityRecordId !== input.predecessorIdentityRecordId || comparison.candidate.identityRecordId !== input.candidateIdentityRecordId) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const { provenance, bindings } = await this.facts(tx, pair, staffing, input.provenanceRecordIds, staffBindings, participants);
      const now = this.runtime.now();
      const rightsUntil = await this.comparisonRights(tx, pair, input.method, provenance, now);
      if (!proposal || !(proposal.data.issuedAt instanceof Date)) throw denied();
      const proofId = proposal.data.id;
      const content = this.proofContent(subject, pair, input, proofId, proposal.data.issuedAt);
      if (canonical(json(content)) !== canonical(proposal.data.content) || canonical(json(bindings)) !== canonical(proposal.data.bindings) ||
        rightsUntil.valueOf() !== new Date(proposal.data.rightsUntil).valueOf()) throw denied();
      await tx.diagnosticContinuityProof.create({ data: proposal.data });
      await tx.diagnosticAudit.create({ data: proposal.audit });
      return { proofId };
  }

  /** B's linking technician consumes one unused pair-bound continuity proof into B's own empty
   * linked draft, with the proof marked consumed and both audits in one transaction. Every bound
   * fact and the issuer's current Session, qualification and both assignments are rechecked under
   * the issuance lock order. An existing report id is an exact retry: it returns the authorized
   * result or conflicts and never reruns admission, so later A changes cannot block B. */
  async consume(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticReinspection & { proofId: string }) {
    return this.proofBoundary(async () => {
      return this.db.$transaction(tx => this.consumption(tx, subject, orderId, input.proofId, input, async plan => {
        // Unlocked discovery selects the path and the issuer's identity lock targets only.
        if (await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId }, select: { id: true } })) {
          await this.reports.reinspectionLocks(tx, subject, orderId, input.predecessorId);
          const retried = await this.reports.reinspectionRetry(tx, subject, orderId, input);
          if (!retried) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
          return retried;
        }
        const admitted = await this.admit(tx, subject, orderId, input.proofId, input.predecessorId, input);
        if (admitted.retried) return admitted.retried;
        return this.createFromAdmission(tx, subject, input, admitted, plan);
      }));
    });
  }

  /** The same locked, read-only current admission drives discovery and first consumption. */
  private async admit(tx: Tx, subject: DiagnosticSubject, orderId: string, proofId: string, predecessorId: string, input?: D.DiagnosticReinspection & { proofId: string }, requestId?: string) {
    const initial = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
    if (!initial?.issuerId || !initial.issuerSessionId || initial.candidateOrderId !== orderId || initial.predecessorReportId !== predecessorId || initial.linkingTechnicianId !== subject.userId) throw denied();
    const issuer = { userId: initial.issuerId, sessionId: initial.issuerSessionId };
    // Lock the whole actor/publisher User union before any Business or feature locks.
    const participants = await this.publicBindings.pairLocks(tx, orderId, predecessorId, [issuer.userId, subject.userId]);
    let staffBindings;
    try {
      staffBindings = await this.staff.bind([
        { ...issuer, capability: "diagnostics.reviewer" },
        { userId: subject.userId, capability: "diagnostics.technician" },
      ], tx);
    } catch (error) { if (error instanceof StaffAuthorityDenied) throw denied(); throw error; }
    // The issuer's current comparative authority, rechecked as at issuance on both visits.
    const pair = await this.reports.compared(tx, issuer, orderId, predecessorId);
    const { prior: a, priorOrder: ao, comparison } = pair;
    await this.authority.order(tx, issuer, ao.id, "diagnostics.reviewer");
    await this.authority.order(tx, issuer, pair.order.id, "diagnostics.reviewer");
    // The acting linking technician's own current Session and B authority.
    const { row: b } = await this.authority.order(tx, subject, orderId, "diagnostics.technician");
    const current = { ...pair, order: b };
    await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${a.id} FOR UPDATE`;
    const staffing = await this.staffing(tx, issuer.userId, subject.userId, current);
    await tx.$queryRaw`SELECT id FROM diagnostic_continuity_proofs WHERE id=${proofId} FOR UPDATE`;
    if (requestId) {
      await this.lockRequest(tx, subject, orderId, requestId, "consume");
      const existing = input ? await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } }) : null;
      if (existing && existing.continuityRequestId !== requestId) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
    }
    const raced = input ? await this.reports.reinspectionRetry(tx, subject, orderId, input) : null;
    if (raced) return { retried: raced };
    const proof = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
    const content = D.DiagnosticContinuityProofSchema.safeParse(proof?.content);
    if (!proof || !content.success || content.data.proofId !== proof.id || proof.erasedAt || proof.candidateOrderId !== b.id || proof.predecessorReportId !== a.id || proof.predecessorOrderId !== ao.id ||
      proof.issuerId !== issuer.userId || proof.issuerSessionId !== issuer.sessionId || proof.linkingTechnicianId !== subject.userId ||
      content.data.issuedBy !== issuer.userId || content.data.linkingTechnicianId !== subject.userId) throw denied();
    if (proof.consumedReportId) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
    const now = this.runtime.now();
    // A public successor race is a link conflict after full reviewer and technician authority.
    if (b.audience === "listing_public" && await tx.diagnosticReportRecord.count({ where: { predecessorId: a.id } })) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
    // Invalidation is permanent; reverting a source value never revives the proof.
    if (proof.invalidatedAt || proof.rightsUntil <= now) throw denied();
    this.pair(current, content.data.method);
    // A successor elsewhere is a protected predecessor fact; B's own first report is not.
    if (await tx.diagnosticReportRecord.count({ where: { predecessorId: a.id } })) throw denied();
    if (await tx.diagnosticReportRecord.count({ where: { orderId: b.id } })) throw new DiagnosticRuleError("DIAGNOSTIC_REPORT_EXISTS");
    if (input && b.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
    const bound = content.data;
    if (b.version !== bound.candidate.orderVersion) throw denied();
    if (hash(bound.predecessor) !== hash({ reportId: a.id, reportVersion: a.version, snapshotHash: a.snapshotHash, identityRecordId: comparison.predecessor.identityRecordId, identityRecordHash: comparison.predecessor.identityRecordHash }) ||
      hash(bound.candidate) !== hash({ orderId: b.id, orderVersion: b.version, identityRecordId: comparison.candidate.identityRecordId, identityRecordHash: comparison.candidate.identityRecordHash })) throw denied();
    const { bindings, provenance } = await this.facts(tx, current, staffing, bound.provenanceRecordIds, staffBindings, participants);
    const rightsUntil = await this.comparisonRights(tx, current, bound.method, provenance, now);
    if (rightsUntil.valueOf() !== proof.rightsUntil.valueOf()) throw denied();
    if (hash(bindings) !== hash(proof.bindings)) throw denied();
    // Usable also means the same domain transition can open B's own empty draft.
    // This is pure validation; no report, id or audit is persisted by discovery.
    const observation = this.reports.observed(b);
    new DiagnosticReport(a.state as unknown as DiagnosticReportState).reinspect({ reportId: input?.reportId ?? proof.id,
      orderId: b.id, templateVersionId: b.templateVersionId, authorId: subject.userId, observedAt: observation.observedAt,
      mileageKm: observation.mileageKm, reason: input?.reason ?? "B-owned handoff" });
    return { proof, b, a, now, retried: null };
  }

  private async createFromAdmission(tx: Tx, subject: DiagnosticSubject, input: D.DiagnosticReinspection & { proofId: string }, admitted: { proof: Prisma.DiagnosticContinuityProofGetPayload<object>; b: Order; a: Prisma.DiagnosticReportRecordGetPayload<object>; now: Date }, plan: ConsumptionPlan | undefined, requestId?: string) {
    const { proof, b, a } = admitted;
    if (!plan) throw denied();
    await diagnosticReceiptPrefix(tx, plan.receipt, "proof_consume");
    await tx.diagnosticContinuityProof.update({ where: { id: proof.id }, data: { consumedReportId: input.reportId, consumedAt: plan.consumedAt } });
    const created = await this.reports.openReinspection(tx, subject, b, a, input, proof.id, plan.receipt, plan.report, requestId);
    await tx.diagnosticAudit.create({ data: plan.audit });
    return created;
  }

  /** Existing B result recovery deliberately never reads A or restricted proof payloads. */
  private async result(tx: Tx, subject: DiagnosticSubject, orderId: string) {
    const row = await tx.diagnosticReportRecord.findFirst({ where: { orderId, erasedAt: null, reinspection: true, continuityProofId: { not: null } } });
    if (!row || (row.state as { authorId?: string }).authorId !== subject.userId || !row.continuityProofId) return null;
    return { proofId: row.continuityProofId, reportId: row.id };
  }

  async handoffs(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery): Promise<D.DiagnosticContinuityHandoffs> {
    return this.proofBoundary(async () => {
      // Authorize B before cursor parsing/scan. A result is B-owned, even if erasure deleted its proof.
      await this.db.$transaction(async tx => { await diagnosticReadPrefix(tx, diagnosticRoots(subject, [orderId])); return this.authority.order(tx, subject, orderId, "diagnostics.technician"); });
      const position = this.cursors.open(query.cursor, subject, orderId, this.runtime.now(), "b-handoffs-v1");
      const rows = await this.db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: orderId, linkingTechnicianId: subject.userId,
        consumedReportId: null, issuedAt: { lte: new Date(position.until) }, ...(position.after ? { id: { gt: position.after.id } } : {}) },
        orderBy: { id: "asc" }, take: 21, select: { id: true, predecessorReportId: true, issuerId: true, issuedAt: true } });
      const page = rows.slice(0, 20);
      return this.db.$transaction(async tx => {
        await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), ...page.map(row => this.proofRoot(row.id))]);
        // Discover targets only; hold the full page's actor/order union before admitting any pair.
        const predecessors = await tx.diagnosticReportRecord.findMany({ where: { id: { in: page.flatMap(row => row.predecessorReportId ? [row.predecessorReportId] : []) } }, select: { orderId: true } });
        await this.publicBindings.lock(tx, [orderId, ...new Set(predecessors.map(row => row.orderId))],
          [subject.userId, ...page.flatMap(row => row.issuerId ? [row.issuerId] : [])]);
        await this.authority.order(tx, subject, orderId, "diagnostics.technician");
        const handoffs: D.DiagnosticContinuityHandoffs["handoffs"] = [];
        for (const row of page) {
          try {
            if (!row.predecessorReportId) throw denied();
            const admitted = await this.admit(tx, subject, orderId, row.id, row.predecessorReportId);
            if (!admitted.b) throw denied();
            handoffs.push({ proofId: row.id, status: "usable", expectedOrderVersion: admitted.b.version });
          } catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
        }
        const last = page.at(-1);
        const nextCursor = rows.length > 20 && last ? this.cursors.seal({ ...position, after: { at: last.issuedAt.toISOString(), id: last.id } }) : null;
        return D.DiagnosticContinuityHandoffsSchema.parse({ handoffs, result: await this.result(tx, subject, orderId), nextCursor, scope: "current_b_owned_handoffs" });
      });
    });
  }

  async useHandoff(subject: DiagnosticSubject, orderId: string, proofId: string, input: D.DiagnosticContinuityCommand): Promise<{ reportId: string }> {
    return this.proofBoundary(async () => {
      return this.db.$transaction(tx => this.useHandoffIn(tx, subject, orderId, proofId, input));
    });
  }
  private async useHandoffIn(tx: Tx, subject: DiagnosticSubject, orderId: string, proofId: string, input: D.DiagnosticContinuityCommand, requestId?: string): Promise<{ reportId: string }> {
    return this.consumption(tx, subject, orderId, proofId, input, async plan => {
      const existing = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
      if (existing) {
        await this.reports.reinspectionLocks(tx, subject, orderId, "");
        // Resolve the surviving binding under B's lock, including severed A linkage.
        const current = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
        if (!current) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${current.id} FOR UPDATE`;
        if (requestId) {
          await this.lockRequest(tx, subject, orderId, requestId, "consume");
          if (current.continuityRequestId !== requestId || current.continuityRequestSessionId !== subject.sessionId) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        }
        const retry = await this.reports.reinspectionRetry(tx, subject, orderId, { ...input, proofId, predecessorId: current.predecessorId });
        if (!retry) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        return { reportId: retry.id };
      }
      const initial = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
      if (!initial?.predecessorReportId || initial.candidateOrderId !== orderId || initial.linkingTechnicianId !== subject.userId) throw denied();
      const bound = { ...input, proofId, predecessorId: initial.predecessorReportId };
      let admitted;
      try { admitted = await this.admit(tx, subject, orderId, proofId, initial.predecessorReportId, bound, requestId); }
      catch (error) { if (error instanceof DiagnosticRuleError) throw denied(); throw error; }
      const report = admitted.retried ?? await this.createFromAdmission(tx, subject, bound, admitted, plan, requestId);
      return { reportId: report.id };
    }, requestId);
  }

  async read(subject: DiagnosticSubject, orderId: string, proofId: string): Promise<D.DiagnosticContinuityProof> {
    return this.proofBoundary(async () => {
      return this.db.$transaction(tx => this.readIn(tx, subject, orderId, proofId));
    });
  }
  private async readIn(tx: Tx, subject: DiagnosticSubject, orderId: string, proofId: string): Promise<D.DiagnosticContinuityProof> {
      await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), this.proofRoot(proofId)]);
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
  }
}
