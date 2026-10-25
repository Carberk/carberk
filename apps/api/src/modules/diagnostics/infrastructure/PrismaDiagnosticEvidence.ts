import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { DiagnosticReportState } from "../domain/DiagnosticReport";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticSubject, type DiagnosticRuntime } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticEvidencePort } from "../domain/ports/DiagnosticEvidencePort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";
import { DiagnosticReportAccess } from "./DiagnosticReportAccess";
import { diagnosticReadPrefix, diagnosticRoots } from "./DiagnosticPreparedIntake";

type Tx = Prisma.TransactionClient;
type Upload = Parameters<DiagnosticEvidencePort["upload"]>[1];
type Root = Parameters<typeof diagnosticReadPrefix>[1][number];
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
@Injectable()
export class PrismaDiagnosticEvidence implements DiagnosticEvidencePort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticReportAccess) private readonly access: DiagnosticReportAccess,
    @Inject(DIAGNOSTIC_OBJECTS) private readonly objects: DiagnosticObjects,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}
  private async prefix(tx: Tx, subject: DiagnosticSubject, reportId: string, evidenceId?: string): Promise<void> {
    const report = await tx.diagnosticReportRecord.findUnique({ where: { id: reportId }, select: { id: true, orderId: true } });
    const roots: Root[] = [...diagnosticRoots(subject, report?.orderId ? [report.orderId] : []), { table: "diagnostic_reports", key: { id: reportId } }];
    if (evidenceId) roots.push({ table: "diagnostic_evidence", key: { id: evidenceId } }, { table: "diagnostic_identity_provenance", key: { id: evidenceId } });
    await diagnosticReadPrefix(tx, roots);
  }
  private async author(tx: Tx, subject: DiagnosticSubject, reportId: string, expectedVersion?: number) {
    const scope = await this.access.load(tx, subject, reportId, "diagnostics.technician");
    const state = scope.row.state as unknown as DiagnosticReportState;
    if (state.authorId !== subject.userId || !["draft", "returned"].includes(state.status)) throw denied();
    if (expectedVersion !== undefined && scope.row.version !== expectedVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
    return scope;
  }
  async upload(subject: DiagnosticSubject, input: Upload) {
    await this.db.$transaction(async tx => { await this.prefix(tx, subject, input.reportId, input.evidenceId); await this.author(tx, subject, input.reportId, input.expectedVersion); });
    const clean = await this.objects.sanitize(input.bytes, input.mime);
    const hash = createHash("sha256").update(clean.bytes).digest("hex");
    const intent = await this.db.$transaction(async tx => {
      await this.prefix(tx, subject, input.reportId, input.evidenceId);
      await this.author(tx, subject, input.reportId, input.expectedVersion);
      const prior = await tx.diagnosticEvidence.findUnique({ where: { id: input.evidenceId } });
      if (prior) {
        if (prior.reportId !== input.reportId) throw denied();
        if (prior.findingId !== input.findingId || prior.sha256 !== hash || prior.sizeBytes !== clean.bytes.byteLength || prior.cleanupRequestedAt || !["staged", "verified"].includes(prior.state)) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_CONFLICT");
        if (prior.state === "verified") return prior;
        if (prior.writeLeaseUntil && prior.writeLeaseUntil > this.runtime.now()) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_BUSY");
        return tx.diagnosticEvidence.update({ where: { id: prior.id }, data: { epoch: this.runtime.id(), writeLeaseUntil: new Date(this.runtime.now().getTime() + 120_000) } });
      }
      if (await tx.diagnosticEvidence.count({ where: { reportId: input.reportId } }) >= 100) throw new DiagnosticRuleError("REPORT_EVIDENCE_LIMIT");
      // Identity provenance shares this object namespace; an id belongs to one owner only.
      if (await tx.diagnosticIdentityProvenance.findUnique({ where: { id: input.evidenceId } })) throw denied();
      // Commit this exact immutable intent before any object write can occur.
      return tx.diagnosticEvidence.create({ data: { id: input.evidenceId, reportId: input.reportId, findingId: input.findingId,
        objectKey: `diagnostic-evidence/${input.evidenceId}/${hash}`, sha256: hash, sizeBytes: clean.bytes.byteLength, mime: clean.mime, createdById: subject.userId, writeLeaseUntil: new Date(this.runtime.now().getTime() + 120_000) } });
    });
    if (intent.state === "verified") return { id: intent.id, findingId: intent.findingId, mime: intent.mime, sizeBytes: intent.sizeBytes };
    try {
      await this.db.$transaction(async tx => {
        await this.prefix(tx, subject, input.reportId, input.evidenceId);
        await this.author(tx, subject, input.reportId, input.expectedVersion);
        const current = await tx.diagnosticEvidence.findUnique({ where: { id: intent.id } });
        if (!current || current.epoch !== intent.epoch || current.cleanupRequestedAt || !current.writeLeaseUntil || current.writeLeaseUntil <= this.runtime.now()) throw denied();
      });
      await this.objects.put(intent.objectKey, clean.bytes, clean.mime);
      await this.objects.read(intent.objectKey, intent.sizeBytes, intent.sha256);
      return await this.db.$transaction(async tx => {
        await this.prefix(tx, subject, input.reportId, input.evidenceId);
        await this.author(tx, subject, input.reportId, input.expectedVersion);
        await tx.$queryRaw`SELECT id FROM diagnostic_evidence WHERE id=${intent.id} FOR UPDATE`;
        const current = await tx.diagnosticEvidence.findUnique({ where: { id: intent.id } });
        if (!current || current.epoch !== intent.epoch || current.cleanupRequestedAt || !current.writeLeaseUntil || current.writeLeaseUntil <= this.runtime.now() || !["staged", "verified"].includes(current.state)) throw denied();
        await tx.diagnosticEvidence.update({ where: { id: intent.id }, data: { state: "verified", verifiedAt: this.runtime.now(), writeLeaseUntil: null } });
        return { id: current.id, findingId: current.findingId, mime: current.mime, sizeBytes: current.sizeBytes };
      });
    } catch (error) {
      await this.db.$transaction(async tx => {
        await this.prefix(tx, subject, input.reportId, input.evidenceId);
        await tx.diagnosticEvidence.updateMany({ where: { id: intent.id, reportId: input.reportId, epoch: intent.epoch, state: "staged" },
          data: { cleanupRequestedAt: this.runtime.now(), state: "cleanup_pending" } });
      });
      throw error;
    }
  }
  private async readable(tx: Tx, subject: DiagnosticSubject, reportId: string, evidenceId: string) {
    const scope = await this.access.load(tx, subject, reportId);
    const state = scope.row.state as unknown as DiagnosticReportState;
    const row = await tx.diagnosticEvidence.findUnique({ where: { id: evidenceId }, include: { report: true } });
    if (!row || row.state !== "verified" || row.cleanupRequestedAt || row.report.erasedAt || row.report.orderId !== scope.order.id || row.report.audience !== scope.row.audience) throw denied();
    const referenced = state.findings.some(finding => finding.id === row.findingId && finding.evidenceIds.includes(row.id));
    if (!referenced && !(scope.staff && row.reportId === reportId && !scope.row.snapshot && state.authorId === subject.userId)) throw denied();
    return row;
  }
  async read(subject: DiagnosticSubject, reportId: string, evidenceId: string) {
    const row = await this.db.$transaction(async tx => { await this.prefix(tx, subject, reportId, evidenceId); return this.readable(tx, subject, reportId, evidenceId); });
    let bytes: Uint8Array | null = null;
    try { bytes = await this.objects.read(row.objectKey, row.sizeBytes, row.sha256); } catch { bytes = null; }
    // Reauthorize after the asynchronous object read, immediately before delivery.
    await this.db.$transaction(async tx => {
      await this.prefix(tx, subject, reportId, evidenceId);
      const current = await this.readable(tx, subject, reportId, evidenceId);
      if (current.epoch !== row.epoch) throw denied();
    });
    if (!bytes) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
    return { bytes, mime: row.mime };
  }
  async abandon(subject: DiagnosticSubject, reportId: string, evidenceId: string): Promise<void> {
    await this.db.$transaction(async tx => {
      await this.prefix(tx, subject, reportId, evidenceId);
      const scope = await this.author(tx, subject, reportId);
      const state = scope.row.state as unknown as DiagnosticReportState;
      if (state.findings.some(finding => finding.evidenceIds.includes(evidenceId))) throw new DiagnosticRuleError("REPORT_EVIDENCE_IN_USE");
      const row = await tx.diagnosticEvidence.findUnique({ where: { id: evidenceId } });
      if (!row) return;
      if (row.reportId !== reportId) throw denied();
      if (row.cleanupRequestedAt) return;
      await tx.diagnosticEvidence.update({ where: { id: evidenceId }, data: { state: "cleanup_pending", cleanupRequestedAt: this.runtime.now() } });
    });
  }
}
