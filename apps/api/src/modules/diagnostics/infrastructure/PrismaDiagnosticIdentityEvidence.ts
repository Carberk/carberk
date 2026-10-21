import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticIdentityEvidencePort } from "../domain/ports/DiagnosticIdentityEvidencePort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";
import { DiagnosticAuthority } from "./DiagnosticAuthority";

type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
type Provenance = Prisma.DiagnosticIdentityProvenanceGetPayload<object>;
type Evidence = Prisma.DiagnosticIdentityEvidenceGetPayload<{ include: { identityRecord: true } }>;
type Observation = D.DiagnosticComparisonIdentity["observation"];
// PostgreSQL JSONB can reorder object keys. Content identity must survive readback.
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
};
const denied = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const references = D.DiagnosticIdentityEvidenceSchema.shape.provenance;
const LEASE_MS = 120_000;
/** The exact object descriptor committed before any byte was written. */
const bound = (row: Provenance) => {
  if (!row.objectKey || !row.sha256 || !row.sizeBytes || !row.mime) throw denied();
  return { key: row.objectKey, sha256: row.sha256, sizeBytes: row.sizeBytes, mime: row.mime };
};

/** Classified provenance, exact private bytes and immutable structured evidence for one visit.
 * Every write holds the order lock, so captures, corrections, `/vehicle`, revocation and erasure
 * serialize there. Storage I/O stays outside transactions behind a durable intent, a bounded
 * write lease and an epoch recheck, as for report evidence. */
@Injectable()
export class PrismaDiagnosticIdentityEvidence implements DiagnosticIdentityEvidencePort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(DIAGNOSTIC_OBJECTS) private readonly objects: DiagnosticObjects,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  /** Declared rights are current only before their authorized end date. */
  private live(rights: Prisma.JsonValue | D.DiagnosticIdentityRights | null, until: Date): boolean {
    return until > this.runtime.now() && D.DiagnosticIdentityRightsSchema.safeParse(rights).success;
  }
  private retained(row: Provenance): boolean {
    return row.state === "verified" && !row.cleanupRequestedAt && !row.erasedAt && !!row.objectKey && this.live(row.rights, row.rightsUntil);
  }
  /** The existing observation-authoring role on an arrived, physically authorized visit. */
  private async capturer(tx: Tx, subject: DiagnosticSubject, orderId: string): Promise<Order> {
    const { row } = await this.authority.order(tx, subject, orderId, "diagnostics.technician");
    if (row.status !== "arrived" || !row.physicalAuthorization) throw denied();
    return row;
  }
  private async reader(tx: Tx, subject: DiagnosticSubject, orderId: string): Promise<Order> {
    const scope = await this.authority.staffed(tx, subject, orderId);
    if (!scope.staff) throw denied();
    return scope.row;
  }

  async stage(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticIdentityProvenanceStage): Promise<D.DiagnosticIdentityProvenanceStaged> {
    return this.db.$transaction(async tx => {
      const order = await this.capturer(tx, subject, orderId);
      const prior = await tx.diagnosticIdentityProvenance.findUnique({ where: { id: input.id } });
      if (prior) {
        if (prior.orderId !== orderId || prior.erasedAt || prior.cleanupRequestedAt || !this.live(prior.rights, prior.rightsUntil)) throw denied();
        if (prior.contentType !== input.contentType || prior.declaredSizeBytes !== input.sizeBytes || canonical(prior.rights) !== canonical(input.rights)) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_CONFLICT");
        return { id: prior.id, state: prior.state === "verified" ? "verified" : "staged" };
      }
      const rightsUntil = new Date(input.rights.schedule.until);
      // Classification is persisted before any byte is accepted; never manufactured.
      if (!this.live(input.rights, rightsUntil)) throw denied();
      if (order.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      if (await tx.diagnosticEvidence.findUnique({ where: { id: input.id } })) throw denied();
      if (await tx.diagnosticIdentityProvenance.count({ where: { orderId } }) >= 100) throw new DiagnosticRuleError("REPORT_EVIDENCE_LIMIT");
      await tx.diagnosticIdentityProvenance.create({ data: { id: input.id, orderId, contentType: input.contentType, declaredSizeBytes: input.sizeBytes,
        rights: json(input.rights), rightsUntil, createdById: subject.userId, createdAt: this.runtime.now() } });
      return { id: input.id, state: "staged" };
    });
  }
  private async writable(tx: Tx, subject: DiagnosticSubject, orderId: string, id: string, expectedOrderVersion?: number): Promise<Provenance> {
    const order = await this.capturer(tx, subject, orderId);
    await tx.$queryRaw`SELECT id FROM diagnostic_identity_provenance WHERE id=${id} FOR UPDATE`;
    const row = await tx.diagnosticIdentityProvenance.findUnique({ where: { id } });
    if (!row || row.orderId !== orderId || row.erasedAt || row.cleanupRequestedAt || !["staged", "verified"].includes(row.state) || !this.live(row.rights, row.rightsUntil)) throw denied();
    if (row.state === "staged" && expectedOrderVersion !== undefined && order.version !== expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
    return row;
  }
  private verified(row: Provenance): D.DiagnosticIdentityProvenance {
    return D.DiagnosticIdentityProvenanceSchema.parse({ id: row.id, state: "verified", mime: row.mime, sizeBytes: row.sizeBytes, sha256: row.sha256 });
  }
  async upload(subject: DiagnosticSubject, orderId: string, id: string, input: { expectedOrderVersion: number; mime: string; bytes: Uint8Array | null }) {
    const staged = await this.db.$transaction(tx => this.writable(tx, subject, orderId, id, input.expectedOrderVersion));
    if (!input.bytes || input.mime !== staged.contentType || input.bytes.byteLength !== staged.declaredSizeBytes) throw new DiagnosticRuleError("REPORT_EVIDENCE_INVALID");
    const clean = await this.objects.sanitize(input.bytes, input.mime);
    const hash = sha(clean.bytes);
    const intent = await this.db.$transaction(async tx => {
      const row = await this.writable(tx, subject, orderId, id, input.expectedOrderVersion);
      if (row.sha256 && (row.sha256 !== hash || row.sizeBytes !== clean.bytes.byteLength)) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_CONFLICT");
      if (row.state === "verified") return row;
      if (row.writeLeaseUntil && row.writeLeaseUntil > this.runtime.now()) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_BUSY");
      // Commit the exact object descriptor and write lease before any object write can occur.
      return tx.diagnosticIdentityProvenance.update({ where: { id }, data: { objectKey: `diagnostic-evidence/${id}/${hash}`, sha256: hash, sizeBytes: clean.bytes.byteLength,
        mime: clean.mime, epoch: this.runtime.id(), writeLeaseUntil: new Date(this.runtime.now().getTime() + LEASE_MS) } });
    });
    if (intent.state === "verified") return this.verified(intent);
    const leased = (row: Provenance) => row.epoch === intent.epoch && !!row.writeLeaseUntil && row.writeLeaseUntil > this.runtime.now();
    await this.db.$transaction(async tx => { if (!leased(await this.writable(tx, subject, orderId, id))) throw denied(); });
    const object = bound(intent);
    await this.objects.put(object.key, clean.bytes, clean.mime);
    await this.objects.read(object.key, object.sizeBytes, object.sha256);
    try {
      return await this.db.$transaction(async tx => {
        const row = await this.writable(tx, subject, orderId, id);
        if (!leased(row) || row.state !== "staged") throw denied();
        return this.verified(await tx.diagnosticIdentityProvenance.update({ where: { id }, data: { state: "verified", verifiedAt: this.runtime.now(), writeLeaseUntil: null } }));
      });
    } catch (error) {
      // A fenced partial object never becomes evidence; exact cleanup follows the write lease.
      await this.db.diagnosticIdentityProvenance.updateMany({ where: { id, epoch: intent.epoch, state: "staged" }, data: { state: "cleanup_pending", cleanupRequestedAt: this.runtime.now() } });
      throw error;
    }
  }
  /** Delivers retained bytes only while `authorize` admits them before and after storage I/O.
   * An authorized integrity/storage failure is a generic unavailable result, never upstream detail. */
  async deliver(id: string, authorize: (tx: Tx) => Promise<(row: Provenance) => boolean>): Promise<{ bytes: Uint8Array; mime: string }> {
    const readable = async (tx: Tx) => {
      const permitted = await authorize(tx);
      const row = await tx.diagnosticIdentityProvenance.findUnique({ where: { id } });
      if (!row || !permitted(row) || !this.retained(row)) throw denied();
      return row;
    };
    const row = await this.db.$transaction(readable);
    const object = bound(row);
    let bytes: Uint8Array | null = null;
    try { bytes = await this.objects.read(object.key, object.sizeBytes, object.sha256); } catch { bytes = null; }
    // Reauthorize after the asynchronous object read, immediately before delivery or failure.
    await this.db.$transaction(async tx => { if ((await readable(tx)).epoch !== row.epoch) throw denied(); });
    if (!bytes) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_UNAVAILABLE");
    return { bytes, mime: object.mime };
  }
  read(subject: DiagnosticSubject, orderId: string, id: string) {
    return this.deliver(id, async tx => { await this.reader(tx, subject, orderId); return row => row.orderId === orderId; });
  }

  private dto(row: Evidence): D.DiagnosticIdentityEvidence {
    return D.DiagnosticIdentityEvidenceSchema.parse({ id: row.id, orderId: row.orderId, orderVersion: row.orderVersion, identityRecordId: row.identityRecordId,
      observationHash: row.observationHash, observation: row.identityRecord.observation, identifiers: row.identifiers, provenance: row.provenance, rights: row.rights,
      correction: row.supersedesId ? { supersedesId: row.supersedesId, explanation: row.explanation } : null,
      recordHash: row.recordHash, recordedBy: row.recordedById, recordedAt: row.recordedAt.toISOString() });
  }
  /** Records in append order and the ids still permitted: retained content, current rights,
   * retained provenance and a permitted ancestor. No partial chain survives a missing ancestor. */
  private async graph(tx: Tx, orderId: string) {
    await tx.$queryRaw`SELECT id FROM diagnostic_identity_records WHERE "orderId"=${orderId} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM diagnostic_identity_evidence WHERE "orderId"=${orderId} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM diagnostic_identity_provenance WHERE "orderId"=${orderId} ORDER BY id FOR SHARE`;
    const records = await tx.diagnosticIdentityEvidence.findMany({ where: { orderId }, include: { identityRecord: true }, orderBy: { orderVersion: "asc" } });
    const provenance = new Map((await tx.diagnosticIdentityProvenance.findMany({ where: { orderId } })).map(row => [row.id, row]));
    const usable = new Set<string>();
    for (const record of records) {
      const items = references.safeParse(record.provenance);
      if (record.erasedAt || !record.recordHash || record.identityRecord.erasedAt || !this.live(record.rights, record.rightsUntil) || !items.success || !items.data.length ||
        items.data.some(item => { const held = provenance.get(item.id); return !held || !this.retained(held) || held.sha256 !== item.sha256; }) ||
        (record.supersedesId && !usable.has(record.supersedesId))) continue;
      usable.add(record.id);
    }
    return { records, usable };
  }
  async list(subject: DiagnosticSubject, orderId: string): Promise<D.DiagnosticIdentityEvidence[]> {
    return this.db.$transaction(async tx => {
      await this.reader(tx, subject, orderId);
      const { records, usable } = await this.graph(tx, orderId);
      return records.filter(record => usable.has(record.id)).map(record => this.dto(record));
    });
  }
  async append(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticIdentityEvidenceCapture): Promise<D.DiagnosticIdentityEvidence> {
    return this.db.$transaction(async tx => {
      const order = await this.capturer(tx, subject, orderId);
      const existing = await tx.diagnosticIdentityEvidence.findUnique({ where: { id: input.id }, include: { identityRecord: true } });
      // Retry recognition precedes stale-version rejection but never bypasses current rights or erasure.
      if (existing) {
        if (existing.orderId !== orderId || existing.erasedAt) throw denied();
        if (existing.identityRecordId !== input.identityRecordId || canonical(existing.identifiers) !== canonical(input.identifiers) || canonical(existing.rights) !== canonical(input.rights) ||
          existing.supersedesId !== (input.correction?.supersedesId ?? null) || existing.explanation !== (input.correction?.explanation ?? null)) throw new DiagnosticRuleError("DIAGNOSTIC_EVIDENCE_CONFLICT");
        if (!(await this.graph(tx, orderId)).usable.has(existing.id)) throw denied();
        return this.dto(existing);
      }
      const rightsUntil = new Date(input.rights.schedule.until);
      if (!this.live(input.rights, rightsUntil)) throw denied();
      const ids = [...new Set(input.identifiers.flatMap(item => item.provenanceIds))].sort();
      for (const id of ids) await tx.$queryRaw`SELECT id FROM diagnostic_identity_provenance WHERE id=${id} FOR SHARE`;
      const held = await tx.diagnosticIdentityProvenance.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
      if (held.length !== ids.length || held.some(row => row.orderId !== orderId || !this.retained(row))) throw denied();
      if (order.version !== input.expectedOrderVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const raw = await tx.diagnosticIdentityRecord.findUnique({ where: { id: input.identityRecordId } });
      if (!raw || raw.orderId !== orderId || raw.erasedAt || !raw.observationHash) throw denied();
      const current = await tx.diagnosticIdentityRecord.findFirst({ where: { orderId, erasedAt: null }, orderBy: { orderVersion: "desc" } });
      // The server never infers a correction: a root needs an observation with no structured evidence,
      // a correction names the retained current leaf and both bind the current raw observation.
      if (current?.id !== raw.id) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      if (!input.correction) {
        if (await tx.diagnosticIdentityEvidence.count({ where: { identityRecordId: raw.id } })) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      } else {
        const parent = await tx.diagnosticIdentityEvidence.findUnique({ where: { id: input.correction.supersedesId }, include: { successor: true } });
        if (!parent || parent.orderId !== orderId || parent.erasedAt) throw denied();
        if (parent.successor) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
        const { records, usable } = await this.graph(tx, orderId);
        if (!usable.has(parent.id)) throw denied();
        // A correction needs at least one supporting reference no earlier record used.
        const used = new Set(records.flatMap(record => { const items = references.safeParse(record.provenance); return items.success ? items.data.map(item => item.id) : []; }));
        if (ids.every(id => used.has(id))) throw denied();
      }
      const next = await tx.inspectionOrder.update({ where: { id: orderId }, data: { version: { increment: 1 }, identityEvidenceGeneration: { increment: 1 } } });
      const provenance = held.map(row => { const object = bound(row); return { id: row.id, sha256: object.sha256, mime: object.mime, sizeBytes: object.sizeBytes }; });
      const recordedAt = this.runtime.now();
      // Versioned fixed-order binding; object hashes bind the retained sanitized bytes.
      const recordHash = sha(canonical(["diagnostic-identity-evidence/v1", input.id, orderId, next.version, raw.id, raw.observationHash, input.identifiers,
        provenance, input.rights, input.correction, subject.userId, recordedAt.toISOString()]));
      const saved = await tx.diagnosticIdentityEvidence.create({ data: { id: input.id, orderId, orderVersion: next.version, identityRecordId: raw.id, observationHash: raw.observationHash,
        identifiers: json(input.identifiers), provenance: json(provenance), rights: json(input.rights), rightsUntil, supersedesId: input.correction?.supersedesId ?? null,
        explanation: input.correction?.explanation ?? null, recordHash, recordedById: subject.userId, recordedAt }, include: { identityRecord: true } });
      await tx.diagnosticAudit.create({ data: { id: this.runtime.id(), centerId: order.centerId, orderId, actorId: subject.userId,
        action: input.correction ? "IDENTITY_EVIDENCE_CORRECTED" : "IDENTITY_EVIDENCE_CAPTURED", details: {}, createdAt: recordedAt } });
      return this.dto(saved);
    });
  }

  /** Called under the order lock. The first-draft pin; the database guard selects identically. */
  leaf(tx: Tx, orderId: string) {
    return tx.diagnosticIdentityEvidence.findFirst({ where: { orderId, erasedAt: null, successor: { is: null } }, orderBy: { orderVersion: "desc" }, select: { id: true, recordHash: true } });
  }
  /** One comparison side, called under both order locks after current authority. A pin that is
   * missing, changed, expired or erased, or any unavailable record on its explicit correction
   * chain, refuses the whole comparison rather than showing a partial chain. */
  async identity(tx: Tx, order: Order, observation: Observation, pin: { id: string; hash: string } | null): Promise<{ identity: D.DiagnosticComparisonIdentity; provenance: string[] }> {
    const identity = { observation, evidence: null, corrections: [], evidenceGeneration: order.identityEvidenceGeneration, correctionHeadHash: null };
    if (!pin) return { identity, provenance: [] };
    const { records, usable } = await this.graph(tx, order.id);
    const pinned = records.find(record => record.id === pin.id);
    if (!pinned || pinned.recordHash !== pin.hash) throw denied();
    // Explicit supersedes edges only; the database guard keeps parents earlier and single-successor.
    const byId = new Map(records.map(record => [record.id, record]));
    const bySupersedes = new Map(records.flatMap(record => record.supersedesId ? [[record.supersedesId, record] as const] : []));
    const ancestors: Evidence[] = [];
    for (let parent = pinned.supersedesId; parent;) {
      const item = byId.get(parent);
      if (!item) throw denied();
      ancestors.unshift(item); parent = item.supersedesId;
    }
    const descendants: Evidence[] = [];
    for (let item = bySupersedes.get(pinned.id); item; item = bySupersedes.get(item.id)) descendants.push(item);
    const chain = [...ancestors, pinned, ...descendants];
    if (chain.some(record => !usable.has(record.id))) throw denied();
    return { identity: D.DiagnosticComparisonIdentitySchema.parse({ ...identity, evidence: this.dto(pinned), corrections: chain.filter(record => record !== pinned).map(record => this.dto(record)),
      correctionHeadHash: descendants.at(-1)?.recordHash ?? null }),
    provenance: chain.flatMap(record => references.parse(record.provenance).map(item => item.id)) };
  }
}
