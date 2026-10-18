import { createHash } from "node:crypto";

import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { PrismaService, Prisma } from "@auto-tm/db";

import { renderDiagnosticPdf, type DiagnosticPdfFonts } from "./DiagnosticPdfRenderer";

export interface DiagnosticArtifactObjects {
  put(key: string, bytes: Uint8Array, mime: "application/pdf"): Promise<void>;
  read(key: string, size: number, sha256: string): Promise<Uint8Array>;
  deleteAndVerify(keys: string[]): Promise<void>;
}
export interface DiagnosticArtifactRuntime {
  now(): Date;
  id(): string;
  enabled(): boolean;
}

type Artifact = Prisma.DiagnosticPdfArtifactGetPayload<object>;
type Tx = Prisma.TransactionClient;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const missing = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
const leaseEnd = (now: Date) => new Date(now.getTime() + 120_000);
const available = (row: Artifact, now: Date) => row.cleanupRequestedAt === null && row.attempts < 5 &&
  (row.state === "pending" || (row.state === "failed" && !!row.retryAt && row.retryAt <= now) ||
    (row.state === "processing" && !!row.leaseUntil && row.leaseUntil <= now));

/** Owns durable generation/adoption and exact abandoned-object maintenance. */
export class DiagnosticArtifactWorker {
  constructor(private readonly db: PrismaService, private readonly objects: DiagnosticArtifactObjects,
    private readonly fonts: DiagnosticPdfFonts, private readonly runtime: DiagnosticArtifactRuntime) {}

  private async current(tx: Tx, artifact: Artifact): Promise<D.DiagnosticReleasedSnapshot | null> {
    const report = await tx.diagnosticReportRecord.findUnique({ where: { id: artifact.reportId }, include: { order: true } });
    if (!report || report.erasedAt || report.order.erasedAt || !report.order.synthetic ||
      (report.audience === "buyer_private" && !report.order.commissionerId) || report.snapshotHash !== artifact.snapshotHash ||
      !report.snapshot || sha(canonical(report.snapshot)) !== artifact.snapshotHash) return null;
    const parsed = D.DiagnosticReleasedSnapshotSchema.safeParse(report.snapshot);
    return parsed.success && parsed.data.synthetic && parsed.data.report.id === report.id && parsed.data.report.status === "finalized" ? parsed.data : null;
  }
  private async locked(tx: Tx, artifact: Artifact): Promise<Artifact | null> {
    await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${artifact.reportId} FOR UPDATE`;
    const row = await tx.diagnosticPdfArtifact.findUnique({ where: { id: artifact.id } });
    if (!row || row.state !== "processing" || row.epoch !== artifact.epoch || !row.leaseUntil || row.leaseUntil <= this.runtime.now() || row.cleanupRequestedAt) return null;
    return row;
  }
  private async retire(tx: Tx, artifact: Artifact) {
    await tx.diagnosticPdfArtifact.updateMany({ where: { id: artifact.id, epoch: artifact.epoch },
      data: { state: "cleanup_pending", epoch: this.runtime.id(), cleanupRequestedAt: this.runtime.now() } });
  }
  async generate(id: string): Promise<boolean> {
    if (!this.runtime.enabled()) return false;
    const intent = await this.db.$transaction(async tx => {
      const candidate = await tx.diagnosticPdfArtifact.findUnique({ where: { id } });
      if (!candidate || !available(candidate, this.runtime.now()) || candidate.rendererVersion !== "v1" || !["tk", "ru", "en"].includes(candidate.locale) ||
        candidate.objectKey !== `diagnostic-pdf/${candidate.reportId}/${candidate.id}.pdf`) return null;
      await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${candidate.reportId} FOR UPDATE`;
      const row = await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id } });
      if (!available(row, this.runtime.now())) return null;
      const snapshot = await this.current(tx, row);
      if (!snapshot) { await this.retire(tx, row); return null; }
      const epoch = this.runtime.id();
      const claimed = await tx.diagnosticPdfArtifact.updateMany({ where: { id, epoch: row.epoch, state: row.state, cleanupRequestedAt: null, leaseUntil: row.leaseUntil }, data: { state: "processing", epoch, attempts: { increment: 1 }, leaseUntil: leaseEnd(this.runtime.now()), failureCode: null, retryAt: null } });
      if (!claimed.count) return null;
      return { artifact: await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id } }), snapshot };
    });
    if (!intent) return false;
    const { artifact, snapshot } = intent;
    try {
      let bytes: Uint8Array | undefined;
      if (artifact.sha256 && artifact.sizeBytes) {
        try { bytes = await this.objects.read(artifact.objectKey, artifact.sizeBytes, artifact.sha256); }
        catch (error) { if (!missing(error)) throw error; }
      }
      if (!bytes) {
        const ids = [...new Set(snapshot.report.findings.flatMap(finding => finding.evidenceIds))];
        const evidence = await this.db.diagnosticEvidence.findMany({ where: { id: { in: ids } }, include: { report: true } });
        if (evidence.length !== ids.length || evidence.reduce((sum, row) => sum + row.sizeBytes, 0) > 100 * 1024 * 1024) throw new Error("DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
        const photos: { id: string; bytes: Uint8Array }[] = [];
        for (const row of evidence) {
          if (row.state !== "verified" || row.cleanupRequestedAt || row.report.erasedAt || row.report.orderId !== snapshot.report.orderId || row.report.audience !== snapshot.report.audience ||
            !snapshot.report.findings.some(finding => finding.id === row.findingId && finding.evidenceIds.includes(row.id))) throw new Error("DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
          photos.push({ id: row.id, bytes: await this.objects.read(row.objectKey, row.sizeBytes, row.sha256) });
        }
        bytes = await renderDiagnosticPdf({ snapshot, locale: artifact.locale as "tk" | "ru" | "en", generatedAt: artifact.createdAt,
          verificationReference: `/diagnostics/reports/${artifact.reportId}`, photos }, this.fonts);
      }
      const digest = sha(bytes), size = bytes.byteLength;
      const planned = await this.db.$transaction(async tx => {
        const row = await this.locked(tx, artifact);
        if (!row) return false;
        if (!(await this.current(tx, row))) { await this.retire(tx, row); return false; }
        // Retried generation cannot replace an earlier durable byte descriptor.
        if ((row.sha256 && row.sha256 !== digest) || (row.sizeBytes && row.sizeBytes !== size)) throw new Error("DIAGNOSTIC_PDF_GENERATION_CONFLICT");
        return (await tx.diagnosticPdfArtifact.updateMany({ where: { id, epoch: artifact.epoch, state: "processing", cleanupRequestedAt: null, leaseUntil: { gt: this.runtime.now() } }, data: { sha256: digest, sizeBytes: size } })).count === 1;
      });
      if (!planned) return false;
      // The exact write plan is durable before any network mutation starts.
      if (!artifact.sha256 || !artifact.sizeBytes) await this.objects.put(artifact.objectKey, bytes, "application/pdf");
      else {
        try { await this.objects.read(artifact.objectKey, size, digest); }
        catch (error) { if (!missing(error)) throw error; await this.objects.put(artifact.objectKey, bytes, "application/pdf"); }
      }
      await this.objects.read(artifact.objectKey, size, digest);
      return this.db.$transaction(async tx => {
        const row = await this.locked(tx, artifact);
        if (!row) return false;
        if (!(await this.current(tx, row))) { await this.retire(tx, row); return false; }
        return (await tx.diagnosticPdfArtifact.updateMany({ where: { id, epoch: artifact.epoch, state: "processing", cleanupRequestedAt: null, leaseUntil: { gt: this.runtime.now() } }, data: { state: "ready", verifiedAt: this.runtime.now(), leaseUntil: null, failureCode: null } })).count === 1;
      });
    } catch {
      await this.db.diagnosticPdfArtifact.updateMany({ where: { id, epoch: artifact.epoch, state: "processing", cleanupRequestedAt: null },
        data: { state: "failed", leaseUntil: null, failureCode: "storage_or_render", retryAt: artifact.attempts < 5 ? new Date(this.runtime.now().getTime() + Math.min(3600_000, 30_000 * 2 ** artifact.attempts)) : null } });
      throw new Error("DIAGNOSTIC_ARTIFACT_RETRY");
    }
  }

  async execute(): Promise<void> {
    if (!this.runtime.enabled()) return;
    const now = this.runtime.now();
    // A crash on the last allowed attempt must become an honest terminal failure.
    await this.db.diagnosticPdfArtifact.updateMany({ where: { state: "processing", attempts: { gte: 5 }, cleanupRequestedAt: null, leaseUntil: { lte: now } }, data: { state: "failed", leaseUntil: null, retryAt: null, failureCode: "attempts_exhausted" } });
    const pending = await this.db.diagnosticPdfArtifact.findMany({ where: { cleanupRequestedAt: null, attempts: { lt: 5 }, OR: [{ state: "pending" }, { state: "failed", retryAt: { lte: now } }, { state: "processing", leaseUntil: { lte: now } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5 });
    let failed = false;
    for (const row of pending) try { await this.generate(row.id); } catch { failed = true; }
    await this.cleanup();
    if (failed) throw new Error("DIAGNOSTIC_ARTIFACT_RETRY");
  }

  async cleanup(): Promise<number> {
    if (!this.runtime.enabled()) return 0;
    const now = this.runtime.now(); let completed = 0;
    // Erasure fences access before network cleanup. Active reports have no blanket purge.
    const erased = await this.db.diagnosticReportRecord.findMany({ where: { AND: [{ OR: [{ erasedAt: { not: null } }, { order: { erasedAt: { not: null } } }, { audience: "buyer_private", order: { commissionerId: null } }] }, { OR: [{ artifacts: { some: { cleanupRequestedAt: null } } }, { evidence: { some: { cleanupRequestedAt: null } } }] }] }, orderBy: { id: "asc" }, take: 100 });
    for (const report of erased) {
      await this.db.diagnosticPdfArtifact.updateMany({ where: { reportId: report.id, cleanupRequestedAt: null }, data: { state: "cleanup_pending", cleanupRequestedAt: now } });
      await this.db.diagnosticEvidence.updateMany({ where: { reportId: report.id, cleanupRequestedAt: null }, data: { state: "cleanup_pending", cleanupRequestedAt: now } });
    }
    // An unfinished staging attempt is temporary upload data, not a retained report.
    const stale = await this.db.diagnosticEvidence.findMany({ where: { state: "staged", cleanupRequestedAt: null, createdAt: { lte: new Date(now.getTime() - 86400_000) }, OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, select: { id: true } });
    await this.db.diagnosticEvidence.updateMany({ where: { id: { in: stale.map(row => row.id) }, state: "staged", cleanupRequestedAt: null, OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, data: { state: "cleanup_pending", cleanupRequestedAt: now } });
    const artifacts = await this.db.diagnosticPdfArtifact.findMany({ where: { cleanupRequestedAt: { not: null }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: [{ cleanupCompletedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
    for (const item of artifacts) {
      if (item.objectKey !== `diagnostic-pdf/${item.reportId}/${item.id}.pdf`) throw new Error("DIAGNOSTIC_CLEANUP_INVALID");
      const epoch = this.runtime.id();
      const claim = await this.db.diagnosticPdfArtifact.updateMany({ where: { id: item.id, epoch: item.epoch, cleanupRequestedAt: { not: null }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { epoch, state: "cleanup_pending", leaseUntil: leaseEnd(now) } });
      if (!claim.count) continue;
      try {
        await this.objects.deleteAndVerify([item.objectKey]);
        completed += (await this.db.diagnosticPdfArtifact.updateMany({ where: { id: item.id, epoch, state: "cleanup_pending" }, data: { state: "removed", cleanupCompletedAt: this.runtime.now(), leaseUntil: null, failureCode: null } })).count;
      } catch {
        await this.db.diagnosticPdfArtifact.updateMany({ where: { id: item.id, epoch }, data: { failureCode: "cleanup_storage", leaseUntil: new Date(now.getTime() + 60_000) } });
        throw new Error("DIAGNOSTIC_CLEANUP_RETRY");
      }
    }
    const evidence = await this.db.diagnosticEvidence.findMany({ where: { cleanupRequestedAt: { not: null }, AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: now } }] }] }, orderBy: [{ cleanupCompletedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
    for (const item of evidence) {
      if (item.objectKey !== `diagnostic-evidence/${item.id}/${item.sha256}`) throw new Error("DIAGNOSTIC_CLEANUP_INVALID");
      const epoch = this.runtime.id();
      const claim = await this.db.diagnosticEvidence.updateMany({ where: { id: item.id, epoch: item.epoch, cleanupRequestedAt: { not: null }, AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: now } }] }] }, data: { epoch, state: "cleanup_pending", cleanupLeaseUntil: leaseEnd(now), cleanupAttempts: { increment: 1 } } });
      if (!claim.count) continue;
      try {
        await this.objects.deleteAndVerify([item.objectKey]);
        completed += (await this.db.diagnosticEvidence.updateMany({ where: { id: item.id, epoch, state: "cleanup_pending" }, data: { state: "removed", cleanupCompletedAt: this.runtime.now(), cleanupLeaseUntil: null, cleanupFailureCode: null } })).count;
      } catch {
        await this.db.diagnosticEvidence.updateMany({ where: { id: item.id, epoch }, data: { cleanupFailureCode: "cleanup_storage", cleanupLeaseUntil: new Date(now.getTime() + 60_000) } });
        throw new Error("DIAGNOSTIC_CLEANUP_RETRY");
      }
    }
    // Completed exact intents remain in the rotation, catching paused writers that
    // resume after a previous delete. Never broaden authority to a bucket prefix.
    return completed;
  }
}
