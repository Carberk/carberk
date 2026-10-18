import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { DiagnosticReport, type DiagnosticReportState } from "../domain/DiagnosticReport";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticReportsPort } from "../domain/ports/DiagnosticReportsPort";
import { DiagnosticReportAccess } from "./DiagnosticReportAccess";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
import { diagnosticListingDigest } from "./PrismaDiagnosticIntake";

type Tx = Prisma.TransactionClient;
type Row = Prisma.DiagnosticReportRecordGetPayload<object>;
type Order = Prisma.InspectionOrderGetPayload<object>;
// PostgreSQL JSONB can reorder object keys. Snapshot identity must survive readback.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
};
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Serializes authorship/review with the same current order authority used by intake. */
@Injectable()
export class PrismaDiagnosticReports implements DiagnosticReportsPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime,
    @Inject(DiagnosticReportAccess) private readonly access: DiagnosticReportAccess) {}
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
  private async dto(tx: Tx, row: Row, staff: boolean): Promise<DiagnosticSchemas.DiagnosticReportRecord> {
    const state = row.state as unknown as DiagnosticReportState;
    const released = row.snapshot ? DiagnosticSchemas.DiagnosticReleasedSnapshotSchema.parse(row.snapshot).report : state;
    const successor = await tx.diagnosticReportRecord.findFirst({ where: { predecessorId: row.id, snapshotHash: { not: null }, erasedAt: null } });
    return DiagnosticSchemas.DiagnosticReportSchema.parse({ ...released, status: row.status, withdrawnAt: row.withdrawnAt?.toISOString() ?? null, withdrawalReason: row.withdrawalReason, supersededBy: successor?.id ?? null, authorId: staff ? state.authorId : null,
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
  async create(subject: DiagnosticSubject, orderId: string, input: DiagnosticSchemas.DiagnosticDraftCreate) {
    return this.db.$transaction(async tx => {
      const { row: order } = await this.authority.order(tx, subject, orderId, "diagnostics.technician");
      const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: input.reportId } });
      if (prior) {
        if (prior.orderId !== orderId || prior.erasedAt || (prior.state as unknown as DiagnosticReportState).authorId !== subject.userId) throw denied();
        return this.dto(tx, prior, true);
      }
      if (order.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const observed = DiagnosticSchemas.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).safeParse(order.observedVehicle);
      if (order.status !== "arrived" || !order.physicalAuthorization || !observed.success) throw new DiagnosticRuleError("DIAGNOSTIC_OBSERVATION_REQUIRED");
      if (await tx.diagnosticReportRecord.findFirst({ where: { orderId, predecessorId: null } })) throw new DiagnosticRuleError("DIAGNOSTIC_REPORT_EXISTS");
      const state: DiagnosticReportState = { id: input.reportId, orderId, audience: DiagnosticSchemas.DiagnosticAudienceSchema.parse(order.audience),
        templateVersionId: order.templateVersionId, status: "draft", observedAt: observed.data.observedAt, mileageKm: observed.data.mileageKm,
        findings: [], authorId: subject.userId, reviewerId: null, successorOf: null, correctionReason: null, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null };
      const row = await tx.diagnosticReportRecord.create({ data: { id: input.reportId, orderId, audience: state.audience, templateVersionId: state.templateVersionId, state: json(state) } });
      await this.audit(tx, subject, order, row.id, "REPORT_DRAFT_CREATED");
      return this.dto(tx, row, true);
    });
  }
  async read(subject: DiagnosticSubject, reportId: string) {
    return this.db.$transaction(async tx => { const { row, staff } = await this.load(tx, subject, reportId); return this.dto(tx, row, staff); });
  }
  async forOrder(subject: DiagnosticSubject, orderId: string) {
    return this.db.$transaction(async tx => {
      const scope = await this.authority.order(tx, subject, orderId);
      const rows = await tx.diagnosticReportRecord.findMany({ where: { orderId, erasedAt: null, ...(!scope.staff ? { snapshotHash: { not: null } } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      return Promise.all(rows.map(row => this.dto(tx, row, scope.staff)));
    });
  }
  private async evidence(tx: Tx, row: Row, state: DiagnosticReportState): Promise<void> {
    const reportIds = [row.id];
    let predecessorId = row.predecessorId;
    while (predecessorId) {
      const prior = await tx.diagnosticReportRecord.findUnique({ where: { id: predecessorId } });
      if (!prior || prior.orderId !== row.orderId || prior.audience !== row.audience || prior.erasedAt || reportIds.includes(prior.id)) throw denied();
      reportIds.push(prior.id); predecessorId = prior.predecessorId;
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
      return this.dto(tx, saved, true);
    });
  }
  private async publicAssociation(tx: Tx, order: Order): Promise<void> {
    if (order.audience !== "listing_public") return;
    if (!order.listingId || !order.publicationAuthorization || !order.associationValidatedAt || !order.listingIdentityDigest) throw new DiagnosticRuleError("PUBLICATION_AUTHORIZATION_REQUIRED");
    await tx.$queryRaw`SELECT id FROM listings WHERE id=${order.listingId} FOR SHARE`;
    const listing = await tx.listing.findUnique({ where: { id: order.listingId } });
    if (!listing || listing.deletedAt || listing.status !== "active" || diagnosticListingDigest(listing) !== order.listingIdentityDigest) throw new DiagnosticRuleError("DIAGNOSTIC_VEHICLE_MISMATCH");
  }
  async transition(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticReportTransition) {
    return this.db.$transaction(async tx => {
      const capability = input.action === "submit" ? "diagnostics.technician" : "diagnostics.reviewer";
      const { row, order } = await this.load(tx, subject, reportId, capability); this.version(row, input.expectedVersion);
      const model = await this.model(tx, row);
      let next: DiagnosticReportState;
      if (input.action === "submit") {
        if (order.status !== "arrived" || !order.physicalAuthorization) throw new DiagnosticRuleError("PHYSICAL_AUTHORIZATION_REQUIRED");
        next = model.submit(subject.userId, []).state; await this.evidence(tx, row, next);
      } else if (input.action === "withdraw") next = model.withdraw(subject.userId, input.reason ?? "", this.runtime.now()).state;
      else {
        if (input.action === "finalize") { await this.evidence(tx, row, model.state); await this.publicAssociation(tx, order); }
        next = model.review(subject.userId, input.action === "return" ? "return" : "finalize", { now: this.runtime.now(), ...(input.reason ? { reason: input.reason } : {}),
          privateSelfReviewAuthorized: input.privateSelfReview === true && !!input.reason?.trim() }).state;
      }
      let saved: Row;
      if (input.action === "finalize") {
        const snapshot = json({ report: next, template: await this.definition(tx, row), synthetic: true });
        const hash = createHash("sha256").update(canonical(snapshot)).digest("hex");
        saved = await tx.diagnosticReportRecord.update({ where: { id: row.id }, data: { state: json(next), status: next.status, version: { increment: 1 }, snapshot, snapshotHash: hash, finalizedAt: this.runtime.now() } });
        for (const locale of ["tk", "ru", "en"]) {
          const id = this.runtime.id();
          await tx.diagnosticPdfArtifact.create({ data: { id, reportId, snapshotHash: hash, locale, rendererVersion: "v1", objectKey: `diagnostic-pdf/${reportId}/${id}.pdf` } });
        }
      } else saved = await this.persist(tx, row, next);
      await this.audit(tx, subject, order, row.id, `REPORT_${input.action.toUpperCase()}`, { ...(input.reason ? { reason: input.reason } : {}), privateSelfReview: input.privateSelfReview === true && model.state.authorId === subject.userId });
      return this.dto(tx, saved, true);
    });
  }
  async correct(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticCorrection) {
    return this.db.$transaction(async tx => {
      const { row, order } = await this.load(tx, subject, reportId, "diagnostics.technician");
      const existing = await tx.diagnosticReportRecord.findUnique({ where: { predecessorId: reportId } });
      if (existing) {
        const state = existing.state as unknown as DiagnosticReportState;
        if (existing.id !== input.successorId || state.correctionReason !== input.reason || state.authorId !== subject.userId || existing.erasedAt) throw new DiagnosticRuleError("DIAGNOSTIC_CORRECTION_CONFLICT");
        return this.dto(tx, existing, true);
      }
      this.version(row, input.expectedVersion);
      const state = (await this.model(tx, row)).correct(input.successorId, subject.userId, input.reason).state;
      const saved = await tx.diagnosticReportRecord.create({ data: { id: state.id, orderId: order.id, audience: row.audience, templateVersionId: row.templateVersionId, predecessorId: row.id, state: json(state) } });
      await this.audit(tx, subject, order, saved.id, "REPORT_CORRECTION_CREATED", { predecessorId: row.id, reason: input.reason });
      return this.dto(tx, saved, true);
    });
  }
}
