import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import { PrismaService, Prisma, diagnosticReaderProjection, type DiagnosticSourceRoot, type DiagnosticSourceRow, type PreparedDiagnosticSource } from "@auto-tm/db";
import { DiagnosticReport, type DiagnosticReportState } from "../domain/DiagnosticReport";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticReinspectionComparison, DiagnosticReportsPort } from "../domain/ports/DiagnosticReportsPort";
import { DiagnosticReportAccess } from "./DiagnosticReportAccess";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { DiagnosticPublicBindings } from "./DiagnosticPublicBindings";
import { diagnosticListingDigest } from "./PrismaDiagnosticIntake";
import { canonical, PrismaDiagnosticIdentityEvidence } from "./PrismaDiagnosticIdentityEvidence";

import { diagnosticMutation, diagnosticPlannedRow, diagnosticReadPrefix, diagnosticRoots, diagnosticReceiptPrefix, diagnosticHasPrefix } from "./DiagnosticPreparedIntake";

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
  private reportRoot(id: string): DiagnosticSourceRoot { return { table: "diagnostic_reports", key: { id } }; }
  private roots(subject: DiagnosticSubject, orderId: string, reportId: string): DiagnosticSourceRoot[] {
    return [...diagnosticRoots(subject, [orderId]), this.reportRoot(reportId)];
  }
  private auditData(subject: DiagnosticSubject, order: Order, reportId: string, action: string, details: Prisma.InputJsonObject = {}) {
    return { id: this.runtime.id(), centerId: order.centerId, orderId: order.id, actorId: subject.userId, action, details: { reportId, ...details }, createdAt: this.runtime.now() };
  }
  private draftData(state: DiagnosticReportState, pins: { identityRecordId: string | null; identityRecordHash: string | null; identityEvidenceId: string | null; identityEvidenceHash: string | null }) {
    const now = this.runtime.now();
    return { id: state.id, orderId: state.orderId, audience: state.audience, templateVersionId: state.templateVersionId, predecessorId: state.successorOf,
      reinspection: false, ...pins, state: json(state), status: "draft", version: 0, snapshotHash: null, snapshot: null,
      continuityRequestId: null, continuityRequestSessionId: null, continuityProofId: null, reinspectionOrderVersion: null,
      finalizedAt: null, withdrawnAt: null, withdrawalReason: null, createdAt: now, updatedAt: now, erasedAt: null };
  }
  private async change<T>(tx: Tx, subject: DiagnosticSubject, roots: DiagnosticSourceRoot[], rows: DiagnosticSourceRow[], work: () => Promise<T>): Promise<T> {
    return diagnosticMutation(tx, { operation: "report_change", roots, rows, actorUserId: subject.userId, sessionId: subject.sessionId, cutoff: null, campaign: null }, work);
  }
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
  /** Only the first-draft pin may identify this release. Raw matching material never
   * enters the customer snapshot; recheck this proposal under the retained graph locks. */
  private async releaseIdentity(tx: Tx, row: Row, order: Order, display: DiagnosticSchemas.DiagnosticReportTransition["vehicleDisplay"]) {
    if (!row.identityRecordId || !row.identityRecordHash) throw new DiagnosticRuleError("REPORT_INCOMPLETE");
    const identity = await tx.diagnosticIdentityRecord.findUnique({ where: { id: row.identityRecordId } });
    const center = await tx.diagnosticCenter.findUnique({ where: { id: order.centerId } });
    if (!identity || identity.erasedAt || identity.orderId !== order.id || identity.observationHash !== row.identityRecordHash || !center) throw new DiagnosticRuleError("REPORT_INCOMPLETE");
    const observation = DiagnosticSchemas.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).parse(identity.observation);
    const state = row.state as unknown as DiagnosticReportState;
    if (observation.observedAt !== state.observedAt || observation.mileageKm !== state.mileageKm) throw new DiagnosticRuleError("REPORT_INCOMPLETE");
    if (observation.method === "manual" && !display) throw new DiagnosticRuleError("REPORT_INCOMPLETE");
    const vin = observation.method === "vin" ? observation.vin?.trim().toUpperCase() : null;
    const maskedVin = vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? `*************${vin.slice(-4)}` : null;
    // Catalog IDs describe only a still-validated association to this pinned observation.
    // Names are deliberately supplied by the reviewer, never read from mutable catalog rows.
    let catalog = null;
    if (order.listingId && order.associationValidatedAt && order.listingIdentityDigest && canonical(order.observedVehicle) === canonical(identity.observation)) {
      const listing = await tx.listing.findUnique({ where: { id: order.listingId } });
      if (listing && !listing.deletedAt && diagnosticListingDigest(listing) === order.listingIdentityDigest &&
        (observation.method === "manual" || listing.vin?.trim().toUpperCase() === vin)) {
        catalog = { brandId: listing.brandId, modelId: listing.modelId, year: listing.year };
      }
    }
    return DiagnosticSchemas.DiagnosticReleaseIdentitySchema.parse({ version: 1, center: { id: center.id, names: center.names },
      vehicle: { method: observation.method, maskedVin, display: display ?? null, catalog } });
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
  private async persist(tx: Tx, row: Row, next: DiagnosticReportState, updatedAt = this.runtime.now()) {
    return tx.diagnosticReportRecord.update({ where: { id: row.id }, data: { state: json(next), status: next.status, version: { increment: 1 }, updatedAt,
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
  async comparisonProvenance(subject: DiagnosticSubject, orderId: string, predecessorId: string, provenanceId: string) {
    let descriptor: { objectKey: string | null; sha256: string | null; sizeBytes: number | null; mime: string | null; epoch: string } | undefined;
    const result = await this.evidenceRecords.deliver(provenanceId, async tx => {
      const { provenance } = await this.compared(tx, subject, orderId, predecessorId);
      return row => {
        const current = { objectKey: row.objectKey, sha256: row.sha256, sizeBytes: row.sizeBytes, mime: row.mime, epoch: row.epoch };
        descriptor ??= current;
        return provenance.has(row.id) && canonical(current) === canonical(descriptor);
      };
    }, [...diagnosticRoots(subject, [orderId]), this.reportRoot(predecessorId), { table: "diagnostic_identity_provenance", key: { id: provenanceId } }]);
    if (!descriptor || result.bytes.byteLength !== descriptor.sizeBytes || createHash("sha256").update(result.bytes).digest("hex") !== descriptor.sha256) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
    return result;
  }
  async compared(tx: Tx, subject: DiagnosticSubject, orderId: string, predecessorId: string) {
    await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), this.reportRoot(predecessorId)]);
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
    return this.comparisonFacts(tx, order, prior, priorOrder, true);
  }
  /** Unlocked proposal, never authorization. The writer compares it to compared
   * after the sole outer receipt has locked and revalidated the complete graph. */
  async comparisonProposal(tx: Tx, orderId: string, predecessorId: string) {
    const order = await tx.inspectionOrder.findUnique({ where: { id: orderId } });
    const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: predecessorId } });
    const priorOrder = prior ? await tx.inspectionOrder.findUnique({ where: { id: prior.orderId } }) : null;
    if (!order || !prior || !priorOrder) throw denied();
    return this.comparisonFacts(tx, order, prior, priorOrder, false);
  }
  private async comparisonFacts(tx: Tx, order: Order, prior: Row, priorOrder: Order, locked: boolean) {
    const orderId = order.id;
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
    const a = await (locked ? this.evidenceRecords.identity.bind(this.evidenceRecords) : this.evidenceRecords.identityProposal.bind(this.evidenceRecords))(tx, priorOrder, before.data, prior.identityEvidenceId && prior.identityEvidenceHash ? { id: prior.identityEvidenceId, hash: prior.identityEvidenceHash } : null);
    const b = await (locked ? this.evidenceRecords.identity.bind(this.evidenceRecords) : this.evidenceRecords.identityProposal.bind(this.evidenceRecords))(tx, order, current.data, leaf && { id: leaf.id, hash: leaf.recordHash ?? "" });
    const comparison: DiagnosticReinspectionComparison = { predecessor: { reportId: prior.id, reportVersion: prior.version, snapshotHash: prior.snapshotHash,
      identityRecordId: retained.id, identityRecordHash: prior.identityRecordHash, identity: a.identity },
    candidate: { orderId, orderVersion: order.version, identityRecordId: candidate.id, identityRecordHash: candidate.observationHash, identity: b.identity } };
    return { comparison, order, prior, priorOrder, retained, candidate, provenance: new Set([...a.provenance, ...b.provenance]) };
  }
  async create(subject: DiagnosticSubject, orderId: string, input: DiagnosticSchemas.DiagnosticDraftCreate) {
    return this.db.$transaction(async tx => {
      const roots = this.roots(subject, orderId, input.reportId);
      const initial = await tx.inspectionOrder.findUnique({ where: { id: orderId } });
      const existing = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
      // Retry/refusal paths have no source mutation. Reauthorize the locked current
      // row, including after waiting, before returning any saved result or conflict.
      const authorize = async () => (await this.authority.order(tx, subject, orderId, "diagnostics.technician")).row;
      const retry = async () => {
        await diagnosticReadPrefix(tx, roots); await authorize();
        const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
        if (!prior || prior.orderId !== orderId || prior.predecessorId || prior.erasedAt || (prior.state as unknown as DiagnosticReportState).authorId !== subject.userId) throw denied();
        return this.dto(tx, prior, subject, true);
      };
      if (existing) return retry();
      if (!initial || initial.version !== input.expectedOrderVersion) {
        await diagnosticReadPrefix(tx, roots); const order = await authorize();
        if (order.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
        throw denied();
      }
      let observation;
      try { observation = this.observed(initial); }
      catch (error) { await diagnosticReadPrefix(tx, roots); await authorize(); throw error; }
      const state: DiagnosticReportState = { id: input.reportId, orderId, audience: DiagnosticSchemas.DiagnosticAudienceSchema.parse(initial.audience),
        templateVersionId: initial.templateVersionId, status: "draft", observedAt: observation.observedAt, mileageKm: observation.mileageKm,
        findings: [], authorId: subject.userId, reviewerId: null, successorOf: null, correctionReason: null, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null };
      // These are unlocked proposal reads. SQL compares exact OLD facts and the
      // complete retained graph after waiting; the selected pins are checked again.
      const data = this.draftData(state, await this.pins(tx, orderId));
      const audit = this.auditData(subject, initial, input.reportId, "REPORT_DRAFT_CREATED");
      const rows = [await diagnosticPlannedRow(tx, this.reportRoot(input.reportId), data, true),
        await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: audit.id } }, audit, true)];
      return this.change(tx, subject, roots, rows, async () => {
        const order = await authorize();
        if (order.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
        this.observed(order);
        if (await this.firstReport(tx, orderId)) throw new DiagnosticRuleError("DIAGNOSTIC_REPORT_EXISTS");
        if (canonical(await this.pins(tx, orderId)) !== canonical({ identityRecordId: data.identityRecordId, identityRecordHash: data.identityRecordHash, identityEvidenceId: data.identityEvidenceId, identityEvidenceHash: data.identityEvidenceHash })) throw denied();
        const row = await tx.diagnosticReportRecord.create({ data: { ...data, snapshot: Prisma.DbNull } });
        await tx.diagnosticAudit.create({ data: audit });
        return this.dto(tx, row, subject, true);
      });
    });
  }
  async read(subject: DiagnosticSubject, reportId: string) {
    return this.db.$transaction(async tx => { const { row, staff } = await this.load(tx, subject, reportId); return this.dto(tx, row, subject, staff); });
  }
  async forOrder(subject: DiagnosticSubject, orderId: string) {
    return this.db.$transaction(async tx => {
      await diagnosticReadPrefix(tx, diagnosticRoots(subject, [orderId]));
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
      const initial = await tx.diagnosticReportRecord.findUnique({ where: { id: reportId } });
      if (!initial) { await this.load(tx, subject, reportId, "diagnostics.technician"); throw denied(); }
      const roots = this.roots(subject, initial.orderId, reportId);
      let proposed: DiagnosticReportState;
      try { proposed = (await this.model(tx, initial)).upsertFinding(subject.userId, input.finding).state; }
      catch (error) { const { row } = await this.load(tx, subject, reportId, "diagnostics.technician"); this.version(row, input.expectedVersion); throw error; }
      const kept = new Set(proposed.findings.flatMap(finding => finding.evidenceIds));
      const removed = (initial.state as unknown as DiagnosticReportState).findings.flatMap(finding => finding.evidenceIds).filter(id => !kept.has(id));
      const retired = await tx.diagnosticEvidence.findMany({ where: { id: { in: removed }, reportId, state: "verified" }, orderBy: { id: "asc" } });
      const updatedAt = this.runtime.now();
      const auditOrder = await tx.inspectionOrder.findUnique({ where: { id: initial.orderId } });
      if (!auditOrder) throw denied();
      const audit = this.auditData(subject, auditOrder, reportId, "REPORT_FINDING_SAVED", { findingId: input.finding.id, checkId: input.finding.checkId });
      const rows = [await diagnosticPlannedRow(tx, this.reportRoot(reportId), { state: json(proposed), status: proposed.status, version: initial.version + 1, updatedAt }),
        await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: audit.id } }, audit, true)];
      for (const evidence of retired) rows.push(await diagnosticPlannedRow(tx, { table: "diagnostic_evidence", key: { id: evidence.id } }, { state: "cleanup_pending", cleanupRequestedAt: updatedAt }));
      return this.change(tx, subject, roots, rows, async () => {
        const { row } = await this.load(tx, subject, reportId, "diagnostics.technician"); this.version(row, input.expectedVersion);
        const next = (await this.model(tx, row)).upsertFinding(subject.userId, input.finding).state;
        if (canonical(next) !== canonical(proposed)) throw denied();
        await this.evidence(tx, row, next);
        const saved = await this.persist(tx, row, next, updatedAt);
        for (const evidence of retired) await tx.diagnosticEvidence.update({ where: { id: evidence.id }, data: { state: "cleanup_pending", cleanupRequestedAt: updatedAt } });
        await tx.diagnosticAudit.create({ data: audit });
        return this.dto(tx, saved, subject, true);
      });
    });
  }
  async transition(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticReportTransition) {
    return this.db.$transaction(async tx => {
      const initial = await tx.diagnosticReportRecord.findUnique({ where: { id: reportId } });
      if (!initial) { await this.load(tx, subject, reportId); throw denied(); }
      const order = await tx.inspectionOrder.findUnique({ where: { id: initial.orderId } });
      if (!order) throw denied();
      const now = this.runtime.now(), model = await this.model(tx, initial);
      const capability = input.action === "submit" ? "diagnostics.technician" : "diagnostics.reviewer";
      const compute = (model: DiagnosticReport) => input.action === "submit" ? model.submit(subject.userId, []).state
        : input.action === "withdraw" ? model.withdraw(subject.userId, input.reason ?? "", now).state
        : model.review(subject.userId, input.action === "return" ? "return" : "finalize", { now, ...(input.reason ? { reason: input.reason } : {}), privateSelfReviewAuthorized: input.privateSelfReview === true && !!input.reason?.trim() }).state;
      let next: DiagnosticReportState;
      try { next = compute(model); }
      catch (error) { const { row } = await this.load(tx, subject, reportId, capability); this.version(row, input.expectedVersion); throw error; }
      const audit = this.auditData(subject, order, reportId, `REPORT_${input.action.toUpperCase()}`, { ...(input.reason ? { reason: input.reason } : {}), privateSelfReview: input.privateSelfReview === true && model.state.authorId === subject.userId });
      let identity: ReturnType<typeof DiagnosticSchemas.DiagnosticReleaseIdentitySchema.parse> | null = null;
      try { if (input.action === "finalize") identity = await this.releaseIdentity(tx, initial, order, input.vehicleDisplay); }
      catch (error) { const { row } = await this.load(tx, subject, reportId, capability); this.version(row, input.expectedVersion); throw error; }
      const snapshot = identity ? json({ report: { ...next, releaseIdentity: identity }, template: await this.definition(tx, initial), synthetic: true }) : null;
      const snapshotHash = snapshot ? createHash("sha256").update(canonical(snapshot)).digest("hex") : null;
      const final = snapshot && snapshotHash ? { snapshot, snapshotHash, finalizedAt: now } : null;
      const reportNext = { state: json(next), status: next.status, version: initial.version + 1, updatedAt: now,
        withdrawnAt: next.withdrawnAt ? new Date(next.withdrawnAt) : null, withdrawalReason: next.withdrawalReason, ...final };
      const rows = [await diagnosticPlannedRow(tx, this.reportRoot(reportId), reportNext),
        await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: audit.id } }, audit, true)];
      const artifacts: Prisma.DiagnosticPdfArtifactUncheckedCreateInput[] = [];
      if (final) {
        const { rendererVersion } = await diagnosticReaderProjection(tx, initial, next);
        for (const locale of ["tk", "ru", "en"]) {
          const id = this.runtime.id();
          const data = { id, reportId, snapshotHash: final.snapshotHash, locale, rendererVersion, generation: 1, epoch: this.runtime.id(), state: "pending",
            objectKey: `diagnostic-pdf/${reportId}/${id}.pdf`, sha256: null, sizeBytes: null, attempts: 0, retryAt: null, failureCode: null, leaseUntil: null,
            createdAt: now, verifiedAt: null, cleanupRequestedAt: null, cleanupCompletedAt: null };
          artifacts.push(data); rows.push(await diagnosticPlannedRow(tx, { table: "diagnostic_pdf_artifacts", key: { id } }, data, true));
        }
      }
      return this.change(tx, subject, this.roots(subject, order.id, reportId), rows, async () => {
        // Receipt already holds the complete participant/FK/absent-artifact union.
        const participants = final ? await this.publicBindings.lock(tx, [order.id], [subject.userId]) : null;
        const { row, order: currentOrder } = await this.load(tx, subject, reportId, capability);
        this.version(row, input.expectedVersion);
        const current = compute(await this.model(tx, row));
        if (canonical(current) !== canonical(next)) throw denied();
        if (input.action === "submit") {
          if (currentOrder.status !== "arrived" || !currentOrder.physicalAuthorization) throw new DiagnosticRuleError("PHYSICAL_AUTHORIZATION_REQUIRED");
          await this.evidence(tx, row, current);
        }
        if (final) {
          await this.evidence(tx, row, current);
          if (!participants) throw denied();
          await this.publicBindings.candidate(tx, currentOrder, participants);
          if (canonical(await this.releaseIdentity(tx, row, currentOrder, input.vehicleDisplay)) !== canonical(identity)) throw denied();
        }
        const saved = await tx.diagnosticReportRecord.update({ where: { id: reportId }, data: reportNext });
        if (final) {
          const { rendererVersion } = await diagnosticReaderProjection(tx, saved, current);
          if (artifacts.some(artifact => artifact.rendererVersion !== rendererVersion)) throw denied();
          for (const artifact of artifacts) await tx.diagnosticPdfArtifact.create({ data: artifact });
        }
        await tx.diagnosticAudit.create({ data: audit });
        return this.dto(tx, saved, subject, true);
      });
    });
  }
  async correct(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticCorrection) {
    return this.db.$transaction(async tx => {
      const initial = await tx.diagnosticReportRecord.findUnique({ where: { id: reportId } });
      const roots = [...diagnosticRoots(subject), this.reportRoot(reportId), this.reportRoot(input.successorId)];
      const initialSuccessor = await tx.diagnosticReportRecord.findUnique({ where: { predecessorId: reportId } });
      const work = async () => {
      const { row, order } = await this.load(tx, subject, reportId, "diagnostics.technician");
      const existing = await tx.diagnosticReportRecord.findUnique({ where: { predecessorId: reportId } });
      if (existing) {
        const state = existing.state as unknown as DiagnosticReportState;
        if (existing.reinspection || existing.orderId !== order.id || existing.id !== input.successorId || state.correctionReason !== input.reason || state.authorId !== subject.userId || existing.erasedAt) throw new DiagnosticRuleError("DIAGNOSTIC_CORRECTION_CONFLICT");
        return this.dto(tx, existing, subject, true);
      }
      if (initialSuccessor || !initial) throw new DiagnosticRuleError("DIAGNOSTIC_CORRECTION_CONFLICT");
      this.version(row, input.expectedVersion);
      const state = (await this.model(tx, row)).correct(input.successorId, subject.userId, input.reason).state;
      const data = this.draftData(state, { identityRecordId: row.identityRecordId, identityRecordHash: row.identityRecordHash, identityEvidenceId: row.identityEvidenceId, identityEvidenceHash: row.identityEvidenceHash });
      if (!proposal || canonical(state) !== canonical(proposal.state)) throw denied();
      const saved = await tx.diagnosticReportRecord.create({ data: { ...data, ...proposal.data, snapshot: Prisma.DbNull } });
      await tx.diagnosticAudit.create({ data: proposal.audit });
      return this.dto(tx, saved, subject, true);
      };
      if (initialSuccessor || !initial) { await diagnosticReadPrefix(tx, roots); return work(); }
      let state: DiagnosticReportState;
      try { state = (await this.model(tx, initial)).correct(input.successorId, subject.userId, input.reason).state; }
      catch (error) { const { row } = await this.load(tx, subject, reportId, "diagnostics.technician"); this.version(row, input.expectedVersion); throw error; }
      const order = await tx.inspectionOrder.findUnique({ where: { id: initial.orderId } });
      if (!order) throw denied();
      const data = this.draftData(state, { identityRecordId: initial.identityRecordId, identityRecordHash: initial.identityRecordHash, identityEvidenceId: initial.identityEvidenceId, identityEvidenceHash: initial.identityEvidenceHash });
      const proposal = { state, data, audit: this.auditData(subject, order, state.id, "REPORT_CORRECTION_CREATED", { predecessorId: initial.id, reason: input.reason }) };
      const rows = [await diagnosticPlannedRow(tx, this.reportRoot(state.id), data, true),
        await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: proposal.audit.id } }, proposal.audit, true)];
      return this.change(tx, subject, roots, rows, work);
    });
  }
  /** An exact retry authorizes only surviving B. The proof owner locks the complete
   * participant/pair union for first admission instead. */
  async reinspectionLocks(tx: Tx, subject: DiagnosticSubject, orderId: string, _predecessorId: string): Promise<Order> {
    if (!diagnosticHasPrefix(tx)) throw denied();
    await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId])]);
    // Exact retries need only B's current acting authority, never mutable A admission.
    await this.authority.current(tx, subject);
    return (await this.authority.order(tx, subject, orderId, "diagnostics.technician")).row;
  }
  /** Under reinspection locks. An existing report id returns its exact authorized result. A changed
   * predecessor, reason, author, proof or proof-bound expected order version conflicts. */
  async reinspectionRetry(tx: Tx, subject: DiagnosticSubject, orderId: string, input: Omit<DiagnosticSchemas.DiagnosticReinspection, "predecessorId"> & { predecessorId: string | null }) {
    if (!diagnosticHasPrefix(tx)) throw denied();
    await diagnosticReadPrefix(tx, [...diagnosticRoots(subject, [orderId]), this.reportRoot(input.reportId)]);
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
  /** Unlocked proposal only. It supplies no authority. The consuming outer
   * transaction plans these exact bytes before taking any lock. */
  async reinspectionProposal(tx: Tx, subject: DiagnosticSubject, order: Order, prior: Row, input: DiagnosticSchemas.DiagnosticReinspection, proofId: string, requestId?: string) {
    const observed = this.observed(order);
    const state = new DiagnosticReport(prior.state as unknown as DiagnosticReportState).reinspect({ reportId: input.reportId, orderId: order.id, templateVersionId: order.templateVersionId,
      authorId: subject.userId, observedAt: observed.observedAt, mileageKm: observed.mileageKm, reason: input.reason }).state;
    const data = { ...this.draftData(state, await this.pins(tx, order.id)), reinspection: true, continuityProofId: proofId, reinspectionOrderVersion: input.expectedOrderVersion,
      continuityRequestId: requestId ?? null, continuityRequestSessionId: requestId ? subject.sessionId : null };
    const audit = this.auditData(subject, order, state.id, "REPORT_REINSPECTION_CREATED", { predecessorId: prior.id, predecessorOrderId: prior.orderId, reason: state.correctionReason ?? input.reason });
    return { data, audit };
  }
  /** The proof adapter owns the sole receipt. Never prepare or extend it here. */
  async openReinspection(tx: Tx, subject: DiagnosticSubject, order: Order, prior: Row, input: DiagnosticSchemas.DiagnosticReinspection, proofId: string,
    receipt: PreparedDiagnosticSource, proposal: Awaited<ReturnType<PrismaDiagnosticReports["reinspectionProposal"]>>, requestId?: string) {
    await diagnosticReceiptPrefix(tx, receipt, "proof_consume");
    const checked = await this.reinspectionProposal(tx, subject, order, prior, input, proofId, requestId);
    const stable = (data: typeof proposal.data) => ({ ...data, createdAt: null, updatedAt: null });
    if (canonical(stable(checked.data)) !== canonical(stable(proposal.data))) throw denied();
    let saved: Row;
    try { saved = await tx.diagnosticReportRecord.create({ data: { ...proposal.data, snapshot: Prisma.DbNull } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DiagnosticRuleError("DIAGNOSTIC_REINSPECTION_CONFLICT");
      throw error;
    }
    await tx.diagnosticAudit.create({ data: proposal.audit });
    return this.dto(tx, saved, subject, true);
  }
  /** All new reinspection links require the consumed pair-bound proof adapter. */
  async reinspect(_subject: DiagnosticSubject, _orderId: string, _input: DiagnosticSchemas.DiagnosticReinspection): Promise<DiagnosticSchemas.DiagnosticReportRecord> {
    throw denied();
  }
}
