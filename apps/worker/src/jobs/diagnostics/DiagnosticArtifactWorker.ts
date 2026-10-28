import { createHash } from "node:crypto";

import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { Prisma, diagnosticReaderProjection, DIAGNOSTIC_ERASED_LINEAGE_RENDERER, DIAGNOSTIC_PDF_RENDERERS, type PrismaService } from "@auto-tm/db";

import { renderDiagnosticPdf, type DiagnosticPdfFonts } from "./DiagnosticPdfRenderer";
import { DiagnosticWorkerPreparationChanged, workerOrdinary, workerPlannedRow, workerSource } from "./DiagnosticWorkerPreparation";

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
  private retirement() { return { state: "cleanup_pending", epoch: this.runtime.id(), cleanupRequestedAt: this.runtime.now() }; }

  private async pdfUpdate(where: Prisma.DiagnosticPdfArtifactWhereInput, data: Prisma.DiagnosticPdfArtifactUpdateManyMutationInput, eligible?: (tx: Tx) => Promise<boolean>): Promise<number> {
    return this.db.$transaction(async tx => {
      const row = await tx.diagnosticPdfArtifact.findFirst({ where });
      if (!row || (eligible && !await eligible(tx))) return 0;
      const plan = await workerPlannedRow(tx, { table: "diagnostic_pdf_artifacts", key: { id: row.id } }, data);
      return workerOrdinary(tx, [plan], async () => {
        if (eligible && !await eligible(tx)) return 0;
        return (await tx.diagnosticPdfArtifact.updateMany({ where: { AND: [where, { id: row.id, epoch: row.epoch }] }, data })).count;
      });
    }).catch((error: unknown) => { if (error instanceof DiagnosticWorkerPreparationChanged) return 0; throw error; });
  }

  private async evidenceUpdate(where: Prisma.DiagnosticEvidenceWhereInput, data: Prisma.DiagnosticEvidenceUpdateManyMutationInput, eligible?: (tx: Tx) => Promise<boolean>): Promise<number> {
    return this.db.$transaction(async tx => {
      const row = await tx.diagnosticEvidence.findFirst({ where });
      if (!row || (eligible && !await eligible(tx))) return 0;
      const plan = await workerPlannedRow(tx, { table: "diagnostic_evidence", key: { id: row.id } }, data);
      return workerOrdinary(tx, [plan], async () => {
        if (eligible && !await eligible(tx)) return 0;
        return (await tx.diagnosticEvidence.updateMany({ where: { AND: [where, { id: row.id, epoch: row.epoch }] }, data })).count;
      });
    }).catch((error: unknown) => { if (error instanceof DiagnosticWorkerPreparationChanged) return 0; throw error; });
  }

  private async provenanceUpdate(where: Prisma.DiagnosticIdentityProvenanceWhereInput,
    change: (row: Prisma.DiagnosticIdentityProvenanceGetPayload<object>) => Prisma.DiagnosticIdentityProvenanceUpdateManyMutationInput,
    eligible?: (tx: Tx) => Promise<boolean>): Promise<number> {
    return this.db.$transaction(async tx => {
      const row = await tx.diagnosticIdentityProvenance.findFirst({ where });
      if (!row || (eligible && !await eligible(tx))) return 0;
      const data = change(row);
      const plan = await workerPlannedRow(tx, { table: "diagnostic_identity_provenance", key: { id: row.id } }, data);
      const work = async () => {
        if (eligible && !await eligible(tx)) throw new DiagnosticWorkerPreparationChanged();
        const result = await tx.diagnosticIdentityProvenance.updateMany({ where: { AND: [where, { id: row.id, epoch: row.epoch }] }, data });
        if (result.count !== 1) throw new DiagnosticWorkerPreparationChanged();
        return result.count;
      };
      const scalar = Object.keys(data).every(key => ["writeLeaseUntil", "cleanupLeaseUntil", "cleanupAttempts", "cleanupFailureCode"].includes(key));
      return scalar ? workerOrdinary(tx, [plan], work) : workerSource(tx, "identity_material_change", [plan], this.runtime.now(), work);
    }).catch((error: unknown) => { if (error instanceof DiagnosticWorkerPreparationChanged) return 0; throw error; });
  }

  /** Planning and adoption use separate native transactions, with no rendering or
   * storage under their prefix. Select the complete transition before locking. */
  private async advance(artifact: Artifact, descriptor?: { sha256: string; sizeBytes: number }): Promise<boolean> {
    return this.db.$transaction(async tx => {
      const row = await tx.diagnosticPdfArtifact.findUnique({ where: { id: artifact.id } });
      const live = (value: Artifact | null): value is Artifact => !!value && value.state === "processing" && value.epoch === artifact.epoch &&
        !!value.leaseUntil && value.leaseUntil > this.runtime.now() && !value.cleanupRequestedAt && value.objectKey === artifact.objectKey && value.snapshotHash === artifact.snapshotHash;
      if (!live(row)) return false;
      const current = await this.current(tx, row);
      if (current && descriptor && ((row.sha256 && row.sha256 !== descriptor.sha256) || (row.sizeBytes && row.sizeBytes !== descriptor.sizeBytes))) throw new Error("DIAGNOSTIC_PDF_GENERATION_CONFLICT");
      const data = !current ? this.retirement() : descriptor ?? { state: "ready", verifiedAt: this.runtime.now(), leaseUntil: null, failureCode: null };
      const plan = await workerPlannedRow(tx, { table: "diagnostic_pdf_artifacts", key: { id: row.id } }, data);
      return workerOrdinary(tx, [plan], async () => {
        await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${row.reportId} FOR UPDATE`;
        const checked = await tx.diagnosticPdfArtifact.findUnique({ where: { id: row.id } });
        if (!live(checked) || !!(await this.current(tx, checked)) !== !!current) return false;
        const written = await tx.diagnosticPdfArtifact.updateMany({ where: { id: row.id, epoch: row.epoch, state: "processing", cleanupRequestedAt: null, leaseUntil: { gt: this.runtime.now() } }, data });
        return !!current && written.count === 1;
      });
    }).catch((error: unknown) => { if (error instanceof DiagnosticWorkerPreparationChanged) return false; throw error; });
  }
  async generate(id: string): Promise<boolean> {
    if (!this.runtime.enabled()) return false;
    const intent = await this.db.$transaction(async tx => {
      const candidate = await tx.diagnosticPdfArtifact.findUnique({ where: { id } });
      if (!candidate || !available(candidate, this.runtime.now()) || !DIAGNOSTIC_PDF_RENDERERS.includes(candidate.rendererVersion) || !["tk", "ru", "en"].includes(candidate.locale) ||
        candidate.objectKey !== `diagnostic-pdf/${candidate.reportId}/${candidate.id}.pdf`) return null;
      const snapshot = await this.current(tx, candidate);
      if (!snapshot) {
        const replacementId = await this.requestSafeReplacement(tx, candidate, true);
        if (replacementId) return { replacementId };
        return null;
      }
      const epoch = this.runtime.id();
      const data = { state: "processing", epoch, attempts: candidate.attempts + 1, leaseUntil: leaseEnd(this.runtime.now()), failureCode: null, retryAt: null };
      const plan = await workerPlannedRow(tx, { table: "diagnostic_pdf_artifacts", key: { id } }, data);
      return workerOrdinary(tx, [plan], async () => {
        await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${candidate.reportId} FOR UPDATE`;
        const row = await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id } });
        if (!available(row, this.runtime.now())) return null;
        const checked = await this.current(tx, row);
        if (!checked) return null;
        const claimed = await tx.diagnosticPdfArtifact.updateMany({ where: { id, epoch: row.epoch, state: row.state, cleanupRequestedAt: null, leaseUntil: row.leaseUntil }, data });
        if (!claimed.count) return null;
        return { artifact: await tx.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id } }), snapshot: checked };
      });
    }).catch((error: unknown) => { if (error instanceof DiagnosticWorkerPreparationChanged) return null; throw error; });
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
      const planned = await this.advance(artifact, { sha256: digest, sizeBytes: size });
      if (!planned) return false;
      // The exact write plan is durable before any network mutation starts.
      if (!artifact.sha256 || !artifact.sizeBytes) await this.objects.put(artifact.objectKey, bytes, "application/pdf");
      else {
        try { await this.objects.read(artifact.objectKey, size, digest); }
        catch (error) { if (!missing(error)) throw error; await this.objects.put(artifact.objectKey, bytes, "application/pdf"); }
      }
      await this.objects.read(artifact.objectKey, size, digest);
      return await this.advance(artifact);
    } catch {
      await this.pdfUpdate({ id, epoch: artifact.epoch, state: "processing", cleanupRequestedAt: null },
        { state: "failed", leaseUntil: null, failureCode: "storage_or_render", retryAt: artifact.attempts < 5 ? new Date(this.runtime.now().getTime() + Math.min(3600_000, 30_000 * 2 ** artifact.attempts)) : null });
      throw new Error("DIAGNOSTIC_ARTIFACT_RETRY");
    }
  }

  /** Allocate every absent identity and retirement tuple before the report/FK
   * locks. A ready issued copy and its immutable bytes remain historical. */
  private async requestSafeReplacement(tx: Tx, row: Artifact, retireObsolete = false): Promise<string | null> {
    const safe = { ...row, rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER };
    const eligible = row.rendererVersion === "v1" && !!await this.current(tx, safe);
    const existing = eligible ? await tx.diagnosticPdfArtifact.findFirst({ where: { reportId: row.reportId, locale: row.locale,
      rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER, cleanupRequestedAt: null } }) : null;
    const latest = eligible && !existing ? await tx.diagnosticPdfArtifact.findFirst({ where: { reportId: row.reportId, locale: row.locale }, orderBy: { generation: "desc" } }) : null;
    const retire = !row.cleanupRequestedAt && row.state !== "ready" && (eligible || retireObsolete) ? this.retirement() : null;
    const id = this.runtime.id();
    const fresh = eligible && !existing ? { id, reportId: row.reportId, snapshotHash: row.snapshotHash, locale: row.locale,
      rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER, generation: (latest?.generation ?? 0) + 1, epoch: this.runtime.id(),
      objectKey: `diagnostic-pdf/${row.reportId}/${id}.pdf`, state: "pending", attempts: 0, retryAt: null, failureCode: null,
      leaseUntil: null, sha256: null, sizeBytes: null, verifiedAt: null, cleanupRequestedAt: null, cleanupCompletedAt: null, createdAt: this.runtime.now() } : null;
    if (!retire && !fresh) return existing?.id ?? null;
    const plans = [];
    if (retire) plans.push(await workerPlannedRow(tx, { table: "diagnostic_pdf_artifacts", key: { id: row.id } }, retire));
    if (fresh) plans.push(await workerPlannedRow(tx, { table: "diagnostic_pdf_artifacts", key: { id } }, fresh, true));
    return workerOrdinary(tx, plans, async () => {
      await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${row.reportId} FOR UPDATE`;
      if (eligible !== (row.rendererVersion === "v1" && !!await this.current(tx, safe))) return null;
      if (retire) await tx.diagnosticPdfArtifact.updateMany({ where: { id: row.id, epoch: row.epoch }, data: retire });
      if (fresh) await tx.diagnosticPdfArtifact.create({ data: fresh });
      return fresh?.id ?? existing?.id ?? null;
    }, [{ table: "diagnostic_reports", key: { id: row.reportId } }]);
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
    const exhausted = await this.db.diagnosticPdfArtifact.findMany({ where: { state: "processing", attempts: { gte: 5 }, cleanupRequestedAt: null, leaseUntil: { lte: now } }, orderBy: { id: "asc" }, take: 100 });
    for (const item of exhausted) await this.pdfUpdate({ id: item.id, epoch: item.epoch, state: "processing", attempts: { gte: 5 }, cleanupRequestedAt: null, leaseUntil: { lte: this.runtime.now() } },
      { state: "failed", leaseUntil: null, retryAt: null, failureCode: "attempts_exhausted" });
    const eligible: Prisma.DiagnosticPdfArtifactWhereInput = { cleanupRequestedAt: null, attempts: { lt: 5 }, OR: [{ state: "pending" }, { state: "failed", retryAt: { lte: now } }, { state: "processing", leaseUntil: { lte: now } }] };
    // A newly discovered safe replacement must advance even behind older release
    // work. Reserve one of the existing five slots, leaving at least four FIFO
    // slots for all work so neither class can starve the other. Claims still
    // recheck eligibility and current projection under the report lock.
    const replacement = await this.db.diagnosticPdfArtifact.findFirst({ where: { ...eligible, rendererVersion: DIAGNOSTIC_ERASED_LINEAGE_RENDERER }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const pending = await this.db.diagnosticPdfArtifact.findMany({ where: { ...eligible, ...(replacement ? { id: { not: replacement.id } } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: replacement ? 4 : 5 });
    if (replacement) pending.unshift(replacement);
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
      const referenced = () => tx.$queryRaw<{ id: string }[]>`
        SELECT refs.id FROM diagnostic_reports refs,
        LATERAL jsonb_array_elements(COALESCE(refs.snapshot->'report'->'findings',refs.state->'findings','[]'::jsonb)) finding
        WHERE refs."orderId"=${item.orderId} AND (finding->'evidenceIds') ? ${item.id} LIMIT 1`;
      const where = { id: item.id, epoch: item.epoch, state: "verified", cleanupRequestedAt: null, verifiedAt: { lte: cutoff } };
      if (!await tx.diagnosticEvidence.findFirst({ where }) || (await referenced()).length) return;
      const data = { state: "cleanup_pending", cleanupRequestedAt: now };
      const plan = await workerPlannedRow(tx, { table: "diagnostic_evidence", key: { id: item.id } }, data);
      await workerOrdinary(tx, [plan], async () => {
        // The complete prefix precedes the original attachment-fencing locks.
        await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${item.orderId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${item.reportId} FOR UPDATE`;
        if ((await referenced()).length) return;
        await tx.diagnosticEvidence.updateMany({ where, data });
      });
    });
  }

  /** Structured identity evidence has no reader TTL. Declared rights end its retention: with
   * no lawful hold representable in this synthetic slice, expiry fences and erases content in
   * place and bumps the visit's generation. Provenance follows its rights, abandoned intents
   * and verified items never attached to any evidence record use the upload lifecycle rule. */
  private async retireIdentity(now: Date): Promise<void> {
    // Freeze the bounded request selection before any actor/order lock. Session
    // linkage is reread after source preparation; the disposer must not reselect.
    await this.db.$transaction(async tx => {
      const requests = await tx.$queryRaw<{ id: string }[]>`SELECT q.id FROM diagnostic_continuity_requests q
        JOIN sessions s ON s.id=q."sessionId" WHERE s."expiresAt"<=${now}::timestamp ORDER BY q.id LIMIT 100`;
      if (!requests.length) return;
      const plans = [];
      for (const row of requests) plans.push(await workerPlannedRow(tx, { table: "diagnostic_continuity_requests", key: { id: row.id } }, null));
      await workerSource(tx, "proof_expire", plans, now, async () => {
        const removed = await tx.$executeRaw`DELETE FROM diagnostic_continuity_requests q USING sessions s
          WHERE q.id IN (${Prisma.join(requests.map(row => row.id))}) AND s.id=q."sessionId" AND s."expiresAt"<=${now}::timestamp`;
        if (removed !== requests.length) throw new DiagnosticWorkerPreparationChanged();
      });
    });
    // Grants and independent components have separate finite source commands.
    // A full grant batch must not suppress an independently due component batch.
    await this.db.$transaction(async tx => {
      const grants = await tx.diagnosticOwnershipGrant.findMany({ where: { state: "available", rightsUntil: { lte: now } }, orderBy: { id: "asc" }, take: 100 });
      if (!grants.length) return;
      const grantPatch = { state: "erased", listingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null, membershipId: null,
        grantorId: null, grantorMembershipId: null, sessionId: null, rights: null, rightsUntil: null, declaredAt: null, erasedAt: now };
      const plans = [];
      const scopes: { scope: unknown }[][] = [];
      const scope = (id: string) => tx.$queryRaw<{ scope: unknown }[]>`SELECT diagnostic_ownership_disposal_scope(NULL::text,${now}::timestamp,${id}::text) AS scope`;
      for (const row of grants) {
        plans.push(await workerPlannedRow(tx, { table: "diagnostic_ownership_grants", key: { id: row.id } }, grantPatch));
        scopes.push(await scope(row.id));
      }
      await workerSource(tx, "ownership_expire", plans, now, async () => {
        // Revalidate the whole union before any of our own effects shrink its graph.
        for (const [index, row] of grants.entries()) if (JSON.stringify(await scope(row.id)) !== JSON.stringify(scopes[index])) throw new DiagnosticWorkerPreparationChanged();
        for (const row of grants) await tx.$queryRaw`SELECT diagnostic_dispose_ownership_scope(NULL::text,${now}::timestamp,${row.id}::text)`;
      });
    });
    await this.db.$transaction(async tx => {
      const components = await tx.diagnosticOwnershipComponent.findMany({ where: { state: "available", rightsUntil: { lte: now } }, orderBy: { identityRecordId: "asc" }, take: 100 });
      if (!components.length) return;
      const componentPatch = { state: "erased", grantId: null, scope: null, sourceListingId: null, identityDigest: null, sellerId: null, commissionerId: null,
        businessId: null, membershipId: null, rights: null, rightsUntil: null, declaredById: null, declaredAt: null, erasedAt: now };
      const plans = [];
      for (const row of components) plans.push(await workerPlannedRow(tx, { table: "diagnostic_ownership_components", key: { identityRecordId: row.identityRecordId } }, componentPatch));
      await workerSource(tx, "ownership_expire", plans, now, async () => {
        await tx.$queryRaw`SELECT diagnostic_dispose_ownership_components(ARRAY[${Prisma.join(components.map(row => row.identityRecordId))}]::text[],${now}::timestamp)`;
      });
    });
    // A proof's end is the shortest declared retained material right, not a TTL.
    await this.db.$transaction(async tx => {
      const proofs = await tx.diagnosticContinuityProof.findMany({ where: { rightsUntil: { lte: now } }, orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100 });
      if (!proofs.length) return;
      const plans = [];
      for (const row of proofs) plans.push(await workerPlannedRow(tx, { table: "diagnostic_continuity_proofs", key: { id: row.id } }, null));
      await workerSource(tx, "proof_expire", plans, now, async () => {
        const removed = await tx.$executeRaw`DELETE FROM diagnostic_continuity_proofs WHERE id IN (${Prisma.join(proofs.map(row => row.id))}) AND "rightsUntil"<=${now}::timestamp`;
        if (removed !== proofs.length) throw new DiagnosticWorkerPreparationChanged();
      });
    });
    const cutoff = new Date(now.getTime() - 86400_000);
    const expired = await this.db.diagnosticIdentityEvidence.findMany({ where: { erasedAt: null, rightsUntil: { lte: now } }, orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100 });
    for (const item of expired) await this.db.$transaction(async tx => {
      const where = { id: item.id, erasedAt: null, rightsUntil: { lte: now } };
      const evidence = await tx.diagnosticIdentityEvidence.findFirst({ where });
      if (!evidence) return;
      const order = await tx.inspectionOrder.findUniqueOrThrow({ where: { id: evidence.orderId } });
      const patch = { observationHash: null, identifiers: null, provenance: null, rights: null, explanation: null, recordHash: null, erasedAt: now };
      const generation = order.identityEvidenceGeneration + 1;
      const plans = [await workerPlannedRow(tx, { table: "diagnostic_identity_evidence", key: { id: evidence.id } }, patch),
        await workerPlannedRow(tx, { table: "inspection_orders", key: { id: order.id } }, { identityEvidenceGeneration: generation })];
      await workerSource(tx, "identity_material_change", plans, now, async () => {
        await tx.$queryRaw`SELECT id FROM inspection_orders WHERE id=${order.id} FOR UPDATE`;
        const removed = await tx.$executeRaw`UPDATE diagnostic_identity_evidence SET "observationHash"=NULL, identifiers=NULL, provenance=NULL, rights=NULL,
          explanation=NULL, "recordHash"=NULL, "erasedAt"=${now}::timestamp WHERE id=${evidence.id} AND "erasedAt" IS NULL AND "rightsUntil"<=${now}::timestamp`;
        if (removed !== 1) throw new DiagnosticWorkerPreparationChanged();
        await tx.$executeRaw`UPDATE inspection_orders SET "identityEvidenceGeneration"=${generation} WHERE id=${order.id}`;
      });
    });
    const rights = await this.db.diagnosticIdentityProvenance.findMany({ where: { erasedAt: null, rightsUntil: { lte: now } }, orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100 });
    for (const row of rights) await this.provenanceUpdate({ id: row.id, epoch: row.epoch, erasedAt: null, rightsUntil: { lte: now } }, current => ({
      state: "cleanup_pending", epoch: this.runtime.id(), rights: Prisma.DbNull, cleanupRequestedAt: current.cleanupRequestedAt ?? now, erasedAt: current.erasedAt ?? now,
    }));
    const staged = await this.db.diagnosticIdentityProvenance.findMany({ where: { state: "staged", cleanupRequestedAt: null, createdAt: { lte: cutoff },
      OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
    for (const row of staged) await this.provenanceUpdate({ id: row.id, epoch: row.epoch, state: "staged", cleanupRequestedAt: null, createdAt: { lte: cutoff },
      OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: this.runtime.now() } }] }, () => ({ state: "cleanup_pending", cleanupRequestedAt: now }));
    const attached = Prisma.sql`EXISTS (SELECT 1 FROM diagnostic_identity_evidence e, LATERAL jsonb_array_elements(COALESCE(e.provenance,'[]'::jsonb)) ref
      WHERE e."orderId"=p."orderId" AND ref->>'id'=p.id)`;
    const unattached = await this.db.$queryRaw<{ id: string; orderId: string; epoch: string }[]>`
      SELECT p.id, p."orderId", p.epoch FROM diagnostic_identity_provenance p WHERE p.state='verified' AND p."cleanupRequestedAt" IS NULL
      AND p."verifiedAt"<=${cutoff}::timestamp AND NOT ${attached} ORDER BY p."verifiedAt", p.id LIMIT 100`;
    for (const item of unattached) await this.provenanceUpdate({ id: item.id, epoch: item.epoch, state: "verified", cleanupRequestedAt: null, verifiedAt: { lte: cutoff } },
      () => ({ state: "cleanup_pending", cleanupRequestedAt: now }), async tx => {
        const still = await tx.$queryRaw<{ id: string }[]>`SELECT p.id FROM diagnostic_identity_provenance p WHERE p.id=${item.id} AND NOT ${attached}`;
        return still.length === 1;
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
      const eligible = async (tx: Tx) => {
        const current = await tx.diagnosticReportRecord.findUnique({ where: { id: report.id }, include: { order: true } });
        return !!current && (!!current.erasedAt || !!current.order.erasedAt || (current.audience === "buyer_private" && !current.order.commissionerId));
      };
      const pdfs = await this.db.diagnosticPdfArtifact.findMany({ where: { reportId: report.id, cleanupRequestedAt: null }, orderBy: { id: "asc" } });
      for (const item of pdfs) await this.pdfUpdate({ id: item.id, epoch: item.epoch, reportId: report.id, cleanupRequestedAt: null }, { state: "cleanup_pending", cleanupRequestedAt: now }, eligible);
      const children = await this.db.diagnosticEvidence.findMany({ where: { reportId: report.id, cleanupRequestedAt: null }, orderBy: { id: "asc" } });
      for (const item of children) await this.evidenceUpdate({ id: item.id, epoch: item.epoch, reportId: report.id, cleanupRequestedAt: null }, { state: "cleanup_pending", cleanupRequestedAt: now }, eligible);
    }
    // An unfinished staging attempt is temporary upload data, not a retained report.
    const stale = await this.db.diagnosticEvidence.findMany({ where: { state: "staged", cleanupRequestedAt: null, createdAt: { lte: new Date(now.getTime() - 86400_000) }, OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, select: { id: true } });
    for (const item of stale) await this.evidenceUpdate({ id: item.id, state: "staged", cleanupRequestedAt: null, createdAt: { lte: new Date(now.getTime() - 86400_000) },
      OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: this.runtime.now() } }] }, { state: "cleanup_pending", cleanupRequestedAt: now });
    const artifacts = await this.db.diagnosticPdfArtifact.findMany({ where: { cleanupRequestedAt: { not: null }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: [{ cleanupCompletedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
    for (const item of artifacts) {
      if (item.objectKey !== `diagnostic-pdf/${item.reportId}/${item.id}.pdf`) throw new Error("DIAGNOSTIC_CLEANUP_INVALID");
      const epoch = this.runtime.id();
      const claim = await this.pdfUpdate({ id: item.id, epoch: item.epoch, objectKey: item.objectKey, sha256: item.sha256, sizeBytes: item.sizeBytes,
        cleanupRequestedAt: { not: null }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: this.runtime.now() } }] }, { epoch, state: "cleanup_pending", leaseUntil: leaseEnd(this.runtime.now()) });
      if (!claim) continue;
      try {
        await this.objects.deleteAndVerify([item.objectKey]);
        completed += await this.pdfUpdate({ id: item.id, epoch, state: "cleanup_pending" }, { state: "removed", cleanupCompletedAt: this.runtime.now(), leaseUntil: null, failureCode: null });
      } catch {
        await this.pdfUpdate({ id: item.id, epoch }, { failureCode: "cleanup_storage", leaseUntil: new Date(now.getTime() + 60_000) });
        throw new Error("DIAGNOSTIC_CLEANUP_RETRY");
      }
    }
    const evidence = await this.db.diagnosticEvidence.findMany({ where: { cleanupRequestedAt: { not: null }, AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: now } }] }] }, orderBy: [{ cleanupCompletedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
    for (const item of evidence) {
      if (item.objectKey !== `diagnostic-evidence/${item.id}/${item.sha256}`) throw new Error("DIAGNOSTIC_CLEANUP_INVALID");
      const epoch = this.runtime.id();
      const claim = await this.evidenceUpdate({ id: item.id, epoch: item.epoch, objectKey: item.objectKey, sha256: item.sha256, sizeBytes: item.sizeBytes, cleanupRequestedAt: { not: null },
        AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: this.runtime.now() } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: this.runtime.now() } }] }] },
        { epoch, state: "cleanup_pending", cleanupLeaseUntil: leaseEnd(this.runtime.now()), cleanupAttempts: item.cleanupAttempts + 1 });
      if (!claim) continue;
      try {
        await this.objects.deleteAndVerify([item.objectKey]);
        completed += await this.evidenceUpdate({ id: item.id, epoch, state: "cleanup_pending" }, { state: "removed", cleanupCompletedAt: this.runtime.now(), cleanupLeaseUntil: null, cleanupFailureCode: null });
      } catch {
        await this.evidenceUpdate({ id: item.id, epoch }, { cleanupFailureCode: "cleanup_storage", cleanupLeaseUntil: new Date(now.getTime() + 60_000) });
        throw new Error("DIAGNOSTIC_CLEANUP_RETRY");
      }
    }
    const provenance = await this.db.diagnosticIdentityProvenance.findMany({ where: { cleanupRequestedAt: { not: null }, AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: now } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: now } }] }] }, orderBy: [{ cleanupCompletedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 100 });
    for (const item of provenance) {
      // An intent never bound to bytes has no object; a bound one names exactly one key.
      if (item.objectKey !== null && item.objectKey !== `diagnostic-evidence/${item.id}/${item.sha256}`) throw new Error("DIAGNOSTIC_CLEANUP_INVALID");
      const epoch = this.runtime.id();
      const claim = await this.provenanceUpdate({ id: item.id, epoch: item.epoch, objectKey: item.objectKey, sha256: item.sha256, sizeBytes: item.sizeBytes, cleanupRequestedAt: { not: null },
        AND: [{ OR: [{ writeLeaseUntil: null }, { writeLeaseUntil: { lte: this.runtime.now() } }] }, { OR: [{ cleanupLeaseUntil: null }, { cleanupLeaseUntil: { lte: this.runtime.now() } }] }] },
        current => ({ epoch, state: "cleanup_pending", cleanupLeaseUntil: leaseEnd(this.runtime.now()), cleanupAttempts: current.cleanupAttempts + 1 }));
      if (!claim) continue;
      try {
        if (item.objectKey) await this.objects.deleteAndVerify([item.objectKey]);
        completed += await this.provenanceUpdate({ id: item.id, epoch, state: "cleanup_pending" }, () => ({ state: "removed", cleanupCompletedAt: this.runtime.now(), cleanupLeaseUntil: null, cleanupFailureCode: null }));
      } catch {
        await this.provenanceUpdate({ id: item.id, epoch }, () => ({ cleanupFailureCode: "cleanup_storage", cleanupLeaseUntil: new Date(now.getTime() + 60_000) }));
        throw new Error("DIAGNOSTIC_CLEANUP_RETRY");
      }
    }
    // Completed exact intents remain in the rotation, catching paused writers that
    // resume after a previous delete. Never broaden authority to a bucket prefix.
    return completed;
  }
}
