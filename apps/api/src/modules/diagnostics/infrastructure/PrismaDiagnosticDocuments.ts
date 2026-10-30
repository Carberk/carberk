import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, diagnosticReaderProjection, DIAGNOSTIC_PDF_RENDERERS, type Prisma } from "@auto-tm/db";

import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticDocumentsPort } from "../domain/ports/DiagnosticDocumentsPort";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";

import { DiagnosticReportAccess } from "./DiagnosticReportAccess";

type Tx = Prisma.TransactionClient;
type Subject = DiagnosticSubject | null;
const unavailable = () => new DiagnosticRuleError("DIAGNOSTIC_PDF_NOT_READY");
@Injectable()
export class PrismaDiagnosticDocuments implements DiagnosticDocumentsPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticReportAccess) private readonly access: DiagnosticReportAccess,
    @Inject(DIAGNOSTIC_OBJECTS) private readonly objects: DiagnosticObjects) {}
  private load(tx: Tx, subject: Subject, reportId: string) {
    return subject ? this.access.load(tx, subject, reportId) : this.access.loadPublic(tx, reportId);
  }
  async list(subject: Subject, reportId: string): Promise<D.DiagnosticDocument[]> {
    return this.db.$transaction(async tx => {
      const { row } = await this.load(tx, subject, reportId);
      if (!row.snapshotHash) return [];
      const { rendererVersion } = await diagnosticReaderProjection(tx, row, D.DiagnosticReleasedSnapshotSchema.parse(row.snapshot).report);
      const artifacts = await tx.diagnosticPdfArtifact.findMany({ where: { reportId, snapshotHash: row.snapshotHash, rendererVersion: { in: DIAGNOSTIC_PDF_RENDERERS } }, orderBy: [{ locale: "asc" }, { generation: "desc" }] });
      const seen = new Set<string>();
      artifacts.sort((a, b) => a.locale.localeCompare(b.locale) || Number(b.rendererVersion === rendererVersion) - Number(a.rendererVersion === rendererVersion) || b.generation - a.generation);
      return artifacts.filter(item => { if (seen.has(item.locale)) return false; seen.add(item.locale); return true; }).map(item => D.DiagnosticDocumentSchema.parse({
        id: item.id, locale: item.locale, generation: item.generation, rendererVersion: item.rendererVersion,
        state: item.rendererVersion !== rendererVersion || item.cleanupRequestedAt || ["cleanup_pending", "removed"].includes(item.state) ? "unavailable" : item.state,
        generatedAt: item.verifiedAt?.toISOString() ?? null, retryAt: item.retryAt?.toISOString() ?? null,
      }));
    });
  }
  private async ready(tx: Tx, subject: Subject, reportId: string, locale: string) {
    const { row } = await this.load(tx, subject, reportId);
    if (!row.snapshotHash) throw unavailable();
    const { rendererVersion } = await diagnosticReaderProjection(tx, row, D.DiagnosticReleasedSnapshotSchema.parse(row.snapshot).report);
    const artifact = await tx.diagnosticPdfArtifact.findFirst({ where: { reportId, locale, snapshotHash: row.snapshotHash, rendererVersion }, orderBy: { generation: "desc" } });
    if (!artifact || artifact.state !== "ready" || artifact.cleanupRequestedAt || !artifact.verifiedAt || !artifact.sizeBytes || !artifact.sha256 ||
      artifact.objectKey !== `diagnostic-pdf/${reportId}/${artifact.id}.pdf`) throw unavailable();
    return { ...artifact, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes };
  }
  async download(subject: Subject, reportId: string, locale: "tk" | "ru" | "en"): Promise<Uint8Array> {
    const artifact = await this.db.$transaction(tx => this.ready(tx, subject, reportId, locale));
    let bytes: Uint8Array | null = null;
    try { bytes = await this.objects.read(artifact.objectKey, artifact.sizeBytes, artifact.sha256); }
    catch { bytes = null; }
    // Current permissions, public identity and artifact epoch must still match after I/O.
    await this.db.$transaction(async tx => {
      const current = await this.ready(tx, subject, reportId, locale);
      if (current.id !== artifact.id || current.epoch !== artifact.epoch || current.sha256 !== artifact.sha256 || current.sizeBytes !== artifact.sizeBytes || current.objectKey !== artifact.objectKey || current.snapshotHash !== artifact.snapshotHash || current.rendererVersion !== artifact.rendererVersion || current.generation !== artifact.generation) throw unavailable();
    });
    if (!bytes || bytes.byteLength !== artifact.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new DiagnosticRuleError("DIAGNOSTIC_PDF_UNAVAILABLE");
    return bytes;
  }
}
