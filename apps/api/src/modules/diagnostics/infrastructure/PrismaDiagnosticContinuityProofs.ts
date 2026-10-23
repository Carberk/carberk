import { DiagnosticDiscoveryCursor } from "./DiagnosticDiscoveryCursor";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
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

const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const hash = (value: unknown) => createHash("sha256").update(canonical(JSON.parse(JSON.stringify(value)))).digest("hex");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
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
  private async facts(tx: Tx, pair: Pair, staffing: Awaited<ReturnType<PrismaDiagnosticContinuityProofs["staffing"]>>, provenanceRecordIds: string[], authority: StaffBinding[], locked: PublisherParticipants) {
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
    const candidatePublic = await this.publicBindings.candidate(tx, b, locked);
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

  async issue(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance) {
    return this.db.$transaction(async tx => {
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
      this.pair(pair, input.method);
      if (await this.linked(tx, pair)) throw denied();
      if (a.version !== input.expectedPredecessorVersion || b.version !== input.expectedOrderVersion ||
        comparison.predecessor.identityRecordId !== input.predecessorIdentityRecordId || comparison.candidate.identityRecordId !== input.candidateIdentityRecordId) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const { provenance, bindings } = await this.facts(tx, pair, staffing, input.provenanceRecordIds, staffBindings, participants);
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
      await tx.diagnosticAudit.create({ data: { id: b.audience === "listing_public" ? proofId : this.runtime.id(), centerId: b.centerId, orderId: b.id, actorId: subject.userId,
        action: "CONTINUITY_PROOF_ISSUED", details: {}, createdAt: now } });
      return { proofId };
    });
  }

  /** B's linking technician consumes one unused pair-bound continuity proof into B's own empty
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
      const admitted = await this.admit(tx, subject, orderId, input.proofId, input.predecessorId, input);
      if (admitted.retried) return admitted.retried;
      return this.createFromAdmission(tx, subject, input, admitted);
    });
  }

  /** The same locked, read-only current admission drives discovery and first consumption. */
  private async admit(tx: Tx, subject: DiagnosticSubject, orderId: string, proofId: string, predecessorId: string, input?: D.DiagnosticReinspection & { proofId: string }) {
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

  private async createFromAdmission(tx: Tx, subject: DiagnosticSubject, input: D.DiagnosticReinspection & { proofId: string }, admitted: { proof: Prisma.DiagnosticContinuityProofGetPayload<object>; b: Order; a: Prisma.DiagnosticReportRecordGetPayload<object>; now: Date }) {
    const { proof, b, a, now } = admitted;
    await tx.diagnosticContinuityProof.update({ where: { id: proof.id }, data: { consumedReportId: input.reportId, consumedAt: now } });
    const created = await this.reports.openReinspection(tx, subject, b, a, input, proof.id);
    // Like issuance, the audit holds no rationale, provenance, personal linkage or identity hashes.
    await tx.diagnosticAudit.create({ data: { id: b.audience === "listing_public" ? created.id : this.runtime.id(), centerId: b.centerId, orderId: b.id, actorId: subject.userId,
      action: "CONTINUITY_PROOF_CONSUMED", details: { reportId: created.id }, createdAt: now } });
    return created;
  }

  /** Existing B result recovery deliberately never reads A or restricted proof payloads. */
  private async result(tx: Tx, subject: DiagnosticSubject, orderId: string) {
    const row = await tx.diagnosticReportRecord.findFirst({ where: { orderId, erasedAt: null, reinspection: true, continuityProofId: { not: null } } });
    if (!row || (row.state as { authorId?: string }).authorId !== subject.userId || !row.continuityProofId) return null;
    return { proofId: row.continuityProofId, reportId: row.id };
  }

  async handoffs(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery): Promise<D.DiagnosticContinuityHandoffs> {
    // Authorize B before cursor parsing/scan. A result is B-owned, even if erasure deleted its proof.
    await this.db.$transaction(tx => this.authority.order(tx, subject, orderId, "diagnostics.technician"));
    const position = this.cursors.open(query.cursor, subject, orderId, this.runtime.now(), "b-handoffs-v1");
    const rows = await this.db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: orderId, linkingTechnicianId: subject.userId,
      consumedReportId: null, issuedAt: { lte: new Date(position.until) }, ...(position.after ? { id: { gt: position.after.id } } : {}) },
      orderBy: { id: "asc" }, take: 21, select: { id: true, predecessorReportId: true, issuerId: true, issuedAt: true } });
    const page = rows.slice(0, 20);
    return this.db.$transaction(async tx => {
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
  }

  async useHandoff(subject: DiagnosticSubject, orderId: string, proofId: string, input: D.DiagnosticContinuityCommand): Promise<{ reportId: string }> {
    return this.db.$transaction(async tx => {
      const existing = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
      if (existing) {
        await this.reports.reinspectionLocks(tx, subject, orderId, "");
        // Resolve the surviving binding under B's lock, including severed A linkage.
        const current = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
        if (!current) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        const retry = await this.reports.reinspectionRetry(tx, subject, orderId, { ...input, proofId, predecessorId: current.predecessorId });
        if (!retry) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
        return { reportId: retry.id };
      }
      const initial = await tx.diagnosticContinuityProof.findUnique({ where: { id: proofId } });
      if (!initial?.predecessorReportId || initial.candidateOrderId !== orderId || initial.linkingTechnicianId !== subject.userId) throw denied();
      const bound = { ...input, proofId, predecessorId: initial.predecessorReportId };
      let admitted;
      try { admitted = await this.admit(tx, subject, orderId, proofId, initial.predecessorReportId, bound); }
      catch (error) { if (error instanceof DiagnosticRuleError) throw denied(); throw error; }
      const report = admitted.retried ?? await this.createFromAdmission(tx, subject, bound, admitted);
      return { reportId: report.id };
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
