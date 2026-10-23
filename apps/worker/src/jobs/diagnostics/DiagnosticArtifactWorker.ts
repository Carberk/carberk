import { createHash } from "node:crypto";

import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { Prisma, diagnosticReaderProjection, DIAGNOSTIC_ERASED_LINEAGE_RENDERER, DIAGNOSTIC_PDF_RENDERERS, type PrismaService } from "@auto-tm/db";

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
    if (!parsed.success || !parsed.data.synthetic || parsed.data.report.id !== report.id || parsed.data.report.status !== "finalized") return null;
    const projection = await diagnosticReaderProjection(tx, report, parsed.data.report);
    if (artifact.rendererVersion !== projection.rendererVersion) return null;
    return { ...parsed.data, report: projection.report };
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
      if (!candidate || !available(candidate, this.runtime.now()) || !DIAGNOSTIC_PDF_RENDERERS.includes(candidate.rendererVersion) || !["tk", "ru", "en"].includes(candidate.locale) ||
        candidate.objectKey !== `diagnostic-pdf/${candidate.reportId}/${candidate.id}.pdf`) return null;
      await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${candidate.reportId} FOR UPDATE`;
      const row = await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id } });
      if (!available(row, this.runtime.now())) return null;
      const snapshot = await this.current(tx, row);
      if (!snapshot) {
        const replacementId = await this.requestSafeReplacement(tx, row);
        if (replacementId) return { replacementId };
        await this.retire(tx, row); return null;
      }
      const epoch = this.runtime.id();
      const claimed = await tx.diagnosticPdfArtifact.updateMany({ where: { id, epoch: row.epoch, state: row.state, cleanupRequestedAt: null, leaseUntil: row.leaseUntil }, data: { state: "processing", epoch, attempts: { increment: 1 }, leaseUntil: leaseEnd(this.runtime.now()), failureCode: null, retryAt: null } });
      if (!claimed.count) return null;
      return { artifact: await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id } }), snapshot };
    });
    if (!intent) return false;
    // The requested old intent cannot change its immutable identity. Complete
    // its current replacement outside the transaction and its report lock.
    if ("replacementId" in intent) return this.generate(intent.replacementId);
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

  /** Under B's report lock. Source and projection must both validate before
   * a new exact-key intent is created. No artifact identity is ever rewritten. */
  private async requestSafeReplacement(tx: Tx, row: Artifact): Promise<string | null> {
    if (row.rendererVersion !== "v1") return null;
    const safe = { ...row, rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER };
    if (!await this.current(tx, safe)) return null;
    if (row.state !== "ready" && !row.cleanupRequestedAt) await this.retire(tx, row);
    const existing = await tx.diagnosticPdfArtifact.findFirst({ where: { reportId: row.reportId, locale: row.locale,
      rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER, cleanupRequestedAt: null } });
    if (existing) return existing.id;
    const latest = await tx.diagnosticPdfArtifact.findFirst({ where: { reportId: row.reportId, locale: row.locale }, orderBy: { generation: "desc" } });
    const id = this.runtime.id();
    await tx.diagnosticPdfArtifact.create({ data: { id, reportId: row.reportId, snapshotHash: row.snapshotHash, locale: row.locale,
      rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER, generation: (latest?.generation ?? 0) + 1,
      objectKey: `diagnostic-pdf/${row.reportId}/${id}.pdf` } });
    return id;
  }

  /** A ready issued copy is historical and remains byte-identical. Its source
   * projection no longer authorizes current delivery. Request a distinct exact
   * object; unfinished obsolete writes instead follow the existing lease cleanup. */
  private async replaceErasedLineage(): Promise<void> {
    for (const locale of ["tk", "ru", "en"]) {
      const candidates = await this.db.diagnosticPdfArtifact.findMany({ where: {
        rendererVersion: "v1", locale, report: { erasedAt: null,
          predecessor: { OR: [{ erasedAt: { not: null } }, { order: { erasedAt: { not: null } } }] },
          artifacts: { none: { locale, rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER, cleanupRequestedAt: null } } },
      }, orderBy: { id: "asc" }, take: 100 });
      for (const candidate of candidates) await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${candidate.reportId} FOR UPDATE`;
        const row = await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: candidate.id } });
        await this.requestSafeReplacement(tx, row);
      });
    }
  }

  async execute(): Promise<void> {
    if (!this.runtime.enabled()) return;
    const now = this.runtime.now();
    await this.replaceErasedLineage();
    // A crash on the last allowed attempt must become an honest terminal failure.
    await this.db.diagnosticPdfArtifact.updateMany({ where: { state: "processing", attempts: { gte: 5 }, cleanupRequestedAt: null, leaseUntil: { lte: now } }, data: { state: "failed", leaseUntil: null, retryAt: null, failureCode: "attempts_exhausted" } });
    const pending = await this.db.diagnosticPdfArtifact.findMany({ where: { cleanupRequestedAt: null, attempts: { lt: 5 }, OR: [{ state: "pending" }, { state: "failed", retryAt: { lte: now } }, { state: "processing", leaseUntil: { lte: now } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5 });
    let failed = false;
    for (const row of pending) try { await this.generate(row.id); } catch { failed = true; }
    await this.cleanup();
    if (failed) throw new Error("DIAGNOSTIC_ARTIFACT_RETRY");
  }

  private async expireUnattached(now: Date): Promise<void> {
    // Only unreferenced temporary uploads expire. A finding in any revision,
    // including an immutable predecessor, keeps its exact evidence bytes.
    const cutoff = new Date(now.getTime() - 86400_000);
    const candidates = await this.db.$queryRaw<{ id: string; reportId: string; orderId: string; epoch: string }[]>`
      SELECT e.id, e."reportId", r."orderId", e.epoch FROM diagnostic_evidence e
      JOIN diagnostic_reports r ON r.id=e."reportId"
      WHERE e.state='verified' AND e."cleanupRequestedAt" IS NULL AND e."verifiedAt"<=${cutoff}
      AND NOT EXISTS (SELECT 1 FROM diagnostic_reports refs,
        LATERAL jsonb_array_elements(COALESCE(refs.snapshot->'report'->'findings',refs.state->'findings','[]'::jsonb)) finding
        WHERE refs."orderId"=r."orderId" AND (finding->'evidenceIds') ? e.id)
      ORDER BY e."verifiedAt", e.id LIMIT 100`;
    for (const item of candidates) await this.db.$transaction(async tx => {
      // The same order/report lock order used by authoring fences late attachment.
      await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${item.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${item.reportId} FOR UPDATE`;
      const referenced = await tx.$queryRaw<{ id: string }[]>`
        SELECT refs.id FROM diagnostic_reports refs,
        LATERAL jsonb_array_elements(COALESCE(refs.snapshot->'report'->'findings',refs.state->'findings','[]'::jsonb)) finding
        WHERE refs."orderId"=${item.orderId} AND (finding->'evidenceIds') ? ${item.id} LIMIT 1`;
      if (referenced.length) return;
      await tx.diagnosticEvidence.updateMany({ where: { id: item.id, epoch: item.epoch, state: "verified", cleanupRequestedAt: null, verifiedAt: { lte: cutoff } }, data: { state: "cleanup_pending", cleanupRequestedAt: now } });
    });
  }

  /** Structured identity evidence has no reader TTL. Declared rights end its retention: with
   * no lawful hold representable in this synthetic slice, expiry fences and erases content in
   * place and bumps the visit's generation. Provenance follows its rights, abandoned intents
   * and verified items never attached to any evidence record use the upload lifecycle rule. */
  private async retireIdentity(now: Date): Promise<void> {
    // The proof's declared end is the shortest retained evidence/provenance right,
    // not a newly invented TTL. Delete the whole restricted payload and linkage.
    await this.db.$executeRaw`DELETE FROM diagnostic_continuity_proofs WHERE id IN
      (SELECT id FROM diagnostic_continuity_proofs WHERE "rightsUntil"<=${now}::timestamp ORDER BY "rightsUntil",id LIMIT 100)`;
    const cutoff = new Date(now.getTime() - 86400_000);
    const expired = await this.db.diagnosticIdentityEvidence.findMany({ where: { erasedAt: null, rightsUntil: { lte: now } }, orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100, select: { id: true, orderId: true } });
    for (const item of expired) await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${item.orderId} FOR UPDATE`;
      const erased = await tx.$executeRaw`UPDATE diagnostic_identity_evidence SET "observationHash"=NULL, identifiers=NULL, provenance=NULL, rights=NULL,
        explanation=NULL, "recordHash"=NULL, "erasedAt"=${now}::timestamp WHERE id=${item.id} AND "erasedAt" IS NULL AND "rightsUntil"<=${now}::timestamp`;
      if (erased) await tx.$executeRaw`UPDATE inspection_orders SET "identityEvidenceGeneration"="identityEvidenceGeneration"+1 WHERE id=${item.orderId}`;
    });
    await this.db.$executeRaw`UPDATE diagnostic_identity_provenance SET state='cleanup_pending', epoch=gen_random_uuid()::text, rights=NULL,
      "cleanupRequestedAt"=COALESCE("cleanupRequestedAt",${now}::timestamp), "erasedAt"=COALESCE("erasedAt",${now}::timestamp) WHERE "erasedAt" IS NULL AND "rightsUntil"<=${now}::timestamp`;
    await this.db.diagnosticIdentityProvenance.updateMany({ where: { state: "staged", cleanupRequestedAt: null, createdAt: { lte: cutoff }, OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, data: { state: "cleanup_pending", cleanupRequestedAt: now } });
    const attached = Prisma.sql`EXISTS (SELECT 1 FROM diagnostic_identity_evidence e, LATERAL jsonb_array_elements(COALESCE(e.provenance,'[]'::jsonb)) ref
      WHERE e."orderId"=p."orderId" AND ref->>'id'=p.id)`;
    const unattached = await this.db.$queryRaw<{ id: string; orderId: string; epoch: string }[]>`
      SELECT p.id, p."orderId", p.epoch FROM diagnostic_identity_provenance p WHERE p.state='verified' AND p."cleanupRequestedAt" IS NULL
      AND p."verifiedAt"<=${cutoff}::timestamp AND NOT ${attached} ORDER BY p."verifiedAt", p.id LIMIT 100`;
    for (const item of unattached) await this.db.$transaction(async tx => {
      // Capture holds the order lock while binding provenance; recheck under it.
      await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${item.orderId} FOR UPDATE`;
      const still = await tx.$queryRaw<{ id: string }[]>`SELECT p.id FROM diagnostic_identity_provenance p WHERE p.id=${item.id} AND NOT ${attached}`;
      if (still.length) await tx.diagnosticIdentityProvenance.updateMany({ where: { id: item.id, epoch: item.epoch, state: "verified", cleanupRequestedAt: null }, data: { state: "cleanup_pending", cleanupRequestedAt: now } });
    });
  }

  async cleanup(): Promise<number> {
    if (!this.runtime.enabled()) return 0;
    const now = this.runtime.now(); let completed = 0;
    await this.expireUnattached(now);
    await this.retireIdentity(now);
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
    const provenance = await this.db.diagnosticIdentityProvenance.findMany({ where: { cleanupRequestedAt: { not: null }, AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: now } }] }] }, orderBy: [{ cleanupCompletedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
    for (const item of provenance) {
      // An intent never bound to bytes has no object; a bound one names exactly one key.
      if (item.objectKey !== null && item.objectKey !== `diagnostic-evidence/${item.id}/${item.sha256}`) throw new Error("DIAGNOSTIC_CLEANUP_INVALID");
      const epoch = this.runtime.id();
      const claim = await this.db.diagnosticIdentityProvenance.updateMany({ where: { id: item.id, epoch: item.epoch, cleanupRequestedAt: { not: null }, AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: now } }] }] }, data: { epoch, state: "cleanup_pending", cleanupLeaseUntil: leaseEnd(now), cleanupAttempts: { increment: 1 } } });
      if (!claim.count) continue;
      try {
        if (item.objectKey) await this.objects.deleteAndVerify([item.objectKey]);
        completed += (await this.db.diagnosticIdentityProvenance.updateMany({ where: { id: item.id, epoch, state: "cleanup_pending" }, data: { state: "removed", cleanupCompletedAt: this.runtime.now(), cleanupLeaseUntil: null, cleanupFailureCode: null } })).count;
      } catch {
        await this.db.diagnosticIdentityProvenance.updateMany({ where: { id: item.id, epoch }, data: { cleanupFailureCode: "cleanup_storage", cleanupLeaseUntil: new Date(now.getTime() + 60_000) } });
        throw new Error("DIAGNOSTIC_CLEANUP_RETRY");
      }
    }
    // Completed exact intents remain in the rotation, catching paused writers that
    // resume after a previous delete. Never broaden authority to a bucket prefix.
    return completed;
  }
}
