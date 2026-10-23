import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, diagnosticReaderProjection, type Prisma } from "@auto-tm/db";

import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticPublicPort } from "../domain/ports/DiagnosticPublicPort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";

import { DiagnosticReportAccess } from "./DiagnosticReportAccess";

const denied = () => new DiagnosticRuleError("DIAGNOSTIC_PUBLIC_UNAVAILABLE");
@Injectable()
export class PrismaDiagnosticPublic implements DiagnosticPublicPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticReportAccess) private readonly access: DiagnosticReportAccess,
    @Inject(DIAGNOSTIC_OBJECTS) private readonly objects: DiagnosticObjects) {}
  private async projection(tx: Prisma.TransactionClient, listingId: string): Promise<D.PublicDiagnosticAvailability> {
    // Select the newest released inspection first. Never fall back to an older
    // favorable report when the latest release was withdrawn or became unavailable.
    const latest = await tx.diagnosticReportRecord.findFirst({ where: { audience: "listing_public", snapshotHash: { not: null }, order: { listingId } }, orderBy: [{ finalizedAt: "desc" }, { id: "desc" }] });
    if (!latest) throw denied();
    const { row } = await this.access.loadPublic(tx, latest.id);
    const snapshot = D.DiagnosticReleasedSnapshotSchema.parse(row.snapshot);
    return { listingId, reportId: row.id, observedAt: snapshot.report.observedAt, mileageKm: snapshot.report.mileageKm, synthetic: true };
  }
  availability(listingId: string) { return this.db.$transaction(tx => this.projection(tx, listingId)); }
  async batch(listingIds: string[]): Promise<D.PublicDiagnosticAvailability[]> {
    return this.db.$transaction(async tx => {
      const result: D.PublicDiagnosticAvailability[] = [];
      for (const id of [...new Set(listingIds)].sort()) {
        try { result.push(await this.projection(tx, id)); }
        catch (error) { if (!(error instanceof DiagnosticRuleError) || error.code !== "DIAGNOSTIC_PUBLIC_UNAVAILABLE") throw error; }
      }
      return result;
    });
  }
  read(reportId: string): Promise<D.PublicDiagnosticReport> {
    return this.db.$transaction(async tx => {
      const { row } = await this.access.loadPublic(tx, reportId);
      const snapshot = D.DiagnosticReleasedSnapshotSchema.parse(row.snapshot);
      return D.PublicDiagnosticReportSchema.parse({ ...(await diagnosticReaderProjection(tx, row, snapshot.report)).report, version: row.version, template: snapshot.template, synthetic: true,
        authorId: null, reviewerId: null, returnReason: null, lineageKind: row.reinspection ? "reinspection" : row.predecessorId ? "correction" : "original", ...await this.access.successor(tx, row, null) });
    });
  }
  private async readable(tx: Prisma.TransactionClient, reportId: string, evidenceId: string) {
    const { row, order } = await this.access.loadPublic(tx, reportId);
    const snapshot = D.DiagnosticReleasedSnapshotSchema.parse(row.snapshot);
    const evidence = await tx.diagnosticEvidence.findUnique({ where: { id: evidenceId }, include: { report: true } });
    if (!evidence || evidence.state !== "verified" || evidence.cleanupRequestedAt || evidence.report.erasedAt || evidence.report.orderId !== order.id || evidence.report.audience !== "listing_public" ||
      !snapshot.report.findings.some(finding => finding.id === evidence.findingId && finding.evidenceIds.includes(evidenceId))) throw denied();
    return evidence;
  }
  async evidence(reportId: string, evidenceId: string) {
    const evidence = await this.db.$transaction(tx => this.readable(tx, reportId, evidenceId));
    let bytes: Uint8Array;
    try { bytes = await this.objects.read(evidence.objectKey, evidence.sizeBytes, evidence.sha256); }
    catch { throw denied(); }
    await this.db.$transaction(async tx => {
      const current = await this.readable(tx, reportId, evidenceId);
      if (current.epoch !== evidence.epoch) throw denied();
    });
    return { bytes, mime: evidence.mime };
  }
}
