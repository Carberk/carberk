import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import { PrismaService, Prisma, diagnosticReaderProjection } from "@auto-tm/db";
import { DiagnosticReport, type DiagnosticReportState } from "../domain/DiagnosticReport";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticReinspectionComparison, DiagnosticReportsPort } from "../domain/ports/DiagnosticReportsPort";
import { DiagnosticReportAccess } from "./DiagnosticReportAccess";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { DiagnosticPublicBindings } from "./DiagnosticPublicBindings";
import { canonical, PrismaDiagnosticIdentityEvidence } from "./PrismaDiagnosticIdentityEvidence";

type Tx = Prisma.TransactionClient;
type Row = Prisma.DiagnosticReportRecordGetPayload<object>;
type Order = Prisma.InspectionOrderGetPayload<object>;
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Serializes authorship/review with the same current order authority used by intake. */
@Injectable()
export class PrismaDiagnosticReports implements DiagnosticReportsPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime,
    @Inject(DiagnosticReportAccess) private readonly access: DiagnosticReportAccess,
    @Inject(PrismaDiagnosticIdentityEvidence) private readonly evidenceRecords: PrismaDiagnosticIdentityEvidence,
    @Inject(DiagnosticPublicBindings) private readonly publicBindings: DiagnosticPublicBindings) {}
  private async load(tx: Tx, subject: DiagnosticSubject, id: string, capability?: DiagnosticSchemas.DiagnosticCapability) {
    return this.access.load(tx, subject, id, capability);
  }
  private version(row: Row, expected: number): void {
    if (row.version !== expected) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
  }
  private async definition(tx: Tx, row: Pick<Row, "templateVersionId">) {
    const template = await tx.diagnosticTemplateVersion.findUnique({ where: { id: row.templateVersionId } });
    if (!template || !template.synthetic) throw denied();
    return DiagnosticSchemas.DiagnosticTemplateDefinitionSchema.parse(template.definition);
  }
  private async model(tx: Tx, row: Row): Promise<DiagnosticReport> {
    return new DiagnosticReport(row.state as unknown as DiagnosticReportState, await this.definition(tx, row));
  }
  private async dto(tx: Tx, row: Row, subject: DiagnosticSubject, staff: boolean, exactReceipt = false): Promise<DiagnosticSchemas.DiagnosticReportRecord> {
    const state = row.state as unknown as DiagnosticReportState;
    const historical = row.snapshot ? DiagnosticSchemas.DiagnosticReleasedSnapshotSchema.parse(row.snapshot).report : state;
    // Exact mutation retries retain their immutable consumption binding. Current
    // readers, including staff, receive the same erasure-safe projection.
    const released = exactReceipt ? historical : (await diagnosticReaderProjection(tx, row, historical)).report;
    return DiagnosticSchemas.DiagnosticReportSchema.parse({ ...released, status: row.status, withdrawnAt: row.withdrawnAt?.toISOString() ?? null, withdrawalReason: row.withdrawalReason,
      lineageKind: row.reinspection ? "reinspection" : row.predecessorId ? "correction" : "original",
      ...await this.access.successor(tx, row, subject.userId), authorId: staff ? state.authorId : null,
      reviewerId: staff ? state.reviewerId : null, version: row.version, template: await this.definition(tx, row), synthetic: true });
  }
  private async audit(tx: Tx, subject: DiagnosticSubject, order: Order, reportId: string, action: string, details: Prisma.InputJsonObject = {}): Promise<void> {
    await tx.diagnosticAudit.create({ data: { id: this.runtime.id(), centerId: order.centerId, orderId: order.id,
      actorId: subject.userId, action, details: { reportId, ...details }, createdAt: this.runtime.now() } });
  }
  private async persist(tx: Tx, row: Row, next: DiagnosticReportState) {
    return tx.diagnosticReportRecord.update({ where: { id: row.id }, data: { state: json(next), status: next.status, version: { increment: 1 },
      withdrawnAt: next.withdrawnAt ? new Date(next.withdrawnAt) : null, withdrawalReason: next.withdrawalReason } });
  }
  /** An order's first report is its original or the reinspection that opened it. */
  private firstReport(tx: Tx, orderId: string) {
    return tx.diagnosticReportRecord.findFirst({ where: { orderId, OR: [{ predecessorId: null }, { reinspection: true }] } });
  }
  /** Called under the order lock. Legacy orders without append-only history stay unpinned. */
  private async currentIdentity(tx: Tx, orderId: string) {
    return tx.diagnosticIdentityRecord.findFirst({ where: { orderId, erasedAt: null }, orderBy: { orderVersion: "desc" } });
  }
  /** Selected at first draft under the order lock; the database pin guard selects identically. */
  private async pins(tx: Tx, orderId: string) {
    const identity = await this.currentIdentity(tx, orderId);
    const evidence = await this.evidenceRecords.leaf(tx, orderId);
    return { identityRecordId: identity?.id ?? null, identityRecordHash: identity?.observationHash ?? null,
      identityEvidenceId: evidence?.id ?? null, identityEvidenceHash: evidence?.recordHash ?? null };
  }
  async comparison(subject: DiagnosticSubject, orderId: string, predecessorId: string): Promise<DiagnosticReinspectionComparison> {
    return this.db.$transaction(async tx => (await this.compared(tx, subject, orderId, predecessorId)).comparison);
  }
  /** Comparative bytes only for provenance pinned by this exact comparison, rechecked after storage I/O. */
  comparisonProvenance(subject: DiagnosticSubject, orderId: string, predecessorId: string, provenanceId: string) {
    return this.evidenceRecords.deliver(provenanceId, async tx => {
      const { provenance } = await this.compared(tx, subject, orderId, predecessorId);
      return row => provenance.has(row.id);
    });
  }
  async compared(tx: Tx, subject: DiagnosticSubject, orderId: string, predecessorId: string) {
    await this.publicBindings.pairLocks(tx, orderId, predecessorId, [subject.userId]);
    await this.authority.current(tx, subject);
    // Discover lock targets only. Match the existing cross-order write lock order,
    // then re-read all facts and current authority under those locks.
    const discovered = [await tx.inspectionOrder.findUnique({ where: { id: orderId } }),
      (await tx.diagnosticReportRecord.findUnique({ where: { id: predecessorId }, include: { order: true } }))?.order].filter(item => !!item);
    for (const id of [...new Set(discovered.flatMap(item => item.audience === "listing_public" && item.listingId ? [item.listingId] : []))].sort()) {
      await tx.$queryRaw`SELECT id FROM listings WHERE id=${id} FOR SHARE`;
    }
    for (const id of [...new Set(discovered.map(item => item.id))].sort()) await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${id} FOR UPDATE`;
    const staffOrder = async (id: string) => {
      for (const capability of ["diagnostics.technician", "diagnostics.reviewer"] as const) {
        try { return (await this.authority.order(tx, subject, id, capability)).row; }
        catch (error) { if (!(error instanceof DiagnosticRuleError) || error.code !== "DIAGNOSTIC_NO_ACCESS") throw error; }
      }
      throw denied();
    };
    const order = await staffOrder(orderId);
    await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${predecessorId} FOR SHARE`;
    const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: predecessorId } });
    if (!prior) throw denied();
    const priorOrder = await staffOrder(prior.orderId);
    if (prior.orderId === orderId || prior.erasedAt || !prior.snapshot || !prior.snapshotHash || !prior.identityRecordId || !prior.identityRecordHash ||
      !["finalized", "withdrawn"].includes(prior.status)) throw denied();
    const retained = await tx.diagnosticIdentityRecord.findUnique({ where: { id: prior.identityRecordId } });
    const candidate = await this.currentIdentity(tx, orderId);
    if (!retained || retained.erasedAt || retained.orderId !== prior.orderId || retained.observationHash !== prior.identityRecordHash || !candidate?.observationHash) throw denied();
    const observation = DiagnosticSchemas.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true });
    const before = observation.safeParse(retained.observation);
    const current = observation.safeParse(candidate.observation);
    if (!before.success || !current.success) throw denied();
    // A selects its report's immutable pins; B its current raw observation and structured leaf.
    const leaf = await this.evidenceRecords.leaf(tx, orderId);
    const a = await this.evidenceRecords.identity(tx, priorOrder, before.data, prior.identityEvidenceId && prior.identityEvidenceHash ? { id: prior.identityEvidenceId, hash: prior.identityEvidenceHash } : null);
    const b = await this.evidenceRecords.identity(tx, order, current.data, leaf && { id: leaf.id, hash: leaf.recordHash ?? "" });
    const comparison: DiagnosticReinspectionComparison = { predecessor: { reportId: prior.id, reportVersion: prior.version, snapshotHash: prior.snapshotHash,
      identityRecordId: retained.id, identityRecordHash: prior.identityRecordHash, identity: a.identity },
    candidate: { orderId, orderVersion: order.version, identityRecordId: candidate.id, identityRecordHash: candidate.observationHash, identity: b.identity } };
    return { comparison, order, prior, priorOrder, retained, candidate, provenance: new Set([...a.provenance, ...b.provenance]) };
  }
  async create(subject: DiagnosticSubject, orderId: string, input: DiagnosticSchemas.DiagnosticDraftCreate) {
    return this.db.$transaction(async tx => {
      const { row: order } = await this.authority.order(tx, subject, orderId, "diagnostics.technician");
      const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
      if (prior) {
        if (prior.orderId !== orderId || prior.predecessorId || prior.erasedAt || (prior.state as unknown as DiagnosticReportState).authorId !== subject.userId) throw denied();
        return this.dto(tx, prior, subject, true);
      }
      if (order.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const observed = DiagnosticSchemas.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).safeParse(order.observedVehicle);
      if (order.status !== "arrived" || !order.physicalAuthorization || !observed.success) throw new DiagnosticRuleError("DIAGNOSTIC_OBSERVATION_REQUIRED");
      if (await this.firstReport(tx, orderId)) throw new DiagnosticRuleError("DIAGNOSTIC_REPORT_EXISTS");
      const state: DiagnosticReportState = { id: input.reportId, orderId, audience: DiagnosticSchemas.DiagnosticAudienceSchema.parse(order.audience),
        templateVersionId: order.templateVersionId, status: "draft", observedAt: observed.data.observedAt, mileageKm: observed.data.mileageKm,
        findings: [], authorId: subject.userId, reviewerId: null, successorOf: null, correctionReason: null, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null };
      const row = await tx.diagnosticReportRecord.create({ data: { ...await this.pins(tx, orderId), id: input.reportId, orderId, audience: state.audience, templateVersionId: state.templateVersionId, state: json(state) } });
      await this.audit(tx, subject, order, row.id, "REPORT_DRAFT_CREATED");
      return this.dto(tx, row, subject, true);
    });
  }
  async read(subject: DiagnosticSubject, reportId: string) {
    return this.db.$transaction(async tx => { const { row, staff } = await this.load(tx, subject, reportId); return this.dto(tx, row, subject, staff); });
  }
  async forOrder(subject: DiagnosticSubject, orderId: string) {
    return this.db.$transaction(async tx => {
      const scope = await this.authority.order(tx, subject, orderId);
      const rows = await tx.diagnosticReportRecord.findMany({ where: { orderId, erasedAt: null, ...(!scope.staff ? { snapshotHash: { not: null } } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      return Promise.all(rows.map(row => this.dto(tx, row, subject, scope.staff)));
    });
  }
  private async evidence(tx: Tx, row: Row, state: DiagnosticReportState): Promise<void> {
    // Same-visit corrections reuse evidence. A reinspection opens a new visit, so the walk
    // includes it and never fetches an earlier order's report.
    const reportIds = [row.id];
    let predecessorId = row.reinspection ? null : row.predecessorId;
    while (predecessorId) {
      const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: predecessorId } });
      if (!prior || prior.orderId !== row.orderId || prior.audience !== row.audience || prior.erasedAt || reportIds.includes(prior.id)) throw denied();
      reportIds.push(prior.id); predecessorId = prior.reinspection ? null : prior.predecessorId;
    }
    const ids = state.findings.flatMap(finding => finding.evidenceIds);
    const records = await tx.diagnosticEvidence.findMany({ where: { id: { in: ids }, reportId: { in: reportIds }, state: "verified", cleanupRequestedAt: null } });
    for (const finding of state.findings) for (const id of finding.evidenceIds) {
      if (!records.some(record => record.id === id && record.findingId === finding.id)) throw new DiagnosticRuleError("REPORT_EVIDENCE_UNAVAILABLE");
    }
  }
  async save(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticFindingSave) {
    return this.db.$transaction(async tx => {
      const { row, order } = await this.load(tx, subject, reportId, "diagnostics.technician"); this.version(row, input.expectedVersion);
      const next = (await this.model(tx, row)).upsertFinding(subject.userId, input.finding).state;
      await this.evidence(tx, row, next);
      const saved = await this.persist(tx, row, next);
      const prior = (row.state as unknown as DiagnosticReportState).findings.flatMap(finding => finding.evidenceIds);
      const retained = new Set(next.findings.flatMap(finding => finding.evidenceIds));
      const removed = prior.filter(id => !retained.has(id));
      if (removed.length) await tx.diagnosticEvidence.updateMany({ where: { id: { in: removed }, reportId: row.id, state: "verified" }, data: { state: "cleanup_pending", cleanupRequestedAt: this.runtime.now() } });
      await this.audit(tx, subject, order, row.id, "REPORT_FINDING_SAVED", { findingId: input.finding.id, checkId: input.finding.checkId });
      return this.dto(tx, saved, subject, true);
    });
  }
  async transition(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticReportTransition) {
    return this.db.$transaction(async tx => {
      // Discover and lock publishers before load acquires any order/report/acting Business locks.
      const found = input.action === "finalize" ? await tx.diagnosticReportRecord.findUnique({ where: { id: reportId }, select: { orderId: true } }) : null;
      const participants = found ? await this.publicBindings.lock(tx, [found.orderId], [subject.userId]) : null;
      const capability = input.action === "submit" ? "diagnostics.technician" : "diagnostics.reviewer";
      const { row, order } = await this.load(tx, subject, reportId, capability); this.version(row, input.expectedVersion);
      const model = await this.model(tx, row);
      let next: DiagnosticReportState;
      if (input.action === "submit") {
        if (order.status !== "arrived" || !order.physicalAuthorization) throw new DiagnosticRuleError("PHYSICAL_AUTHORIZATION_REQUIRED");
        next = model.submit(subject.userId, []).state; await this.evidence(tx, row, next);
      } else if (input.action === "withdraw") next = model.withdraw(subject.userId, input.reason ?? "", this.runtime.now()).state;
      else {
        if (input.action === "finalize") { await this.evidence(tx, row, model.state); if (!participants) throw denied(); await this.publicBindings.candidate(tx, order, participants); }
        next = model.review(subject.userId, input.action === "return" ? "return" : "finalize", { now: this.runtime.now(), ...(input.reason ? { reason: input.reason } : {}),
          privateSelfReviewAuthorized: input.privateSelfReview === true && !!input.reason?.trim() }).state;
      }
      let saved: Row;
      if (input.action === "finalize") {
        const snapshot = json({ report: next, template: await this.definition(tx, row), synthetic: true });
        const hash = createHash("sha256").update(canonical(snapshot)).digest("hex");
        saved = await tx.diagnosticReportRecord.update({ where: { id: row.id }, data: { state: json(next), status: next.status, version: { increment: 1 }, snapshot, snapshotHash: hash, finalizedAt: this.runtime.now() } });
        const { rendererVersion } = await diagnosticReaderProjection(tx, saved, next);
        for (const locale of ["tk", "ru", "en"]) {
          const id = this.runtime.id();
          await tx.diagnosticPdfArtifact.create({ data: { id, reportId, snapshotHash: hash, locale, rendererVersion, objectKey: `diagnostic-pdf/${reportId}/${id}.pdf` } });
        }
      } else saved = await this.persist(tx, row, next);
      await this.audit(tx, subject, order, row.id, `REPORT_${input.action.toUpperCase()}`, { ...(input.reason ? { reason: input.reason } : {}), privateSelfReview: input.privateSelfReview === true && model.state.authorId === subject.userId });
      return this.dto(tx, saved, subject, true);
    });
  }
  async correct(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticCorrection) {
    return this.db.$transaction(async tx => {
      const { row, order } = await this.load(tx, subject, reportId, "diagnostics.technician");
      const existing = await tx.diagnosticReportRecord.findUnique({ where: { predecessorId: reportId } });
      if (existing) {
        const state = existing.state as unknown as DiagnosticReportState;
        if (existing.reinspection || existing.orderId !== order.id || existing.id !== input.successorId || state.correctionReason !== input.reason || state.authorId !== subject.userId || existing.erasedAt) throw new DiagnosticRuleError("DIAGNOSTIC_CORRECTION_CONFLICT");
        return this.dto(tx, existing, subject, true);
      }
      this.version(row, input.expectedVersion);
      const state = (await this.model(tx, row)).correct(input.successorId, subject.userId, input.reason).state;
      const saved = await tx.diagnosticReportRecord.create({ data: { id: state.id, orderId: order.id, audience: row.audience, templateVersionId: row.templateVersionId, predecessorId: row.id, identityRecordId: row.identityRecordId, identityRecordHash: row.identityRecordHash,
        identityEvidenceId: row.identityEvidenceId, identityEvidenceHash: row.identityEvidenceHash, state: json(state) } });
      await this.audit(tx, subject, order, saved.id, "REPORT_CORRECTION_CREATED", { predecessorId: row.id, reason: input.reason });
      return this.dto(tx, saved, subject, true);
    });
  }
  /** An exact retry authorizes only surviving B. The proof owner locks the complete
   * participant/pair union for first admission instead. */
  async reinspectionLocks(tx: Tx, subject: DiagnosticSubject, orderId: string, _predecessorId: string): Promise<Order> {
    // Exact retries need only B's current acting authority, never mutable A admission.
    await this.authority.current(tx, subject);
    return (await this.authority.order(tx, subject, orderId, "diagnostics.technician")).row;
  }
  /** Under reinspection locks. An existing report id returns its exact authorized result. A changed
   * predecessor, reason, author, proof or proof-bound expected order version conflicts. */
  async reinspectionRetry(tx: Tx, subject: DiagnosticSubject, orderId: string, input: Omit<DiagnosticSchemas.DiagnosticReinspection, "predecessorId"> & { predecessorId: string | null }) {
    const existing = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
    if (!existing) return null;
    const state = existing.state as unknown as DiagnosticReportState;
    if (!existing.reinspection || existing.orderId !== orderId || existing.predecessorId !== input.predecessorId || state.correctionReason !== input.reason ||
      state.authorId !== subject.userId || existing.erasedAt || existing.continuityProofId !== (input.proofId ?? null) ||
      (existing.continuityProofId && existing.reinspectionOrderVersion !== input.expectedOrderVersion)) throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
    return this.dto(tx, existing, subject, true, true);
  }
  /** B's arrived, physically authorized own observation, or refusal. */
  observed(order: Order) {
    const observed = DiagnosticSchemas.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).safeParse(order.observedVehicle);
    if (order.status !== "arrived" || !order.physicalAuthorization || !observed.success) throw new DiagnosticRuleError("DIAGNOSTIC_OBSERVATION_REQUIRED");
    return observed.data;
  }
  /** Under reinspection locks after admission: B's own empty first report with its own date,
   * mileage, template and pins, linked to `prior`, plus its audit. A proof binding is persisted
   * for exact retries; the database admits a link only with that consumed proof. */
  async openReinspection(tx: Tx, subject: DiagnosticSubject, order: Order, prior: Row, input: DiagnosticSchemas.DiagnosticReinspection, proofId: string | null, requestId?: string) {
    const observed = this.observed(order);
    const state = new DiagnosticReport(prior.state as unknown as DiagnosticReportState).reinspect({ reportId: input.reportId, orderId: order.id, templateVersionId: order.templateVersionId,
      authorId: subject.userId, observedAt: observed.observedAt, mileageKm: observed.mileageKm, reason: input.reason }).state;
    const pins = await this.pins(tx, order.id);
    let saved: Row;
    try {
      saved = await tx.diagnosticReportRecord.create({ data: { id: state.id, orderId: order.id, audience: state.audience, templateVersionId: state.templateVersionId, predecessorId: prior.id, reinspection: true, ...pins,
        ...(proofId ? { continuityProofId: proofId, reinspectionOrderVersion: input.expectedOrderVersion } : {}),
        ...(requestId ? { continuityRequestId: requestId, continuityRequestSessionId: subject.sessionId } : {}), state: json(state) } });
    } catch (error) {
      // Report id, predecessor, proof and first-report uniqueness are the only races left after locking.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
      throw error;
    }
    await this.audit(tx, subject, order, saved.id, "REPORT_REINSPECTION_CREATED", { predecessorId: prior.id, predecessorOrderId: prior.orderId, reason: state.correctionReason ?? input.reason });
    return this.dto(tx, saved, subject, true);
  }
  /** All new reinspection links require the consumed pair-bound proof adapter. */
  async reinspect(_subject: DiagnosticSubject, _orderId: string, _input: DiagnosticSchemas.DiagnosticReinspection): Promise<DiagnosticSchemas.DiagnosticReportRecord> {
    throw denied();
  }
}
